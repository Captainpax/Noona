# Warden API Surface And Auth

## Live Route Implementation

The live HTTP server
is [../../../services/warden/api/startWardenServer.mjs](../../../services/warden/api/startWardenServer.mjs).

Grouped routes:

- public:
  `GET /health`
- debug:
  `GET /api/debug`, `POST /api/debug`
- service state:
  `GET /api/services`, `GET /api/services/:name/health`, `GET /api/services/:name/logs`
- service install and updates:
  `POST /api/services/install`,
  `GET /api/services/install/progress`,
  `GET /api/services/installation/logs`,
  `POST /api/services/:name/restart`,
  `POST /api/services/:name/update`,
  `GET /api/services/updates`,
  `POST /api/services/updates/check`
- service config and tests:
  `GET /api/services/:name/config`,
  `PUT /api/services/:name/config`,
  `POST /api/services/:name/test`
- setup and storage:
  `GET /api/storage/layout`,
  `GET /api/setup/config`,
  `POST /api/setup/config`,
  `POST /api/services/noona-raven/detect`
- ecosystem lifecycle:
  `POST /api/ecosystem/start`,
  `POST /api/ecosystem/stop`,
  `POST /api/ecosystem/restart`,
  `POST /api/ecosystem/factory-reset`

## Auth Model

- `/health` is public.
- Everything else requires `Authorization: Bearer <token>`.
- Tokens come from `WARDEN_API_TOKEN_MAP` when provided.
- Otherwise Warden generates and persists service tokens through
  [../../../services/warden/docker/wardenApiTokens.mjs](../../../services/warden/docker/wardenApiTokens.mjs).

Default Warden API clients:

- `noona-sage`
- `noona-moon`
- `noona-vault`
- `noona-portal`
- `noona-raven`
- `noona-kavita`
- `noona-komf`

## Service Authorization Rules

Current live server behavior in `startWardenServer.mjs`:

- Sage can access all protected Warden routes.
- Any managed service with a Warden token may read only its own `GET /api/services/:name/config` route.
- Portal is intentionally limited to:
  `GET /api/services`,
  `GET /api/services/install/progress`,
  `GET /api/services/:name/logs`,
  plus `GET /api/services/noona-portal/config` for Portal's own startup restore

This is easy to miss
because [../../../services/warden/api/requestAuth.mjs](../../../services/warden/api/requestAuth.mjs)
defines a more detailed permission model and route-to-permission map, but that file is not the live route gate today.

Practical rule:

- if you change Warden route auth, update both files or consolidate them deliberately
- do not expand Portal's write access casually

## Token Persistence

The shared token store lives in
[../../../services/warden/docker/serviceAuthRegistry.mjs](../../../services/warden/docker/serviceAuthRegistry.mjs).

Important details:

- default file path is `<NOONA_DATA_ROOT>/warden/service-auth-tokens.json`
- namespaces are used inside that file
- Warden API tokens use namespace `warden`
- Vault tokens use namespace `vault`
- env overrides win over stored/generated tokens

## Response Redaction

`startWardenServer.mjs` redacts secrets before returning service config or setup config responses.

Important details:

- secret-like env keys are detected by name patterns such as `TOKEN`, `PASSWORD`, `API_KEY`, `SECRET`, `PRIVATE_KEY`,
  and `MONGO_URI`
- the public placeholder is `********`
- the same placeholder is accepted on writes to mean "keep the current secret"
- `GET /api/services/:name/config` stays redacted by default
- the authenticated `noona-sage` token may opt into raw `env` and `runtimeConfig.env` maps with
  `?includeSecrets=true`
- the matching managed service token may also use `?includeSecrets=true`, but only on its own service name
- cross-service secret reads stay forbidden; this opt-in exists for trusted setup flows and service self-restore, not
  for general secret browsing

If you add new sensitive settings, make sure the redaction and placeholder-preserve paths still cover them.

## Request Limits

The HTTP server enforces:

- max request body size via `WARDEN_API_MAX_BODY_BYTES`
- request timeout via `WARDEN_API_REQUEST_TIMEOUT_MS`
- headers timeout via `WARDEN_API_HEADERS_TIMEOUT_MS`

Important default:

- `WARDEN_API_REQUEST_TIMEOUT_MS` now defaults to 10 minutes instead of 30 seconds so synchronous
  `POST /api/services/:name/update` calls can survive Docker pulls plus optional restarts when Moon waits on the live
  result.

Oversized JSON payloads return `413` instead of being buffered indefinitely.

## Error Model

Use [../../../services/warden/core/wardenErrors.mjs](../../../services/warden/core/wardenErrors.mjs) for HTTP-safe
errors.

Important classes:

- `WardenValidationError` -> `400`
- `WardenNotFoundError` -> `404`
- `WardenConflictError` -> `409`
- `WardenApplyError` -> apply/save failures with rollback payloads

The server maps these typed errors directly to HTTP responses.
