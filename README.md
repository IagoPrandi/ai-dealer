# Tywish

Tywish is a mobile-first Solana DApp monorepo for a social lottery game where each turn can have a community-elected alternative winning rule.

## Naming

The project carries two names. **Tywish** is the commercial name and the only one a player
ever sees. **`tyche`** is the internal codename and stays in every technical identifier:
the `@tyche/*` package scope, the `TYCHE_*` environment prefix, the Docker project and
volumes, the Postgres database, the Rust crate and its `tyche.so` artifact, and all
deployed or hash-verified manifests. `tyche` in the code is deliberate, not a leftover.

The commercial name has one source of truth, `BRAND_NAME` in `packages/config`; the static
PWA manifest duplicates it because it cannot import.

## Workspace

This repository uses `pnpm` workspaces and Turborepo.

```text
apps/
  web/       Public mobile-first DApp
  api/       Backend API service
  worker/    Background jobs and queues
  admin/     Restricted admin insights console
packages/
  config/    Shared TypeScript and lint configuration
  constants/ Shared game constants and fee defaults
  types/     Shared TypeScript types
  validation/ Shared validation helpers
  sdk/       Client SDK and API/on-chain helpers
  rule-*     Rule schema, compiler, runtime, and test harness packages
  game-engine/
  hooks/
  mcp-tools/
  agent-core/
contracts/
  solana/    Solana program workspace placeholder
infra/
  docker/    Docker support
  scripts/   Local/dev scripts
```

## Local Setup

Prerequisites:

- Node.js 24+
- pnpm 10.27.0+

Install dependencies:

```bash
pnpm install
```

Run workspace checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Local Development

Docker runs only the local data stores. Start PostgreSQL and Redis:

```bash
docker compose up -d postgres redis
```

Run application services from the host in separate terminals:

```bash
pnpm --filter @tyche/api dev
pnpm --filter @tyche/worker dev
pnpm --filter @tyche/web dev
pnpm --filter @tyche/admin dev
```

Stop the Dockerized data stores:

```bash
docker compose down
```

See [docs/local-development-runbook.md](docs/local-development-runbook.md) for environment setup, health checks, and local URLs.

For controlled real-Solana devnet operations, including starting the
containerized services and opening a short test turn, see
[docs/devnet-turn-operations-runbook.md](docs/devnet-turn-operations-runbook.md).

## Deployment

The backend (`apps/api` + `apps/worker`) runs on AWS and the frontend
(`apps/web`, `apps/admin`) on Vercel, both delivered by GitHub Actions:

| Workflow | Trigger | Does |
| --- | --- | --- |
| [ci.yml](.github/workflows/ci.yml) | pull request | format, lint, typecheck, test, build, dependency and secret scan |
| [deploy-backend.yml](.github/workflows/deploy-backend.yml) | push to `main` | build and publish the image, roll it out over SSM, smoke test, roll back on failure |
| [deploy-web.yml](.github/workflows/deploy-web.yml) | pull request / push to `main` | Vercel preview / production |
| [infra.yml](.github/workflows/infra.yml) | pull request | Terraform format, validate, plan (apply stays manual) |
| [solana-program.yml](.github/workflows/solana-program.yml) | `contracts/solana` changes | Rust checks and the SBF instruction suite |

Bootstrap, cost breakdown, secrets layout, rollback, and the reasoning behind
the single-instance topology are in
[infra/aws/README.md](infra/aws/README.md).

## Boundary Rules

- The public DApp is mobile-first.
- The admin console is separate from the public DApp and must not manipulate live game outcomes.
- Financial and authorization invariants belong on-chain when they decide payouts or critical user permissions.
- Backend and worker services support UX, orchestration, indexing, queueing, and operational workflows.
- Shared business rules should live in packages, not duplicated across apps.
