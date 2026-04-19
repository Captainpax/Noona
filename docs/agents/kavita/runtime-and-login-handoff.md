# Kavita Runtime And Login Handoff

## Noona-Specific Runtime Inputs

- `NOONA_BOOTSTRAP_ADMIN_ON_START`: legacy server-managed flag. Managed setup should now leave it `false`.
- `NOONA_MOON_BASE_URL`: preferred absolute Moon URL for the login handoff.
- `NOONA_MOON_PORT`: fallback Moon port when Kavita needs to derive a local Moon URL.
- `HOST_SERVICE_URL` and `WEBGUI_PORT`: additional Moon URL fallback inputs used by the controller.
- `NOONA_SOCIAL_LOGIN_ONLY`: disables local password login only when Noona login is actually configured.
- `NOONA_PORTAL_BASE_URL`: Portal base URL used to consume one-time Kavita login tokens.

## Managed Setup Guardrails

- Managed setup should allow the local first-admin page while Moon is waiting for the manual Kavita hand-off.
- Once Moon accepts a valid admin-capable API key, managed Kavita should return to `NOONA_SOCIAL_LOGIN_ONLY=true`.
- Do not reintroduce shell-level admin bootstrap, automatic register/login flows, or logged recovery keys in the
  container wrapper unless the product flow is intentionally being redesigned.

## Current Handoff Contract

- The public config contract is represented by
  [NoonaLoginConfigDto.cs](../../../services/kavita/API/DTOs/Account/NoonaLoginConfigDto.cs).
- The token submit contract is represented by
  [NoonaLoginTokenRequestDto.cs](../../../services/kavita/API/DTOs/Account/NoonaLoginTokenRequestDto.cs).
- Browser-side config and submit helpers live in
  [account.service.ts](../../../services/kavita/UI/Web/src/app/_services/account.service.ts).
- The server-side handoff logic lives in
  [AccountController.cs](../../../services/kavita/API/Controllers/AccountController.cs).
- The same controller only blocks direct managed first-user registration after `NOONA_SOCIAL_LOGIN_ONLY=true` again,
  unless the request matches the configured bootstrap admin credentials.
- During the manual hand-off, `NOONA_SOCIAL_LOGIN_ONLY=false` should leave Kavita's local first-admin path available.

## Integration Boundaries

- Warden should remain the owner of image build, container lifecycle, and env injection.
- Moon should remain the owner of the interactive Noona login entrypoint and callback routing.
- Portal should remain the owner of issuing and consuming the one-time Kavita login tokens.
- Kavita should remain the owner of its local user session and reader experience after the token is consumed.

## Upstream Boundary Guidance

- Prefer adding or editing code in the Noona-owned seams before changing broad upstream Kavita internals.
- Avoid wide refactors across unrelated upstream folders just to support a narrow Noona behavior change.
- If a bug is really about reader behavior, metadata, scanning, or general account management, verify that it is a
  Noona-specific problem before editing vendored code.
- If Noona needs a bigger long-term divergence from upstream auth behavior, document that clearly here and in
  [../../../services/kavita/AGENTS.md](../../../services/kavita/AGENTS.md) instead of letting the delta grow silently.
