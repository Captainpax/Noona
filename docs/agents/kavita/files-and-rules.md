# Kavita Files And Rules

## Important Files

- [../../../dockerfiles/kavita.Dockerfile](../../../dockerfiles/kavita.Dockerfile): Noona image build and runtime file
  copy points.
- [entrypoint.sh](../../../services/kavita/entrypoint.sh): Noona-managed container start behavior.
- [API/Controllers/AccountController.cs](../../../services/kavita/API/Controllers/AccountController.cs): Noona
  login-handoff and account entrypoints.
- [API/DTOs/Account/NoonaLoginConfigDto.cs](../../../services/kavita/API/DTOs/Account/NoonaLoginConfigDto.cs):
  browser-facing Noona login config payload.
- [API/DTOs/Account/NoonaLoginTokenRequestDto.cs](../../../services/kavita/API/DTOs/Account/NoonaLoginTokenRequestDto.cs):
  token submit payload for Noona login completion.
- [UI/Web/src/app/_services/account.service.ts](../../../services/kavita/UI/Web/src/app/_services/account.service.ts):
  browser API calls for `noona-config` and `noona-login`.
- [UI/Web/src/app/registration/user-login/user-login.component.ts](../../../services/kavita/UI/Web/src/app/registration/user-login/user-login.component.ts):
  login page state, redirect construction, and query-param handling.
- [UI/Web/src/app/registration/user-login/user-login.component.html](../../../services/kavita/UI/Web/src/app/registration/user-login/user-login.component.html):
  `Log in with Noona` button and password-form visibility.

## Rules

- Keep Noona-specific behavior isolated from upstream Kavita changes where possible. This repo is mostly vendored
  upstream code with a small Noona delta.
- Preserve the first-run config-copy behavior in
  [entrypoint.sh](../../../services/kavita/entrypoint.sh): copy the default appsettings file only when the live config
  file is missing.
- Managed setup now uses a manual hand-off. Do not reintroduce container-side first-admin bootstrap or automatic API
  key harvesting unless Moon, Sage, Warden, and the admin docs are all updated together.
- Preserve the current Noona login contract unless the callers are updated in the same change:
  `GET /api/account/noona-config` returns `enabled`, `moonBaseUrl`, and `disablePasswordLogin`, while
  `POST /api/account/noona-login` consumes a one-time token from Portal.
- The Noona login handoff signs an existing Kavita user in; it does not currently create a new Kavita user on demand.
- Keep UI and API password-login behavior aligned when `NOONA_SOCIAL_LOGIN_ONLY` changes. A hidden form without server
  enforcement, or server enforcement without the UI hint, creates a bad operator and user experience.
- Keep managed first-user registration behavior aligned too. When `NOONA_SOCIAL_LOGIN_ONLY=false`, the browser and API
  should both allow Kavita's upstream first-admin form during the manual hand-off.
- Once `NOONA_SOCIAL_LOGIN_ONLY=true`, the browser must stay on the Noona login surface and the API must reject direct
  managed first-admin registration unless the configured bootstrap account is being used.
- User-visible bootstrap or login-handoff changes must update
  [../../../services/kavita/README.md](../../../services/kavita/README.md) and
  [../../../ServerAdmin.md](../../../ServerAdmin.md).
