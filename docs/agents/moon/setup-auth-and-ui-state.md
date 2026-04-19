# Moon Setup, Auth, And UI State

## Setup Profile Contract

- Moon's setup helper lives in
  [../../../services/moon/src/components/noona/setupProfile.mjs](../../../services/moon/src/components/noona/setupProfile.mjs).
- Current public contract is `SETUP_PROFILE_VERSION = 3`.
- The persisted browser-facing shape is intentionally small:
  `version`,
  `storageRoot`,
  `kavita`,
  `komf`,
  and `discord`.
- The `discord` snapshot includes Portal bot settings plus the optional `superuserId` field that maps to
  `DISCORD_SUPERUSER_ID` for Portal's DM-only `downloadall` admin command.
- The same `discord` snapshot now also carries `requiredGuildId`, which maps to Portal's `REQUIRED_GUILD_ID`.
  Setup import, save, download, and hydrate paths need to preserve that field alongside `guildId` so Portal's live
  guild gate does not drift after a setup edit.
- `deriveSetupProfileSelection()` is the Moon-side summary of implied managed services.
  It always includes `noona-portal` and `noona-raven`, plus `noona-kavita` or `noona-komf` when those integrations
  are managed.
- `hydrateSetupProfileState()` is the only supported path for restoring wizard form state from a saved snapshot.
- external Komf URLs stay in `komf.baseUrl` at the public profile layer and only derive Portal's `KOMF_BASE_URL`
  during local env generation when `komf.mode === "external"`.
- Moon's `Admin -> Integrations -> Discord` settings surface also exposes `DISCORD_SUPERUSER_ID`, so setup import/export
  and the signed-in settings editor need to stay aligned on that field.

## Setup Gates

- `SetupWizardGate` keeps `/setupwizard` and `/setupwizard/summary` available only while setup is incomplete.
- `SetupModeGate` keeps the main application behind setup completion and redirects to `/setupwizard` otherwise.
- `/bootScreen` is intentionally public and shellless.
  It is the explicit recovery and compatibility path for starting the saved ecosystem when auto-resume did not already
  settle the stack.
- That route is no longer the normal post-restart path for completed installs.
  Later single-service outages or failed probes should keep users in the normal app and troubleshooting flows.
- `AuthGate` is separate.
  It checks `/api/noona/auth/status`, redirects to `/login` on `401`, and can enforce individual Moon permissions.

## Wizard State Inside Moon

- The wizard loads the service catalog, storage layout, persisted setup snapshot, and setup status together.
- Moon keeps a derived local env state for form editing, but the real install selection still comes from the persisted
  snapshot.
- `storageRoot` stays separate wizard metadata.
  The local derived env helper should only mirror editable service fields, not inject `NOONA_DATA_ROOT` into service
  env maps.
- Uploaded setup JSON files are normalized server-side and only hydrate local wizard state.
  Persistence still happens on explicit save or install actions.
- Guild selection logic for Portal Discord config is shared in
  [../../../services/moon/src/components/noona/discordGuildSelection.mjs](../../../services/moon/src/components/noona/discordGuildSelection.mjs).
  That helper updates `DISCORD_GUILD_ID` and only auto-updates `REQUIRED_GUILD_ID` when the gate is blank or still
  matched to the previous selected guild.
  Custom guild-gate overrides are preserved.
- Wizard snapshots can carry masked secret placeholders.
  Those placeholders are safe for save and download round-trips, but live setup actions should not treat them as real
  credentials.
- The install step can now hold a managed Kavita recovery state in local UI memory.
  When Sage or Warden says Kavita is healthy but a manual API key is still missing for Portal, Raven, or
  Komf, keep that recovery state on the install tab until the admin saves a replacement key or changes the managed
  Kavita selection.
- That recovery state is now manual-only.
  `api-key-required` means Moon should open the Kavita hand-off popup, explain the first-admin and API-key steps, and
  accept a pasted admin-capable API key without clearing the retry affordance too early.
- Debug mode changes the UI surface.
  Advanced and derived env keys become more visible only when setup status says debug is enabled.
- `ALWAYS_RUNNING` currently includes `noona-moon` and `noona-sage`.
  Mongo, Redis, and Vault are still implicit because Warden marks them as required core services instead of exposing
  them as normal public toggles in the setup profile.
- `GET /api/noona/setup/status` now carries lifecycle metadata in addition to setup completion:
  `selectionMode`,
  `selectedServices`,
  `lifecycleServices`,
  and `manualBootRequired`.
  Moon uses that payload, not ad hoc route guesses, to decide whether the app should show setup, login, boot-screen,
  or signed-in shell state.
- `manualBootRequired` is Warden's runtime boot-state flag for the current Warden session, not a live readiness verdict
  derived from selected-service health checks.
- Both the setup wizard and the signed-in Discord settings screen surface a warning whenever `DISCORD_GUILD_ID` and
  `REQUIRED_GUILD_ID` diverge.
  That warning is intentional product behavior because Portal can register slash commands in one guild but deny them in
  another.
- Discord validation responses now include a read-only `commands` summary with sorted `globalCommands`,
  `guildCommands`, and `duplicateNames`.
  Moon should render that data for diagnostics only; command cleanup still belongs to Portal's startup sync.

## Bootstrap And Login State

- Moon no longer supports username/password bootstrap.
  `/api/noona/auth/bootstrap` and `/api/noona/auth/bootstrap/status` both return `410` and point users back to the
  setup summary Discord flow.
