# Raven

Raven is Noona's downloader and library sync service. It searches supported sources, builds the downloaded files,
tracks job state, and keeps the managed library in sync.

## Quick Navigation

- [Server admin guide](../../ServerAdmin.md)
- [Repo overview](../../README.md)
- [Service rules](AGENTS.md)
- [Raven AI docs](../../docs/agents/raven/README.md)
- [Controllers](src/main/java/com/paxkun/raven/controller/)
- [Core services](src/main/java/com/paxkun/raven/service/)
- [Download controller](src/main/java/com/paxkun/raven/controller/DownloadController.java)
- [Download service](src/main/java/com/paxkun/raven/service/DownloadService.java)
- [Build file](build.gradle)
- [Tests](src/test/java/com/paxkun/raven/)

## What Raven Does

- searches titles and queues downloads
- can crawl alphabetic source listings and bulk-queue matching titles for trusted admin tooling
- supports special-character-safe JSON search and queue requests while keeping the legacy GET endpoints for
  compatibility
- creates the library files Noona serves
- tracks active and historical download state
- preserves exact fractional chapter identifiers like `101.1` and `101.5` instead of collapsing them into `101`
- returns structured queue outcomes so callers can distinguish accepted queues from expired, invalid, or already-active
  selections
- supports import checks and metadata-related library repair flows
- reconciles a title's stored chapter index against the downloaded folder when Raven reads that title back, so
  missing-chapter checks can recover from stale metadata instead of treating on-disk chapters as missing from the
  library state
- plans title and library-wide check-for-new requests first, returns the queued chapter plan immediately, and runs the
  actual sync work in the background on Raven's existing single-thread executor
- only adds volume numbers to default chapter file names when Noona has an explicit chapter-to-volume map for that
  chapter, otherwise keeping chapter-only names until metadata repair fills the map
- refreshes cached PIA OpenVPN profiles atomically and keeps the last known-good profiles when an upstream archive
  refresh fails
- establishes a baseline PIA tunnel automatically whenever VPN is enabled
- accepts manual `Rotate now` requests only after Raven has reserved the rotation and validated the active PIA
  settings, then completes the tunnel change in the background
- accepts a dedicated disable/apply request that disconnects immediately when Raven is idle and queues that disable
  behind the active rotation when Raven is already reconnecting
- fresh-reads VPN settings for manual rotate validation, scheduler auto-connect, and VPN-gated download waits so a
  newly saved region, credential, or download gate change takes effect immediately instead of waiting for the normal
  settings cache window
- runs one in-process download at a time and restores queued work in FIFO order on boot
- retries chapter page resolution, per-image fetches, and partial chapter attempts so long WeebCentral downloads can
  finish with a complete chapter set instead of silently accepting incomplete chapters
- re-ensures and retries a just-created Kavita library scan once after a completed download moves into place before
  falling back to direct Kavita lookup or logging the failure
- keeps the maintenance-pause path tolerant of an empty persisted active-task list, so rotate and baseline
  auto-connect flows still proceed when there is nothing to pause
- keeps `enabled` separate from `onlyDownloadWhenVpnOn`, so turning VPN off does not silently clear the download gate
- keeps phase-specific VPN transition failures in the returned/runtime error text and appends cleanup failures instead
  of overwriting the primary cause with a generic rotation error
- clears stale non-active same-title queue snapshots before a fresh download-all request so Add Downloads can requeue a
  title from chapter `1` instead of resuming an old partial task
- collapses duplicate same-title restorable tasks on startup so the newest persisted queue intent wins before queued
  restore resumes anything
- removes the managed title folder before archiving a deleted title, so Moon's title delete cleans up both metadata and
  on-disk downloads together
- returns the final `Test login` probe result directly instead of only acknowledging a background job
- stores its shared settings and task state through Vault's internal service API in managed installs

## Who It Is For

- Server admins managing downloads and library sync
- Contributors working on downloader, scraper, or library-sync logic

## When An Admin Needs To Care

- when downloads, imports, or sync jobs fail
- when a source publishes fractional update chapters or extras and you need to confirm Raven kept them as separate
  entries
- when tuning the global download speed limit, naming, or VPN-related settings
- when Moon shows a Raven VPN profile refresh or discovery error under the PIA settings card
- when Moon reports that a VPN save/apply or rotation is still settling or a login test failed with a final probe
  result
- when Moon shows a queued download waiting on VPN together with a Raven connection state or last-error hint
- when a completed download lands on disk but Kavita has not refreshed the matching library yet
- when checking that downloaded content actually landed on disk

## How It Fits Into Noona

Raven runs behind Moon, Sage, Portal, and Warden. Admins usually control it from Moon rather than calling Raven
directly.

## Next Steps

- Admin install and operations: [../../ServerAdmin.md](../../ServerAdmin.md)
- Internal editing guide: [../../docs/agents/raven/README.md](../../docs/agents/raven/README.md)
