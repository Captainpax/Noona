# Moon Flows

## First-Run Setup Wizard

- The setup wizard loads four things in parallel:
  the installable service catalog, storage layout, persisted setup snapshot, and setup status.
- The catalog fetch is cold-start tolerant.
  Moon retries transient `502`, `503`, and `504` responses from `/api/noona/services` for a short bounded window so
  Warden warm-up does not strand the wizard on the first load.
- Moon hydrates its local wizard state from the persisted v3 snapshot through
  [../../../services/moon/src/components/noona/setupProfile.mjs](../../../services/moon/src/components/noona/setupProfile.mjs).
- The flow stays task-based:
  storage, integrations, service review, then install.
- Moon persists the setup snapshot with `apply: false` before install and before summary navigation.
  Warden remains responsible for deriving the actual managed-service plan from the saved profile.
- Managed integrations are implicit.
  `deriveSetupProfileSelection()` always includes Portal and Raven, and adds Kavita or Komf when those modes are
  managed.
- Import/export is snapshot-based.
  Moon downloads the normalized setup JSON, and uploaded files are first normalized through Sage and Warden before the
  wizard hydrates local review state.
- The install request is intentionally snapshot-driven.
  After validation and persistence, Moon calls `/api/noona/install` with an empty selection body and then monitors the
  async progress stream.

## Summary, Discord Test, And Final Setup Completion

- `openSetupSummary()` in the wizard does three critical things before navigation:
  provision the managed Kavita service key when needed, save Discord OAuth config with retries, and persist the latest
  setup snapshot.
- Once install is already complete, those live Kavita or Discord sync calls downgrade to one-shot summary warnings.
  Snapshot persistence still blocks, but post-install sync failures no longer strand the user on the install tab.
- `install()` does not run the live Kavita or Discord preflight.
  It validates the form, persists the final snapshot, and lets Warden handle managed Kavita provisioning during the
  install lifecycle after `noona-kavita` is running.
- The summary page loads live services, persisted config, auth status, and setup status together.
- Moon applies the same bounded transient-read retry policy to auth status, setup status/config, and service-catalog
  reads.
  Retry only `GET` paths that can safely survive a short Sage warm-up window, and preserve the final upstream failure
  payload if the retries run out.
- Discord OAuth on the summary page has two Moon-facing modes:
  `test` to validate the callback path and `bootstrap` to create the first admin.
- Moon's old username/password bootstrap routes intentionally return `410`.
  Setup summary plus Discord OAuth is the only supported Moon bootstrap path now.
- Moon's `/api/noona/setup/complete` route finalizes the pending admin through Sage and then marks the wizard state as
  `completed`.
  This is a UI-owned completion bridge, not a direct Warden install action.

## Login, Session, And Kavita Handoff

- Login is Discord-first.
  `LoginPage.tsx` checks setup status, existing auth status, and Discord OAuth config before presenting the login
  button.
  Those bootstrap reads now tolerate short transient `502`, `503`, and `504` responses from Sage before surfacing the
  failure in the shell.
- The Discord callback page posts `code` and `state` to Moon's auth callback route, which forwards to Sage and writes
  the `noona_session` cookie when a token comes back.
- Logout clears the cookie even if Sage logout fails.
  This keeps the browser state recoverable during backend issues.
- `/signup` is currently just an alias of `/login`.
- The Kavita bridge is separate from Moon login.
  Moon checks the current Noona session through Sage, requests a Portal-issued Kavita token, validates the target URL
  stays under the trusted Kavita origin, and then redirects the browser to Kavita's `/login` endpoint.

## Settings, Service Updates, And Reboot Monitor

- Moon settings are task-based, not service-first.
  `settingsRoutes.ts` maps views like `overview`, `filesystem`, `database`, `downloader`, `updater`, `discord`,
  `kavita`, `komf`, and `users`.
- The settings page handles ecosystem actions, service updates, service config edits, user management, Vault views,
  and download tuning through Moon API routes that forward into Sage.
- Discord settings now save three user-facing handoff values together: the onboarding template, onboarding channel id,
  and the public invite URL the signed-in home page support button uses.
  That same card can also send the current rendered preview to Discord without persisting the draft first.
- Discord settings also save the chapter-release post toggle and destination channel id.
  When enabled, Portal snapshots the current Raven history as a baseline, then polls every 15 minutes and posts future
  grouped title updates with summaries and Kavita links into that channel.
