# Monorepo Tree

This is the `M0.2` repository skeleton.

```text
.
├── apps
│   ├── admin
│   ├── api
│   ├── web
│   └── worker
├── contracts
│   └── solana
├── docs
├── infra
│   ├── docker
│   └── scripts
├── packages
│   ├── agent-core
│   ├── config
│   ├── constants
│   ├── game-engine
│   ├── hooks
│   ├── mcp-tools
│   ├── rule-compiler
│   ├── rule-runtime
│   ├── rule-schema
│   ├── rule-test-harness
│   ├── sdk
│   ├── types
│   └── validation
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

## Package Boundaries

- `apps/web`: public mobile-first DApp.
- `apps/admin`: restricted admin insights console.
- `apps/api`: HTTP API boundary.
- `apps/worker`: async job and queue boundary.
- `packages/*`: shared code and domain contracts.
- `contracts/solana`: on-chain source of truth for Solana programs.
- `infra/*`: local runtime, deployment, and developer scripts.
