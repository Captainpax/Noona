# Moon

Moon is the main Noona web app. It handles first-run setup, login, settings, user management, downloads,
recommendations, and the day-to-day admin UI.

## Quick Navigation

- [Server admin guide](../../ServerAdmin.md)
- [Repo overview](../../README.md)
- [Service rules](AGENTS.md)
- [Moon AI docs](../../docs/agents/moon/README.md)
- [App routes](src/app/)
- [Noona UI components](src/components/noona/)
- [Downloads add page](src/components/noona/DownloadsAddPage.tsx)
- [Download queue result helper](src/components/noona/downloadQueueResults.mjs)
- [Noona API proxies](src/app/api/noona/)
- [Tests](tests/)

## What Moon Does

- guides admins through first-run setup
- retries transient Warden-backed setup catalog failures during first boot so the wizard can survive normal
  control-plane
  warm-up instead of failing on the first `502`
- loads uploaded Noona setup JSON files into the wizard for review before admins explicitly save or install changes
- keeps masked setup secrets safe for save or download round-trips, while live setup actions can still ask admins to
  re-enter the managed Kavita password when only the masked placeholder is available
- saves the setup snapshot before direct install so Warden can derive the managed service plan from persisted setup
  state
- keeps completed installs in the normal app flow on healthy restarts because Warden now restores the core services
  first and then auto-resumes the saved lifecycle
- keeps `/bootScreen` as a public shellless compatibility and recovery route that can still start the saved ecosystem
  through the normal Warden lifecycle path
- shows the public boot screen as a short recovery brief with the core recovery services, saved target services, and
  the return destination before the lifecycle request is sent
- keeps later single-service outages, failed probes, or temporarily stopped selected services inside the normal app
  flow instead of redirecting an already-started system back to `/bootScreen`
- keeps the managed Kavita and Discord live preflight on the summary path, where the running services are available for
  browser-facing validation and handoff
- keeps Portal's `DISCORD_GUILD_ID` and `REQUIRED_GUILD_ID` aligned by default when admins pick or validate a Discord
  guild during setup or in signed-in settings, while warning when those values intentionally diverge
- shows read-only Discord slash-command diagnostics during bot validation so admins can spot duplicate global or guild
  registrations without shell access
- opens the setup summary with one-shot warnings when those post-install live sync calls fail after the stack is already
  installed, instead of trapping admins on the install tab
- treats Sage `HTTP 5xx` responses as real upstream failures in setup and settings flows instead of always collapsing
  them into a generic "Moon could not reach Sage" connectivity warning
- retries transient Sage `502`, `503`, and `504` responses on auth status, setup status/config, and service-catalog
  reads for a short bounded window so normal backend warm-up does not immediately surface as a browser-facing failure
- keeps `storageRoot` as top-level setup metadata instead of mirroring raw `NOONA_DATA_ROOT` overrides into saved setup
  JSON
- keeps Mongo, Redis, and Vault implicit in the setup wizard while still surfacing their always-on storage layout in
  the storage and finish steps
- saves external Komf URLs as setup-profile metadata and derives Portal's `KOMF_BASE_URL` only when Komf is configured
  as external, while managed Komf keeps Portal on the default internal `noona-komf` address
- provides the main settings and operations UI
- lets admins keep Moon's published URL and optional Sage backend URL in sync from the service-links view when custom
  networking requires it
- replaces the signed-in Home hero with a Noona dashboard welcome card that links readers to `Start Reading`,
  Discord support, and `My requests` without surfacing internal service names, and now opens `Start Reading`
  straight into Kavita instead of routing readers through the Noona handoff bridge
- uses the shared `/rebooting` lifecycle monitor for boot-start, signed-in ecosystem start, signed-in ecosystem
  restart, and update-all recovery flows
- keeps reboot-monitor cards concise by collapsing noisy HTML probe payloads and treating running services without a
  dedicated health endpoint as expected "no probe" states instead of hard failures