- `/signup` is just the login screen.
- Login checks:
  setup completion,
  existing session,
  and Discord OAuth config availability.
- Login should keep completed installs in the normal flow on healthy restarts.
  `/bootScreen` is reserved for explicit recovery, not the default completed-install redirect.
- Moon's Discord callback route forwards the OAuth exchange to Sage and writes `noona_session` when a token is
  returned.
- The callback page appends `discordTest=success` or `discordAuth=success` to the return target so the summary or
  login page can show the correct next-state message.

## Setup Completion Bridge

- Moon's `/api/noona/setup/complete` route does two things:
  call Sage bootstrap finalize,
  then fetch and rewrite the Sage wizard state with `completed=true`.
- This is important because the Moon summary page owns the final handoff from "install is ready" to "setup is
  finished" from the browser's perspective.

## AppShell State

- `AppShell.tsx` decides whether Moon shows setup navigation, main navigation, or no shell chrome at all.
- After setup completes, the main shell keeps direct links for `Home`, `Library`, and `Downloads`, exposes request and
  admin groups as the only menus, and surfaces `Add download` as a header action instead of burying it in navigation.
- Setup stays isolated as its own guided mode until completion.
  Do not mix setup entries back into the normal app shell outside the admin resume/setup-summary affordances.
- Current shellless routes are:
  `/login`,
  `/signup`,
  `/discord/callback`,
  `/bootScreen`,
  and `/rebooting`.
- AppShell separately loads setup status and auth status, then exposes nav entries only when the related permission is
  present.
- The signed-in drawer now includes a `Music` card above `Display`.
  It only renders for the post-setup main shell, persists `moon-music-enabled` and `moon-music-volume` in browser
  `localStorage`, and plays through Moon's `/api/noona/media/background-track` proxy path.
- `AppShell.tsx` and `SiteNotifications.tsx` now share the signed-in route gating helper from
  [../../../services/moon/src/components/noona/moonShellRoutes.mjs](../../../services/moon/src/components/noona/moonShellRoutes.mjs)
  so shell chrome and live toast polling stay aligned across login, reboot, callback, and setup flows.
- `SiteNotifications.tsx` owns all custom in-app toast behavior.
  It still handles service update polling, and now also runs best-effort signed-in polling for recommendation-decision
  and subscription-update toasts, stores per-user seen state in browser storage keyed by `discordUserId` or username,
  and dispatches the internal `noona:open-music-controls` click action for music toasts.
- Mobile navigation is intentionally a single-expansion drawer.
  Keep section headings flat inside each expanded group instead of reintroducing nested accordions or a dense mobile
  mega menu.
- Task navigation comes from
  [../../../services/moon/src/components/noona/settings/settingsRoutes.ts](../../../services/moon/src/components/noona/settings/settingsRoutes.ts),
  not from ad hoc route strings sprinkled across components.
- `Admin -> Integrations -> Kavita` is the post-setup recovery surface for managed Kavita key sync.
  Keep the messaging clear that the pasted key must belong to an admin-capable Kavita account and that the sync fans
  out only to Portal, Raven, and Komf.

## Reboot Monitor State

- Update-all flow and reboot monitoring persist state in browser `sessionStorage` through
  [../../../services/moon/src/components/noona/rebootMonitorSession.ts](../../../services/moon/src/components/noona/rebootMonitorSession.ts).
- The stored payload tracks:
  operation,
  target services,
  return path,
  optional request metadata,
  request-started state,
  phase,
  service states,
  and stability counters.
- `/rebooting` is now a shared lifecycle monitor for:
  `update-services`,
  `boot-start`,
  `ecosystem-start`,
  and `ecosystem-restart`.
- Boot-screen start, signed-in ecosystem start, signed-in ecosystem restart, and update-all should all write the same
  monitor session shape before navigating into `/rebooting`.
- The boot screen is intentionally a short startup brief.
  It should show the core recovery services, the saved target services, and the return destination before the
  lifecycle request is sent.
- Required services are operation-aware but not hard-coded to only the old control-plane update flow.
  `noona-warden`, `noona-sage`, and `noona-moon` are always required, while `noona-mongo`, `noona-redis`, and
  `noona-vault` become required only when the requested lifecycle target includes them.
- Reboot monitor cards should stay concise.
  Services with `supported === false` should read as running/no-probe states when the catalog says the container is up,
  and raw HTML probe payloads should be collapsed into generic friendly copy instead of rendered verbatim.
- Reboot monitor ordering is still intentional.
  Update-service queues use the priority ordering from `rebootMonitorSession.ts`, while non-update lifecycle targets
  preserve the requested service order.
- `/api/noona/boot/start` is a narrow public proxy to Sage's manual boot route.
  It remains useful for explicit recovery, while signed-in ecosystem start and restart still go through the
  admin-protected settings routes.
- Do not re-derive `manualBootRequired` inside Moon from live health or service-catalog state.
  Redirect behavior should follow Sage's mirrored Warden flag only.
- If update or restart UX changes, keep the session format and `/rebooting` page aligned.

## Route Availability State

- Route availability is not only filesystem-driven.
  `RouteGuard.tsx` checks `moonRoutes` and dynamic route prefixes from the resources config and can render `not-found`
  for disabled features.
- If a new page is added but should be feature-gated, update the route config as well as the page component.
