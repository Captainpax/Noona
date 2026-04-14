# Moon Discord Onboarding Message

## What It Is

- The onboarding message editor lives on Moon's Discord settings view in
  [../../../services/moon/src/components/noona/SettingsPage.tsx](../../../services/moon/src/components/noona/SettingsPage.tsx).
- It stores a reusable welcome template, the Discord channel id Portal should use for real guild-member join posts,
  and the public Discord invite URL the signed-in home page uses for support links.
- Moon still renders a local preview and lets the admin copy that rendered preview, but the saved template is now a
  live Portal behavior contract rather than copy-only helper text.

## Ownership Split

- Moon owns the textarea, channel-id input, channel quick-picks, placeholder cards, rendered preview, reload/save
  buttons, the send-test action, and clipboard copy behavior in
  [../../../services/moon/src/components/noona/SettingsPage.tsx](../../../services/moon/src/components/noona/SettingsPage.tsx).
- Moon proxies GET and PUT through
  [../../../services/moon/src/app/api/noona/settings/discord/onboarding-message/route.ts](../../../services/moon/src/app/api/noona/settings/discord/onboarding-message/route.ts),
  which forwards the request to Sage with the current `noona_session` auth headers.
- Moon proxies onboarding test sends through
  [../../../services/moon/src/app/api/noona/settings/discord/onboarding-message/test/route.ts](../../../services/moon/src/app/api/noona/settings/discord/onboarding-message/test/route.ts),
  which forwards the current draft `channelId` and rendered preview text to Sage with the same admin auth headers.
- Moon also exposes the signed-in safe invite lookup through
  [../../../services/moon/src/app/api/noona/discord/invite/route.ts](../../../services/moon/src/app/api/noona/discord/invite/route.ts),
  which forwards to Sage and only returns the public invite URL payload the home page needs.
- Sage owns persistence, admin gating after setup completion, default seeding, and validation in
  [../../../services/sage/routes/registerSettingsRoutes.mjs](../../../services/sage/routes/registerSettingsRoutes.mjs)
  and [../../../services/sage/app/createSageApp.mjs](../../../services/sage/app/createSageApp.mjs).
- The stored settings document key is `discord.onboarding_message`.
- Vault Mongo is the durable backing store.
  If Vault Mongo is unavailable, Sage returns `503` for both reads and writes.
- Portal reads that same Mongo-backed settings document at runtime through
  [../../../services/portal/clients/vaultClient.mjs](../../../services/portal/clients/vaultClient.mjs) and posts the
  rendered message when Discord reports `GuildMemberAdd`.

## Default And Persistence

- Sage seeds the default template during `ensureDefaultSettings()` on the first successful admin persistence in
  [../../../services/sage/app/createSageApp.mjs](../../../services/sage/app/createSageApp.mjs).
- Current stored shape is:
  `key`
  `template`
  `channelId`
  `inviteUrl`
  `updatedAt`
- Writes require a non-empty trimmed `template`.
  Moon rejects empty saves client-side first, and Sage repeats that validation server-side as a backstop.
- `channelId` may be blank, but Portal only sends the onboarding post when both `template` and `channelId` are
  configured.
- `inviteUrl` falls back to Noona's default Discord invite when the stored value is blank or invalid.
- Moon displays the returned `updatedAt` value in the settings card header.
- Current contract is covered in
  [../../../services/sage/tests/sageApp.test.mjs](../../../services/sage/tests/sageApp.test.mjs) and
  [../../../services/portal/tests/portalRuntime.test.mjs](../../../services/portal/tests/portalRuntime.test.mjs),
  including the seeded default, `channelId` persistence, empty-template rejection, post-setup admin gating, and
  join-triggered send behavior.

## Preview And Placeholder Resolution

- Supported placeholders are:
  `{user_mention}`,
  `{guild_name}`,
  `{guild_id}`,
  `{moon_url}`,
  `{kavita_url}`,
  `{server_ip}`
- If the saved template omits `{user_mention}`, Portal prepends the new member mention automatically before sending the
  message to Discord.
- `{guild_name}` comes from the latest successful Discord validation result in the current browser session.
  It is not loaded from persisted settings.
- `{guild_id}` comes from the current Portal `DISCORD_GUILD_ID` editor value.
- `{moon_url}` comes from Moon's published `hostServiceUrl` in the loaded service catalog or config state.
- `{kavita_url}` prefers Portal's `KAVITA_EXTERNAL_URL` draft and otherwise falls back to Kavita's published
  `hostServiceUrl`.
- `{server_ip}` comes from the Warden `SERVER_IP` editor value.
- Preview resolution is browser-local in
  [../../../services/moon/src/components/noona/SettingsPage.tsx](../../../services/moon/src/components/noona/SettingsPage.tsx).
  It uses the current template plus the current editor state, so the preview can change before related settings are
  saved.
- Unknown placeholders are preserved as literal text.
- Known placeholders with no current value also stay visible and are listed under the preview as unresolved.

## Load, Save, And Copy Flow

- Entering the Discord settings view triggers two reads:
  Moon ensures the `noona-portal` and `noona-warden` config editors are loaded, fetches the latest Discord validation
  context, and then fetches the stored onboarding settings from Sage.
- The signed-in home page separately reads the public invite URL through Moon's safe `/api/noona/discord/invite` route
  so non-admin users never need the admin settings payload.
- `Reload` discards unsaved local edits and reloads the stored template plus `channelId` from Sage.
- `Save` persists the raw template, `channelId`, and `inviteUrl`, not the rendered preview.
- `Send test` posts the current rendered preview plus the current `channelId` draft through Sage and Portal without
  saving the template first.
- `Copy preview` copies the rendered preview text, not the template with placeholders.
- If Discord validation already returned guild channels, Moon surfaces those channels as quick-pick buttons for the
  onboarding target.
- Moon forwards Sage's returned status and payload through its Next route.
  Proxy failures become Moon-shaped JSON errors, but Sage-auth or validation responses are preserved.

## Editing Reminders

- If the placeholder contract changes, update Moon's settings UI, this note, and the Sage route tests together.
- If the storage key, seeded default, or admin gate changes, update
  [../sage/README.md](../sage/README.md) and the Sage-focused notes alongside this Moon note.
- If Portal's join-triggered send behavior changes, update the Portal runtime docs too.