- Updater actions are intentionally long-running.
  `POST /api/noona/settings/services/updates` uses a longer Moon-to-Sage timeout for Warden's live registry refresh,
  and `POST /api/noona/settings/services/:name/update-image` uses an even longer timeout so the UI can wait through a
  synchronous Docker pull plus optional restart.
- Admin service-config saves must stay narrow.
  Moon should only send editable keys that are explicitly modeled in Warden's `envConfig` (`readOnly !== true` and
  `serverManaged !== true`), while preserving masked secret placeholders and intentional blank clears.
  Do not round-trip the full redacted `env` snapshot back into Sage or Warden.
- The Downloader PIA VPN card keeps its controls disabled while Raven reports `rotating` or `connecting`.
  Moon now tracks the current VPN draft against the last loaded snapshot so it can tell whether `Save VPN` or
  `Rotate now` is acting on unsaved edits.
  `Save VPN` sends the current draft with `applyNow: true`, then polls the live VPN settings until Raven settles when
  Sage reports that an apply-triggered reconnect or disable actually started.
  While Raven is already busy, Moon still keeps the rest of the VPN card locked, but it now leaves the enable switch
  and `Save VPN` available so admins can queue a disable without persisting stale region or credential edits.
  `Rotate now` sends the full current draft too, so unsaved region or credential edits are persisted before Raven
  reconnects.
  Follow-up refreshes preserve success messages so save/rotate confirmations do not disappear immediately.
  If Raven settles with `status.lastError`, Moon now promotes that final detailed failure into the card error state
  instead of leaving the user with the generic background-start message.
- Raven download-summary reads now include VPN runtime details.
  Moon uses those details to explain queued downloads that are waiting for the VPN instead of only repeating the task's
  generic waiting message.
- VPN login tests are treated as final-result actions.
  Moon waits for the completed response, then shows the returned result rather than any intermediate start
  acknowledgement.
  The login-test proxy uses a longer timeout budget than normal Sage reads because Raven's synchronous OpenVPN probe
  can legitimately run far longer than the default 8-second proxy window.
- `updateAllImages()` writes reboot-monitor session state into `sessionStorage` and redirects to `/rebooting`.
- The reboot monitor page watches both target services and core recovery services such as Warden, Redis, Vault, Moon,
  and Sage until the stack is stable enough to return to settings.
- Reboot-monitor health cards are intentionally summarized.
  Do not surface raw HTML success pages or treat `supported: false` services as hard failures when the service catalog
  already says the container is running.
- Admin docs matter here.
  If task labels, route names, or the update-monitor flow change, update the public Moon README and
  [../../../ServerAdmin.md](../../../ServerAdmin.md).

## Downloads, Recommendations, And Home Feed

- Home page access is gated by setup completion and auth, then loads the latest title feed for the landing page.
- The signed-in hero card stays Noona-only.
  It opens Kavita directly with the shared Kavita-link resolver, links the support button through the signed-in safe
  Discord invite route, and points follow-up requests at `/myrecommendations` without
  surfacing Moon, Raven, or other internal service names in the hero copy.
- Downloads are stricter than naive HTTP success checks.
  Moon only treats a queue attempt as accepted when the response is HTTP `202` and Raven returns queue status
  `queued` or `partial`.
- The downloads page is active-first.
  It shows a top poster-card rail for active Raven tasks using the same card tech as the library page, plus one shared
  table that combines active rows with the last 24 hours of Raven history.
  The rail is summary-only; richer chapter previews, timestamps, VPN context, and actions stay in the table row
  details.
- The downloads page only enables `Resume` when Raven history includes paused or interrupted tasks, even though that
  history is no longer rendered on the main page.
- `DownloadsAddPage.tsx` now sends an optional `allowDownloadWithoutVpn` flag with each queue request so one submit
  action can bypass Raven's global VPN-only gate without changing the downloader-wide setting.
- `TitleDetailPage.tsx` treats `Delete title` as a destructive cleanup action now.
  The title-page danger zone removes the Raven title entry and the managed download folder, so any softer cleanup must
  go through the per-file delete controls instead.
- Queued VPN-blocked tasks stay in the live queue and surface Raven's connection state, region, and last error in the
  inline row copy and hover details instead of implying that a resume action will fix them.
- Failed Raven queue attempts remain visible in the UI and failed options stay selected in `DownloadsAddPage.tsx`.
- Recommendation, subscription, and Raven title actions all flow through Moon's server routes into Sage so the browser
  never needs a direct Sage token.
