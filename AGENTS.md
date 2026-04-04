# Repository Agent Guide

Read this before editing Noona.

## Audience Split

- Public and self-hoster docs live in the root and service `README.md` files.
- Server admin docs live in [ServerAdmin.md](ServerAdmin.md).
- AI contributor detail lives in `AGENTS.md` files and [docs/agents/README.md](docs/agents/README.md).

## Hard Rules

- Keep changes scoped to the request.
- Preserve user changes you did not make.
- Read the closest service `AGENTS.md` before editing under `services/`.
- Keep public README files user-focused. Move implementation detail into `docs/agents/`.
- If runtime behavior, setup flow, storage layout, roles, or admin workflow changes, update the nearest public README
  and [ServerAdmin.md](ServerAdmin.md) in the same change.
- If invariants, file ownership, or internal workflows change, update the matching file under `docs/agents/`.
- When adding or moving major docs, keep links in this file and [README.md](README.md) current.

## Start Here

- [Public repo README](README.md)
- [Server admin guide](ServerAdmin.md)
- [AI docs index](docs/agents/README.md)
- [Warden AI docs](docs/agents/warden/README.md)
- [Moon AI docs](docs/agents/moon/README.md)
- [Portal AI docs](docs/agents/portal/README.md)
- [Sage AI docs](docs/agents/sage/README.md)
- [Raven AI docs](docs/agents/raven/README.md)
- [Vault AI docs](docs/agents/vault/README.md)
- [Kavita AI docs](docs/agents/kavita/README.md)
- [Komf AI docs](docs/agents/komf/README.md)

## Repo Workflows

- Regenerate API docs with `npm run docs`. This writes `docs/docs.json` from JSDoc output plus Raven Javadocs.
- Inspect or publish Docker images with `npm run docker:list`, `npm run docker:build`, `npm run docker:push`, and
  `npm run docker:publish`.
- Bootstrap Warden locally with [scripts/run-warden.ps1](scripts/run-warden.ps1) on PowerShell
  or [scripts/run-warden.sh](scripts/run-warden.sh) on bash-compatible shells.
