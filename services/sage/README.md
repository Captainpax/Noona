# Sage

Sage is Noona's setup, auth, and browser-facing API broker. Moon talks to Sage for setup, login, user management, and
Raven-facing browser actions.

## Quick Navigation

- [Server admin guide](../../ServerAdmin.md)
- [Repo overview](../../README.md)
- [Service rules](AGENTS.md)
- [Sage AI docs](../../docs/agents/sage/README.md)
- [Entrypoint](initSage.mjs)
- [Route modules](routes/)
- [Clients](clients/)
- [Raven routes](routes/registerRavenRoutes.mjs)
- [Raven client](clients/ravenClient.mjs)
- [Tests](tests/)

## What Sage Does

- proxies setup and service-management requests to Warden
- preserves Warden setup-config validation errors and normalize-only import responses so Moon can show the real issue
- owns Discord OAuth and Moon auth flows
- validates Portal Discord bot credentials and returns read-only slash-command diagnostics that Moon can surface during
  setup and settings troubleshooting
- brokers browser-facing Raven and settings APIs, including the signed-in Discord invite lookup Moon uses on the home
  page
- streams the authenticated background music asset that Moon proxies into its signed-in shell
- talks to Vault through the stack's trusted internal HTTPS path in managed installs
- keeps wizard-state on a local fallback until Warden has created the managed Vault CA bundle, then resumes Vault-backed
  persistence
- validates manually supplied managed Kavita API keys, mirrors them into Portal, Raven, and Komf, and persists that
  mirrored key through the Vault-backed settings path when available
- reports a manual Kavita hand-off status back to Moon instead of trying to register, log into, or auto-create Kavita
  auth keys during setup
- flips managed Kavita back to `NOONA_SOCIAL_LOGIN_ONLY=true` after Moon accepts a validated admin API key
- handles VPN settings writes, including PIA credential checks, save-first rotate requests, and immediate-apply
  decisions for Raven when connection-affecting VPN settings changed or when a saved disable should disconnect a live
  or still-rotating tunnel
- preserves Raven's real queue status and message for Moon instead of flattening every queue response into a generic
  success
- normalizes backend failures into UI-friendly responses

## Who It Is For

- Server admins troubleshooting setup or login
- Contributors working on auth, setup, or browser-facing service APIs

## When An Admin Needs To Care

- when Moon setup or Discord login fails
- when Moon reports that managed Kavita is waiting for a manual admin-capable API key
- when Discord bot validation succeeds but Moon reports duplicate slash commands or a likely guild-registration mismatch
- when user management or default permissions behave unexpectedly
- when Moon's signed-in background track fails to load or respond to range requests
- when VPN settings reject a provider other than PIA, a save-triggered VPN apply returns a Raven error, or a VPN login
  test returns an error
- when browser-facing Raven actions fail even though Raven is online

## How It Fits Into Noona

Sage sits between Moon and the rest of the stack. Admins usually encounter it indirectly through Moon rather than as a
standalone service.

## Next Steps

- Admin install and operations: [../../ServerAdmin.md](../../ServerAdmin.md)
- Internal editing guide: [../../docs/agents/sage/README.md](../../docs/agents/sage/README.md)
