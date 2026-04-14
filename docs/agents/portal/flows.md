# Portal Flows

## Boot And Mode

- Portal starts in [portalRuntime.mjs](../../../services/portal/app/portalRuntime.mjs).
- It always builds Kavita, Komf, Vault, Raven, Warden, and onboarding-store clients first.
- If Discord config is complete, Portal logs into Discord, registers commands, starts the presence updater, then starts
  the recommendation and subscription notifiers.
- If Discord config is missing entirely, Portal still starts its HTTP API routes in HTTP-only mode.

## Discord Boot And Commands

- Slash commands are built in [commands/index.mjs](../../../services/portal/commands/index.mjs) and currently register:
  `ding`, `scan`, `search`, `recommend`, and `subscribe`.
- On login, Portal clears stale global and guild commands, then registers the current guild command set.
- The role manager can deny commands by guild or command-specific role through `REQUIRED_GUILD_ID` and
  `REQUIRED_ROLE_<COMMAND>`.
- DM delivery is serialized per user and prefers Vault-backed Redis list packets, with a legacy Vault-backed Redis
  set/get/del fallback.

## Onboarding And Kavita Login

- Generic onboarding uses `/api/portal/onboard` and `/api/portal/tokens/consume`.
- Noona Kavita handoff uses `/api/portal/kavita/noona-login` and `/api/portal/kavita/login-tokens/consume`.
- The onboarding store persists one-time tokens through Vault-backed Redis with `PORTAL_REDIS_NAMESPACE` and the
  configured TTL.
- Portal also persists per-user Kavita credentials in Vault secret path `portal/<discordId>` when possible.
- The `noona-kavita-login` token type is special: it carries the one-time Kavita username/email/password handoff data.
- Guild-member join posts are separate from the website token flow.
  On `GuildMemberAdd`, Portal fresh-reads `discord.onboarding_message` from Vault Mongo, requires both `template` and
  `channelId`, renders the saved placeholders, prepends the member mention when `{user_mention}` is missing, and then
  posts into that configured channel.

## Recommendation Flow

- `/recommend` searches Raven, opens a short-lived in-memory selection session, and stores the confirmed recommendation
  in Vault collection `portal_recommendations`.
- Portal sends an initial receipt DM after storing the recommendation.
  Discord-visible request copy stays Noona-branded even though Portal still relies on Raven, Moon, and Kavita under the
  hood.
- The recommendation notifier polls recommendations, sends approval/admin-comment/completion DMs, appends Raven
  download timeline events, and can apply deferred metadata plus Raven volume maps after import completes.
- Approval and admin-note DMs can point users back to Moon's request detail page while the work is still in progress.
- The final completion DM now waits for a real library title match plus a Kavita series URL.
  A `download-completed` timeline event may appear earlier, but by itself it no longer authorizes the final ready DM.
- Moon URLs in DMs prefer configured `MOON_BASE_URL`, then fall back to Warden-discovered Moon service URLs.

## Subscription Flow

- `/subscribe` resolves the best Raven title match, stores an active subscription in Vault collection
  `portal_subscriptions`, and seeds baseline chapter markers from Raven's current status/history so users do not get
  flooded with old chapter DMs.
- The subscription notifier polls active subscriptions plus Raven status/history and DMs only for chapter keys that have
  not already been recorded in `notifications.sentChapterKeys`.
  Those DMs also use Noona-branded wording even though the chapter-complete signal still comes from Raven task data.
- `discord.chapter_notifications` is the shared guild-post settings document.
  It stores the enable toggle, destination channel id, baseline marker, and sent chapter keys for chapter-release
  posts.
- The chapter-release notifier polls Raven every 15 minutes, groups unsent completed chapters by title, resolves the
  best summary and Kavita URL it can find, and posts one channel message per title.
  The first enable pass snapshots current Raven history as the baseline so Discord does not get flooded with old
  downloads.

## Metadata And Kavita Bridge

- Route groups under `/api/portal/kavita/*` provide Kavita info, user role management, title search, metadata matching,
  metadata apply, title-cover proxying, and library ensure/scan helpers.
- Portal's title-volume-map route bridges Komf series-details into Raven's `chapterVolumeMap` format through
  [ravenTitleVolumeMap.mjs](../../../services/portal/app/ravenTitleVolumeMap.mjs).
- Metadata and cover-art flows often touch Portal, Raven, Komf, and Kavita together.

## Presence And Warden

- Portal's presence updater polls Warden install progress/history and Raven download summary.
- Warden is used for read-only activity discovery, not for service mutation.
