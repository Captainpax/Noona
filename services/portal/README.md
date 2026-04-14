# Portal

Portal is Noona's Discord and Kavita bridge. It powers the Discord bot, onboarding flows, recommendation notifications,
and Kavita account handoff features.

## Quick Navigation

- [Server admin guide](../../ServerAdmin.md)
- [Repo overview](../../README.md)
- [Service rules](AGENTS.md)
- [Portal AI docs](../../docs/agents/portal/README.md)
- [Entrypoint](initPortal.mjs)
- [HTTP routes](routes/)
- [Discord commands](commands/)
- [Tests](tests/)

## What Portal Does

- connects Noona to Discord
- handles onboarding and recommendation-related messaging
- posts the saved onboarding template into the configured Discord channel when a real guild member joins
- checks Raven every 15 minutes for newly finished chapters and posts one grouped update per title into the configured
  Discord channel with the title summary and best Kavita link
- keeps Discord-visible request updates Noona-branded and waits until a title is actually available in Noona before
  sending the final ready DM with a direct Kavita title link
- optionally accepts a DM-only `downloadall` admin command for one configured Discord superuser
- registers slash commands into the configured Discord guild while still enforcing the optional `REQUIRED_GUILD_ID`
  access gate at execution time
- returns actionable `/scan` errors when Kavita denies scan access or cannot find the just-requested library, instead
  of only surfacing Discord's generic command failure
- bridges Moon and Kavita for account and metadata flows
- targets managed `noona-komf` by default for metadata bridge requests, but can also use an explicit external
  `KOMF_BASE_URL` override when Moon setup or service config points Portal at a different Komf instance
- uses Vault's internal service API for shared secrets plus short-lived onboarding and Discord DM queue state
- exposes the public-facing Portal HTTP endpoints used by the stack
- keeps the HTTP API available if Discord bot auth fails, while Discord-only features stay disabled until creds are
  fixed

## Who It Is For

- Server admins configuring Discord and onboarding
- Contributors working on Discord, notifications, and Kavita bridge behavior

## When An Admin Needs To Care

- when setting up or changing the Discord bot
- when slash commands appear in Discord but Portal still denies them because the configured execution gate targets a
  different guild
- when configuring or rotating the Discord superuser allowed to run the private `downloadall` DM command
- when `/scan` reports that Portal's `KAVITA_API_KEY` is missing admin scan access
- when user onboarding, chapter release posts, or recommendation notifications break
- when Kavita handoff or metadata bridge features fail

## How It Fits Into Noona

Portal is not the first thing admins install directly. Warden manages it as part of the stack, Moon exposes its
settings, and Discord users see its behavior through the bot and onboarding links. Portal reaches shared storage
through Vault instead of resolving managed Redis directly. If Discord auth breaks, Portal now degrades to API-only mode
so website and bridge routes can stay healthy while the bot, presence, and notification loops remain off.

## Next Steps

- Admin install and operations: [../../ServerAdmin.md](../../ServerAdmin.md)
- Internal editing guide: [../../docs/agents/portal/README.md](../../docs/agents/portal/README.md)
