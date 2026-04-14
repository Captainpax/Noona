# Raven Flows

## Boot And Runtime Mode

- [RavenApplication.java](../../../services/raven/src/main/java/com/paxkun/raven/RavenApplication.java) starts a
  single Spring Boot service process.
- [DownloadService.java](../../../services/raven/src/main/java/com/paxkun/raven/service/DownloadService.java) owns a
  single in-process executor for downloads.
- Effective download concurrency is intentionally `1`.
  Raven runs one active download at a time and keeps the rest of the queue persisted and resumable.

## Search To Queue To Download

- Search starts in `GET /v1/download/search/{titleName}` or `POST /v1/download/search`.
- Raven stores search results in an in-memory search session with a 10-minute TTL.
- Queueing happens through the legacy `GET /v1/download/select/{searchId}/{optionIndex}` route or the newer
  `POST /v1/download/select` JSON route.
- The JSON queue route returns structured status values instead of only a message. The controller maps:
  invalid selection to `400`, expired search to `410`, already-active or maintenance-pause states to `409`, and
  accepted queues to `202`.
- A fresh queue request now clears non-active same-title task snapshots first, so Add Downloads always means
  "download this title from scratch" rather than "resume whatever stale queued chapter subset Raven still had".
- Download execution and status persistence live in
  [DownloadService.java](../../../services/raven/src/main/java/com/paxkun/raven/service/DownloadService.java).
- Chapter execution is completeness-first now.
  Raven retries source-page lookup, retries individual image fetches, and retries the whole chapter when a partial
  page set lands.
  A chapter only becomes complete when Raven saved every expected page into the archive.
- Queue restore order is FIFO by `queuedAt`.
  If multiple queued tasks survive a restart, Raven resumes the oldest queued work first.

## Task Persistence And Recovery

- Raven persists task snapshots in the Vault Mongo collection `raven_download_tasks`.
- Raven also writes the current task snapshot to Redis key `raven:download:current-task`.
- On boot, Raven restores queued, downloading, recovering, and interrupted tasks from Vault.
- When multiple restorable tasks exist for the same title, Raven keeps the newest one and deletes older duplicates
  before queued restore continues.
- Pause requests are persisted so Raven can cleanly stop after the current chapter and later resume the task.
- Restore and live execution both depend on the same persisted `DownloadProgress` contract.

## Library, Sync, And Import Flow

- Raven stores title metadata in Vault collection `manga_library`.
- [LibraryService.java](../../../services/raven/src/main/java/com/paxkun/raven/service/LibraryService.java) updates
  title metadata, chapter indexes, file maps, and `downloadPath` whenever new work lands.
- `GET /v1/library/title/{uuid}` now reconciles `downloadedChapterFiles`, `downloadedChapterNumbers`,
  `chaptersDownloaded`, and `lastDownloaded` from the managed title folder before Raven returns the title payload.
- Raven writes a `.noona` manifest beside managed title content so imports and restores can reconstruct the title.
- `POST /v1/library/checkForNew` and `POST /v1/library/title/{uuid}/checkForNew` now split planning from execution.
  Raven fetches source chapters, computes the `new` and `missing` plan, returns that queued summary immediately, then
  runs the actual chapter sync in the background on the existing single-thread executor.
- Library-wide checks reserve one in-process run at a time so repeated requests do not stack duplicate planning passes.
- `POST /v1/library/imports/check` scans managed folders for `.noona` manifests, imports missing titles, and can queue
  missing or new chapters afterward.
- `POST /v1/library/title/{uuid}/volume-map` stores provider metadata and can auto-rename existing files to match the
  configured volume map.
- `DELETE /v1/library/title/{uuid}` removes the managed title folder first, then soft-deletes the title record with
  `deletedAt`.
  Folder-delete failures are fatal to the request so Moon does not silently archive the title while leaving the files
  behind.

## Kavita Sync Flow

- Library updates call
  [KavitaSyncService.java](../../../services/raven/src/main/java/com/paxkun/raven/service/KavitaSyncService.java) to
  ensure the right Kavita library exists for the title type.
- Raven prefers Portal-backed Kavita helpers when `PORTAL_BASE_URL` is configured.
- If Portal is unavailable, Raven can talk to Kavita directly using `KAVITA_BASE_URL` and `KAVITA_API_KEY`.
- When a scan races a just-created library, Raven clears its local library cache, re-runs the ensure step once, and
  retries the scan lookup before it gives up or falls back.
- Import checks and title syncs request Kavita scans after Raven writes or repairs content.

## VPN Rotation Flow

- `VPNServices` manages PIA region lists, login tests, active OpenVPN state, manual rotation, and scheduler-driven
  auto-connect retries.
- When VPN is enabled and Raven is disconnected, the scheduler runs an auto-connect path until the baseline tunnel is
  back up.
  There is no periodic auto-rotation schedule anymore.
- `POST /v1/vpn/rotate` triggers the manual path.
  Raven reserves `rotationInProgress`, validates enabled PIA settings immediately, and only then returns the async
  accepted response.
- `POST /v1/vpn/disable` now applies the disabled runtime state immediately when Raven is idle.
  If Raven is already rotating, it queues the disable, lets the active maintenance-safe reconnect finish, then
  disconnects instead of leaving the tunnel connected.
- Raven uses a fresh VPN settings read for manual-rotate validation and for the scheduler's auto-connect path, so a
  save in Moon or Sage is visible to Raven right away instead of after the normal settings cache TTL.
- Auto-connect and manual rotation both use the same maintenance-pause flow:
  pause active downloads, wait for in-flight work to drain, reconnect OpenVPN, restore preserved local routes, then
  resume only the titles paused by that VPN transition.
- Raven takes a mutable snapshot of the persisted active-task list before sorting it for the maintenance-pause pass, so
  an empty immutable Vault fallback does not abort rotate or auto-connect.
- A queued disable does not clear `onlyDownloadWhenVpnOn`.
  Raven still reads that gate separately when deciding whether queued downloads should wait for a VPN connection.
- Stage-specific failures are recorded at the point they happen.
  `VpnRuntimeStatus.lastError` and the manual rotation result now keep the primary failure stage detail, and follow-up
  cleanup problems are appended instead of replacing the original cause.
- Failed auto-connect attempts record `VpnRuntimeStatus.lastError` and back off for one minute before the scheduler
  retries again.
- If rotation fails after OpenVPN connected, Raven disconnects the tunnel, restores preserved local routes, clears
  maintenance pause, and only then resumes the rotation-owned downloads.
- `POST /v1/vpn/test-login` is a lighter probe path that validates credentials and region connectivity without taking
  over Raven's long-running VPN session.
  The login test now returns the final probe result synchronously and restores preserved local routes on both success
  and failure paths.

## Debug And Status Flow

- `GET /v1/debug` and `POST /v1/debug` toggle the `LoggerService` debug flag.
- `GET /v1/download/status/summary` blends download progress with library-check activity so Moon can show a task-based
  current state instead of worker or process internals.
- The summary payload now also includes `vpn` runtime details from `VPNServices` so Moon can explain queued tasks that
  are blocked on VPN startup or failure.
- The summary payload also exposes the global `overallSpeedLimitKbps` value instead of per-worker rate-limit arrays.
- `DownloadService` also fresh-reads VPN settings for queue gating checks, so disabling `onlyDownloadWhenVpnOn` or
  otherwise removing the wait condition releases queued work without waiting for the old 5-second VPN settings cache.
- If the summary shape changes, update controller tests and any Moon/Sage code that renders Raven state.