- keeps post-setup navigation task-based with `Home`, `Library`, `Downloads`, `Requests`, `Admin`, and a header
  `Add download` action when permitted
- plays the configured background track inside the signed-in app shell and keeps `Music` controls above `Display`
  inside the slide-out menu
- shows in-app live toasts for actual music playback starts, followed-title chapter DM activity, and recommendation
  approval or denial changes, with click-through links back into Moon
- handles Discord-first login and account management
- surfaces downloads, libraries, subscriptions, and recommendation flows
- keeps the main Downloads page focused on active Raven work with a library-style poster-card rail above one shared
  table for active work and the last 24 hours, while still using Raven history to power the table and decide when
  `Resume` should appear
- keeps the title-detail `Check new/missing` action on a longer Sage timeout budget, so Raven can finish source
  planning without collapsing into a fake Sage-unreachable error, and shows the queued plan immediately while live
  progress continues through Raven task polling
- treats title-page delete as a destructive cleanup action that removes both the Raven library entry and the managed
  download folder on disk
- exposes Raven's single global `Download speed limit` setting instead of the older worker-lane controls
- lets admins opt a queued download out of Raven's global VPN-only gate from the `Add download` flow when a specific
  title should run without waiting for the tunnel
- lets admins save a Discord onboarding template, onboarding channel id, and public invite URL so Portal can post the
  welcome message automatically when Discord reports a real guild-member join and Moon can link the signed-in home page
  support button to the right server invite
- lets admins enable Discord chapter release posts, choose the destination channel, and have Portal check Raven every
  15 minutes for newly finished chapters, grouping the post by title with the saved summary and Kavita link
- lets admins send the current rendered onboarding preview to the selected Discord channel without saving first, so the
  live post can be checked before the template draft is persisted
- treats Raven download queue attempts as successful only when Raven explicitly accepts them, so expired or invalid
  search selections stay visible as real errors
- keeps the Raven VPN panel locked while Raven reports rotating or connecting, tracks unsaved VPN draft changes against
  the last loaded snapshot, leaves only the enable-off path available while Raven is still busy, sends `Save VPN` with
  an immediate-apply request for connection-affecting edits, and polls until Raven settles whenever that apply path
  actually reconnects or disables the tunnel
- sends `Rotate now` with the current on-screen VPN draft first so unsaved region or credential edits are saved before
  Raven reconnects, prefers Raven's final detailed rotation failure once polling finishes, and shows the final
  login-test result instead of a background-start acknowledgement
- treats `Test login` as a longer-running probe path so Moon waits for Raven's synchronous OpenVPN check instead of
  timing out at the normal short Sage proxy limit
- treats updater checks and managed image pulls as longer-running admin actions, so `Check now` gets a longer Sage
  proxy window and single-service `Update` actions can wait through Docker pulls plus optional restarts

## Who It Is For

- Server admins and moderators
- Noona users signing in through Discord

## When An Admin Needs To Care

- during first-run setup
- when managing users, roles, service links, and updates
- when an update check or image pull takes a while; Moon now waits longer for those updater actions before treating
  them as failed
- when Moon reports that it cannot reach Sage for service-management actions
- when adjusting local browser shell preferences like the background music mute and volume controls
- when checking live in-app toasts that catch users up on music playback, followed-title updates, or recommendation
  decisions after they return to Moon
- when Discord validation warns that Portal's guild gate differs from the selected command-registration guild or shows
  duplicate slash-command names
- when troubleshooting setup, login, or UI-driven service actions
- when the Downloader VPN card is waiting on a save-triggered apply, manual rotation, or login test to finish and the
  controls stay disabled until Raven reports a settled connection state

## How It Fits Into Noona

Moon is the public face of the stack. Warden runs the services, Sage brokers browser-facing APIs, and Moon turns those
capabilities into the supported admin workflow.

## Next Steps

- Install and run Noona: [../../ServerAdmin.md](../../ServerAdmin.md)
- Internal editing guide: [../../docs/agents/moon/README.md](../../docs/agents/moon/README.md)
