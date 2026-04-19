# Noona Kavita Service

This repository includes a Noona-managed Kavita checkout. In Noona, Kavita is the reading server that admins and readers open after the stack is installed.

## Quick Navigation

- [Server admin guide](../../ServerAdmin.md)
- [Repo overview](../../README.md)
- [Service rules](AGENTS.md)
- [Kavita AI docs](../../docs/agents/kavita/README.md)
- [Noona Dockerfile](../../dockerfiles/kavita.Dockerfile)
- [Container entrypoint](entrypoint.sh)
- [Account controller](API/Controllers/AccountController.cs)

## What This Service Does

- provides the managed reading server in a standard Noona install
- supports the Noona-to-Kavita login handoff
- keeps Moon `/login` as the managed Noona sign-in entrypoint instead of exposing Kavita's direct first-admin register page
- allows local first-admin setup during the initial managed hand-off, then returns to Noona/social-login-only mode
  after Moon validates and saves the admin API key
- keeps the local first-admin register flow available specifically while `NOONA_SOCIAL_LOGIN_ONLY=false`, then blocks it
  again after Noona re-locks managed login
- exposes the reader and user-role features admins expect from Kavita

## Who It Is For

- Server admins managing reader access
- Contributors touching Noona's managed Kavita behavior

## When An Admin Needs To Care

- when reader access or Kavita links fail
- when tuning managed Kavita defaults during setup
- when Moon asks them to finish the manual managed Kavita hand-off and paste an admin API key
- when troubleshooting the Noona login handoff
- when Kavita stays on the managed setup wait message instead of opening the normal login screen

## How It Fits Into Noona

Warden manages the container, Moon exposes the relevant settings, and Portal/Sage participate in the login and
onboarding flow. Admins usually do not install Kavita separately when running Noona.
In managed installs, Noona now pauses after Kavita is healthy, asks the admin to open Kavita and finish the first
admin plus API-key setup manually, then locks Kavita back to Noona/social-login-only mode after Moon accepts that key.

## Next Steps

- Admin install and operations: [../../ServerAdmin.md](../../ServerAdmin.md)
- Internal editing guide: [../../docs/agents/kavita/README.md](../../docs/agents/kavita/README.md)
