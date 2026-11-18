# Tywish

Tywish is a mobile-first game on Solana where players pick six numbers and vote on an alternative way to win each round. Players describe rules in plain language to the AI Dealer, which turns an accepted proposal into a rule the game can evaluate deterministically.

## Watch a round

[![Tywish round demo preview](apps/web/public/videos/tywish-round-poster.jpg)](https://raw.githubusercontent.com/IagoPrandi/ai-dealer/main/apps/web/public/videos/tywish-round.mp4)

[Watch the 48-second demo (MP4)](https://raw.githubusercontent.com/IagoPrandi/ai-dealer/main/apps/web/public/videos/tywish-round.mp4). The recording uses the desktop interface and sample data to show a player writing a rule, picking numbers, voting, and seeing the result.

## How a rule becomes part of the game

1. **Describe a condition.** For example, “Win if at least four of my six picks appear among the drawn numbers.” The Dealer screens the input and presents its interpretation for confirmation.
2. **Compile and validate.** The pipeline compiles the confirmed interpretation into a constrained rule representation, then checks its structure and tests its behavior on example guesses and draws.
3. **Select and lock a rule.** Eligible proposals take part in the round's election. The active alternative rule is locked before the draw.
4. **Evaluate the result.** The deterministic runtime evaluates the locked rule against the guess and the draw. The AI Dealer handles interpretation and compilation. See the [game rules](docs/product-rule-summary.md) and [rule representation](docs/rule-algebra-core-design.md).

### Rule validation and security architecture

```mermaid
flowchart TD
  request["Player describes a winning condition"]

  subgraph interpretation["Free preflight · API interpretation"]
    screen{"Sanitize input and check byte and token limits,<br/>prompt injection, and external dependencies"}
    interpret["In parallel · interpret the rule, check input safety with Jev,<br/>and verify a claim ledger against the original text"]
    approval{"Safe, clear, and confirmed by the player?"}
    screen -->|Pass| interpret --> approval
  end

  subgraph compilation["Free preflight · API compilation and validation"]
    recheck["Recheck input safety and verify the approved<br/>claim ledger server-side"]
    compilers["Two independent models compile the same sanitized text<br/>into candidate syntax trees (ASTs) under a constrained schema"]
    astGate["Validate both ASTs against the schema and runtime limits<br/>and test for vacuous, impossible, or always-true rules"]
    compare["Compare behavior on rule-specific cases<br/>and 200 seeded scenarios"]
    artifact["Jev checks candidate behavior against the claims<br/>using computed boundary cases"]
    policy["Check material effects and compare the canonical AST<br/>signature with rules elected in prior rounds"]
    valid["VALID preflight ready for submission<br/>Rule artifact hash, preflight hash, and win/lose examples"]
    recheck --> compilers --> astGate --> compare --> artifact --> policy -->|Cleared| valid
  end

  subgraph submission["Proposal submission and round execution"]
    sign["Player reviews the examples and signs the proposal on Solana"]
    bind["API and worker verify the artifact hash and bind<br/>the same compiled rule to the proposal"]
    runtime["Election locks the active rule's artifact hash before the draw<br/>and the runtime evaluates the rule deterministically"]
    sign --> bind --> runtime
  end

  request --> screen
  approval -->|Confirmed| recheck
  valid --> sign

  stop["Stop before payment and return a reason"]
  clarify["Ask the player to clarify or confirm the effect"]
  screen -->|Blocked| stop
  approval -->|Unsafe or safety unresolved| stop
  approval -->|Unclear| clarify
  recheck -->|Verification failed| stop
  astGate -->|No viable pair| stop
  artifact -->|Rejected or disagreement unresolved| stop
  policy -->|Policy blocks submission| stop
  policy -->|Confirmation required| clarify
```

The claim ledger records the conditions and open choices in the player's wording. The server always repeats safety and ledger structure checks during compilation. It can reuse the earlier Jev ledger verdict if a server-signed attestation is valid. The artifact check requires semantic support by default. If the two candidates behave differently, exactly one must be supported for the rule to proceed. [Preflight specification](PRD.md#615-rule-preflight-and-canonical-signature-re-proposal-gate) · [API implementation](apps/api/src/index.ts)

## Try it locally

Use Git, Node.js 24 or later, and pnpm 10.27.0. Run the UI gallery to explore sample screens without a backend, model credentials, or a wallet.

```bash
git clone https://github.com/IagoPrandi/ai-dealer.git
cd ai-dealer
pnpm install --frozen-lockfile
cp .env.example .env
pnpm --filter @tyche/web dev:mock
```

In PowerShell, use `Copy-Item .env.example .env` to create the file. The web app reads `NEXT_PUBLIC_SOLANA_RPC_URL` from the workspace environment, including in gallery mode. The example supplies a public devnet URL.

Open [the UI gallery](http://localhost:3000/dev/gallery). The [home page](http://localhost:3000) also plays the product recording.

### Run the development stack

Install Docker with Compose and stop the gallery before starting the standard web server on the same port. For live devnet use, set `NEXT_PUBLIC_SOLANA_RPC_URL` to your devnet RPC endpoint.

For local exploration, set `TYCHE_TURN_AUTOMATION_ENABLED=false` in `.env`. Compose expects existing local volumes for PostgreSQL and Redis.

```bash
docker volume create tyche-postgres-data
docker volume create tyche-redis-data
docker compose up -d postgres redis
```

Start each service in a separate terminal.

| Service          | Command                           | Local URL                                    |
| ---------------- | --------------------------------- | -------------------------------------------- |
| Web              | `pnpm --filter @tyche/web dev`    | [localhost:3000](http://localhost:3000)      |
| API              | `pnpm --filter @tyche/api dev`    | [Health check](http://localhost:3002/health) |
| Worker           | `pnpm --filter @tyche/worker dev` | [Health check](http://localhost:3003/health) |
| Admin (optional) | `pnpm --filter @tyche/admin dev`  | [localhost:3001](http://localhost:3001)      |

To exercise live rule compilation, configure the chat model and credentials, two distinct compiler models (`LLM_MODEL_COMPILE` and `LLM_MODEL_COMPILE_B`), and the semantic review endpoint (`JEV_ENDPOINT`). The [environment template](.env.example) documents each role and its provider requirements. The [local runbook](docs/local-development-runbook.md) covers local configuration, and the [devnet runbook](docs/devnet-turn-operations-runbook.md) covers configured test wallets, turn authority, and on-chain test rounds.

## Repository map

| Path                                                                                                                                                                 | Responsibility                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [`apps/web`](apps/web)                                                                                                                                               | Next.js progressive web app for play, proposals, voting, and round history                              |
| [`apps/api`](apps/api) and [`apps/worker`](apps/worker)                                                                                                              | Rule conversations, proposal validation, and background round operations backed by PostgreSQL and Redis |
| [`packages/rule-compiler`](packages/rule-compiler), [`packages/rule-runtime`](packages/rule-runtime), and [`packages/rule-test-harness`](packages/rule-test-harness) | Compile, evaluate, and test rule artifacts                                                              |
| [`contracts/solana`](contracts/solana)                                                                                                                               | Rust/Anchor programs and on-chain instruction tests                                                     |

Tywish is the product name. The workspace uses `@tyche/*` for packages and `TYCHE_*` for environment variables.

## Development checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For deployment and infrastructure, see the [AWS guide](infra/aws/README.md) and [CI workflows](.github/workflows).
