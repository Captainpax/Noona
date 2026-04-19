# Kavita Flows

## Boot And Managed Runtime

- Warden builds the image from [kavita.Dockerfile](../../../dockerfiles/kavita.Dockerfile) and starts the managed
  container.
- [entrypoint.sh](../../../services/kavita/entrypoint.sh) ensures `/kavita/config` exists before launching the app.
- On first boot, the entrypoint copies `/tmp/config/appsettings.json` into `/kavita/config/appsettings.json` only when
  the live config file is missing.
- During the install hand-off, managed Kavita should start with local first-admin setup available.
- After Moon accepts a valid admin API key, Sage/Warden flip `NOONA_SOCIAL_LOGIN_ONLY=true` again and restart Kavita.

## Managed First-Admin Hand-Off

- Moon now tells the admin to open Kavita directly, create the first admin manually if needed, create an
  admin-capable API key, and paste that key back into Moon.
- Kavita's own wrapper should stay out of that process.
  It should not auto-register admins, auto-log in, auto-create auth keys, or log one-time recovery keys during setup.
- When Noona login is configured but `NOONA_SOCIAL_LOGIN_ONLY=false`, Kavita should still allow the local first-admin
  form during the manual hand-off.
- Once `NOONA_SOCIAL_LOGIN_ONLY=true` again, direct first-user registration is blocked unless the request matches the
  configured managed bootstrap admin credentials exactly.

## Noona Login Button And Redirect

- The Kavita login screen loads public Noona config from `GET /api/account/noona-config`.
- The UI stores that config in
  [account.service.ts](../../../services/kavita/UI/Web/src/app/_services/account.service.ts) and
  [user-login.component.ts](../../../services/kavita/UI/Web/src/app/registration/user-login/user-login.component.ts).
- If the response says Noona login is enabled, the login page shows a `Log in with Noona` button.
- If Noona login is enabled but the first managed admin does not exist yet, the login page now stays on the login
  surface, polls `GET /api/admin/exists`, and shows a managed setup wait or recovery message instead of routing to
  `/registration/register`.
- Clicking that button sends the user to Moon's `/login` route with a `returnTo` callback that points to
  Moon's `/kavita/complete` route, which then sends the user back to Kavita with a `noonaToken` query param.

## Noona Token Consumption

- When the Kavita login page sees `noonaToken` in the URL, it clears the query param and immediately posts the token to
  `POST /api/account/noona-login`.
- [AccountController.cs](../../../services/kavita/API/Controllers/AccountController.cs) forwards that token to Portal
  at `/api/portal/kavita/login-tokens/consume`.
- Portal returns the one-time handoff record that Kavita uses for lookup.
- Kavita looks up an existing user by normalized username first, then by normalized email.
- If the token is invalid or expired, Kavita returns an unauthorized response. If Portal is unreachable or returns a
  bad payload, Kavita returns a service-style error instead of silently falling back.

## Password Login Gating

- `GET /api/account/noona-config` also tells the login page whether password login should be hidden.
- The UI hides the password form when `disablePasswordLogin` is true.
- The API enforces the same rule in the normal `POST /api/account/login` path by rejecting password logins when
  `NOONA_SOCIAL_LOGIN_ONLY` is enabled for a valid Noona-login setup.
- Keep the UI and API behavior aligned. Changing only one side creates confusing half-working login states.
- Keep first-user registration gating aligned too. Managed Noona login should never leave the browser on Kavita's
  public first-admin form while the API rejects the same path.
