# Idealer

Idealer is a mobile-first Solana DApp monorepo for a social lottery game where each turn can have a community-elected alternative winning rule.

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

Run the public DApp:

```bash
pnpm --filter @idealer/web dev
```

Run the admin console:

```bash
pnpm --filter @idealer/admin dev
```

Run backend stubs:

```bash
pnpm --filter @idealer/api dev
pnpm --filter @idealer/worker dev
```

## Boundary Rules

- The public DApp is mobile-first.
- The admin console is separate from the public DApp and must not manipulate live game outcomes.
- Financial and authorization invariants belong on-chain when they decide payouts or critical user permissions.
- Backend and worker services support UX, orchestration, indexing, queueing, and operational workflows.
- Shared business rules should live in packages, not duplicated across apps.
