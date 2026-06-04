# Progress Tracker

This tracker records milestone status, work logs, and required document confirmations for Idealer implementation.

## Required Markdown Confirmation

Opened before starting `M0.1`:

- `PRD.md`
- `AGENTS.md`
- `.claude/skills/best-practices/SKILL.md`
- `.claude/skills/best-practices/references/agent-principles.md`

## Milestone Status

| Milestone | Name | Status | User Confirmation | Notes |
|---|---|---|---|---|
| M0.1 | PRD Baseline | Completed | Confirmed 2026-06-02 | Required artifacts implemented, consistency-checked, and marked complete after user confirmation. |
| M0.2 | Monorepo Skeleton | Completed | Confirmed 2026-06-02 | Skeleton, workspace configs, README, and verification commands completed. |
| M0.3 | Docker Baseline | Completed | Confirmed 2026-06-02 | Required Docker stack implemented, verified, and marked complete. |
| M0.4 | Technical Contracts | Completed | Confirmed 2026-06-03 | Required contract drafts implemented, validated, and marked complete after user confirmation. |
| M0.5 | Mobile UX Flow Baseline | Completed | Confirmed 2026-06-03 | Required UX flow artifacts implemented, validated, and marked complete after user confirmation. |
| M0.6 | Not defined in PRD | Blocked | Pending | No M0.6 section exists in `PRD.md`; the next defined milestone is M1.1. |
| M1.1 | Mobile Live Round Hub | Completed | Confirmed 2026-06-03 | Public `/play` hub implemented, validated, and marked complete after user confirmation. |
| M1.2 | Mobile Number Picker | Completed | Confirmed 2026-06-04 | Number picker flow implemented, validated, and marked complete after user confirmation. |
| M1.3 | Free-Form Rule Composer | Completed | Confirmed 2026-06-04 | Free-form rule proposal flow implemented, validated, and marked complete after user confirmation. |
| M1.4 | Voting Flow | Completed | Confirmed 2026-06-04 | Mobile voting flow implemented, validated, and marked complete after user confirmation. |
| M1.5 | Simulated Turn Cycle | Completed | Confirmed 2026-06-04 | Variable turn-cycle simulator implemented, validated, and marked complete after user confirmation. |
| M1.6 | Simulated Result, Near-Miss & Creator Outcome | Completed | Confirmed 2026-06-04 | Simulated result flow implemented, validated, and marked complete after user confirmation. |
| M1.7 | Mobile Share Card Prototype | Implemented, awaiting confirmation | Pending | Mobile share card generator implemented and validated. PRD checkboxes remain pending user confirmation. |

## M0.1 Work Log

### 2026-06-02

- Opened `PRD.md`, `AGENTS.md`, `.claude/skills/best-practices/SKILL.md`, and `.claude/skills/best-practices/references/agent-principles.md` again before implementing `M0.1`.
- Ran a consistency pass across `PRD.md`, `docs/product-rule-summary.md`, `docs/mvp-decision-registry.md`, and `PROGRESS_TRACKER.md`.
- Corrected the project turn-duration source of truth to `2h -> 2h -> 8h -> 8h -> repeat`.
- Marked M0.1 checklist, approval criteria, and required artifacts complete after user confirmation.
- Started M0.2.

### 2026-06-02

- Opened `PRD.md` before changing creator reward terms, as required.
- Opened `AGENTS.md` and `.claude/skills` before changing documentation, as required.
- Opened `.claude/skills/best-practices/SKILL.md` and its required `references/agent-principles.md`.
- Updated creator reward documentation in `PRD.md`, `docs/product-rule-summary.md`, and `docs/mvp-decision-registry.md` from 2% to 15% of each individual alternative-rule winner payout.
- Confirmed the reward source as the creator reward reserve sourced from platform monetization, with winner-visible payouts unchanged.
- Did not tick milestone approval items because user confirmation is still required.

### 2026-06-01

- Opened `PRD.md` before work, as required.
- Opened `AGENTS.md` and confirmed project instructions.
- Opened `.claude/skills` and selected `best-practices` as the relevant local skill for product and architecture baseline work.
- Opened `best-practices` required `references/agent-principles.md`.
- Created `docs/product-rule-summary.md`.
- Created `docs/mvp-decision-registry.md`.
- Created this `PROGRESS_TRACKER.md`.
- Did not tick `M0.1` approval or checklist items because user confirmation is required first.

## M0.1 Artifact Review

| Artifact | Status | Notes |
|---|---|---|
| `PRD.md` | Present | Reviewed as the source of truth. No direct PRD checkbox changes were made. |
| `docs/product-rule-summary.md` | Implemented | Summarizes core product, rule, economy, election, admin, and implementation constraints. |
| `docs/mvp-decision-registry.md` | Implemented | Captures the 27 binding MVP decisions from PRD section 16. |
| `PROGRESS_TRACKER.md` | Implemented | Tracks status, required document confirmation, and M0.1 validation notes. |

## M0.1 Validation Results

| Requirement | Result |
|---|---|
| Mobile-first DApp and desktop secondary surface | Confirmed in `PRD.md` and `docs/product-rule-summary.md`. |
| Free-form rule creation and AI-context token limit | Confirmed in `PRD.md`, `docs/product-rule-summary.md`, and `docs/mvp-decision-registry.md`. |
| `RULE_MAX_TOKENS` value | Confirmed as `80`. |
| Turn duration cycle | Confirmed as `2h -> 2h -> 8h -> 8h -> repeat`. |
| Winning conditions | Confirmed as original rule and active alternative rule. |
| Game Token gating | Confirmed for proposing, voting, removing, and reporting rules. |
| Rule election policy | Confirmed as 3 top-voted eligible rules plus 7 VRF-random eligible rules when at least 10 eligible rules exist. |
| Randomness provider | Confirmed as Switchboard VRF for draw and rule election. |
| Fallback behavior | Confirmed no deterministic fallback finalist activation. |
| Paid rule removal | Confirmed as included in MVP with prize-pool fee destination. |
| Creator reward | Confirmed as 15% of each individual alternative-rule winner payout, funded from the creator reward reserve sourced from platform monetization. |
| Admin console scope | Confirmed separate from public DApp and limited to insights, not direct game manipulation. |
| Implementation constraints | Confirmed monorepo and Docker Compose as required constraints. |

## Confirmation Gate

`M0.1` was marked complete after user confirmation on 2026-06-02.

## M0.2 Work Log

### 2026-06-02

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before starting M0.2, as required.
- Used `.claude/skills/best-practices/SKILL.md` with `references/agent-principles.md` and `references/architecture.md`.
- Used frontend and Next.js guidance for the public DApp and admin console skeleton.
- Created `apps/web`, `apps/api`, `apps/worker`, and `apps/admin`.
- Created required shared packages under `packages/*`.
- Created `contracts/solana`, `infra/docker`, and `infra/scripts`.
- Added root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`, `.gitignore`, `eslint.config.mjs`, and `README.md`.
- Added `docs/monorepo-tree.md`.
- Installed dependencies from the root with `pnpm install`.
- Verified workspace targeting with `pnpm workspace:list`.
- Verified root commands with `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.
- Started local dev servers for the public DApp and admin console.
- Verified `http://localhost:3000` and `http://localhost:3001` return HTTP 200.
- Kept the project turn-duration source of truth as `2h -> 2h -> 8h -> 8h -> repeat`.
- Marked M0.2 checklist, approval criteria, and required artifacts complete after user confirmation.

## M0.2 Artifact Review

| Artifact | Status | Notes |
|---|---|---|
| Monorepo tree | Implemented | See `docs/monorepo-tree.md`. |
| Root README | Implemented | Includes workspace layout, setup commands, and boundary rules. |
| Workspace/package manager config | Implemented | Uses `pnpm-workspace.yaml`, `package.json`, and Turborepo. |

## M0.2 Validation Results

| Requirement | Result |
|---|---|
| Repository can install dependencies from the root | Passed with `pnpm install`. |
| Workspace commands can target each app/package | Passed with `pnpm workspace:list`. |
| Empty or stub apps build without fatal errors | Passed with `pnpm build`. |
| Folder boundaries are clear and documented | Documented in `README.md` and `docs/monorepo-tree.md`. |
| Local public DApp dev server | Running at `http://localhost:3000`; HTTP 200 verified. |
| Local admin dev server | Running at `http://localhost:3001`; HTTP 200 verified. |

## M0.2 Confirmation Gate

`M0.2` was marked complete after user confirmation on 2026-06-02.

## M0.3 Work Log

### 2026-06-02

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before starting M0.3, as required.
- Used `.claude/skills/best-practices/SKILL.md` with `references/agent-principles.md`, `references/architecture.md`, and `references/deploy-release.md`.
- Added API and worker health endpoints that fail closed unless Postgres and Redis are reachable.
- Added `docker-compose.yml` with explicit `name: idealer`, required services, optional profiles, network, volumes, and health checks.
- Added `.env.example`.
- Added `infra/docker/Dockerfile.node`.
- Added `infra/docker/prometheus/prometheus.yml`.
- Added `docs/local-development-runbook.md`.
- Updated `README.md` with Docker startup, shutdown, and reset commands.
- Ran `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.
- Ran `docker compose config --quiet`.
- Ran `docker compose up --build -d postgres redis api worker web`.
- Verified required containers are healthy: `idealer-postgres`, `idealer-redis`, `idealer-api`, `idealer-worker`, and `idealer-web`.
- Verified API health returns Postgres and Redis `ok`.
- Verified worker health returns Postgres and Redis `ok`.
- Verified web returns HTTP 200.
- Verified the web container can reach the API through the internal Docker network.
- Verified optional profiles with `docker compose --profile admin --profile observability --profile mail config --quiet`.
- Re-verified M0.3 services on 2026-06-02.
- Marked M0.3 checklist, approval criteria, and required artifacts complete after user confirmation.

## M0.3 Artifact Review

| Artifact | Status | Notes |
|---|---|---|
| `docker-compose.yml` | Implemented | Defines required and optional containers, network, volumes, and health checks. |
| `.env.example` | Implemented | Defines `COMPOSE_PROJECT_NAME=idealer` and local-only example values. |
| Local development runbook | Implemented | See `docs/local-development-runbook.md`. |

## M0.3 Validation Results

| Requirement | Result |
|---|---|
| `docker compose up` starts required services | Passed with `docker compose up --build -d postgres redis api worker web`. |
| Container names follow `idealer-*` | Passed in `docker compose ps`. |
| API can connect to Postgres and Redis | Passed via `http://localhost:3002/health`. |
| Worker can connect to Redis and database | Passed via `http://localhost:3003/health`. |
| Web can reach API locally | Passed from inside `idealer-web` to `http://api:3002/health`. |
| Health checks report healthy services | Passed in `docker compose ps`. |

## M0.3 Confirmation Gate

`M0.3` was marked complete after user confirmation on 2026-06-02.

## M0.4 Work Log

### 2026-06-02

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before starting M0.4, as required.
- Used `.claude/skills/best-practices/SKILL.md` with `references/agent-principles.md`, `references/architecture.md`, `references/web2-backend.md`, `references/web3-contracts.md`, `references/observability.md`, and `references/deploy-release.md`.
- Used `.claude/skills/solana-dev/SKILL.md` for Solana account and instruction draft boundaries.
- Used `.claude/skills/develop-frontend/SKILL.md` and the Next.js guidance skill for frontend/API contract compatibility.
- Added `docs/technical-contracts-index.md`.
- Added `docs/api-contracts.md`.
- Added `docs/data-model-draft.md`.
- Added `docs/queue-job-contracts.md`.
- Added `docs/agent-schema-draft.md`.
- Added `docs/smart-contract-account-instruction-draft.md`.
- Added `docs/admin-metrics-dictionary.md`.
- Added `docs/shared-error-codes.md`.
- Added shared error-code exports in `packages/constants/src/error-codes.ts` and `packages/constants/src/index.ts`.
- Confirmed the turn-duration source of truth remains `2h -> 2h -> 8h -> 8h -> repeat`.
- Left M0.4 PRD checklist, approval criteria, and required artifacts unchecked pending user confirmation.

### 2026-06-03

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before verifying M0.4 and starting M0.5, as required.
- Rechecked the M0.4 artifact set and validation log.
- Marked M0.4 checklist, approval criteria, and required artifacts complete after user confirmation.

## M0.4 Artifact Review

| Artifact | Status | Notes |
|---|---|---|
| API contract document | Implemented | See `docs/api-contracts.md`; includes response envelope, shared models, mocked frontend-ready endpoints, auth notes, and shared error behavior. |
| Data model draft | Implemented | See `docs/data-model-draft.md`; includes turns, rules, votes, guesses, logs, jobs, creator rewards, admin metrics, and pgvector HNSW migration. |
| Queue/job contract draft | Implemented | See `docs/queue-job-contracts.md`; includes job envelope, payloads, retries, idempotency, and terminal failure states. |
| Agent schema draft | Implemented | See `docs/agent-schema-draft.md`; includes compiler IO, `RuleDedupResult`, `GateCheckLog`, `CompilerAgentLog`, confidence breakdown, and rule state machine. |
| Smart contract account/instruction draft | Implemented | See `docs/smart-contract-account-instruction-draft.md`; includes account model, Game Token PDA validation contract, instruction list, and emitted events. |
| Admin metrics dictionary | Implemented | See `docs/admin-metrics-dictionary.md`. |
| Shared error codes | Implemented | See `docs/shared-error-codes.md` and `packages/constants/src/error-codes.ts`. |

## M0.4 Validation Results

| Requirement | Result |
|---|---|
| Frontend can be implemented against mocked API contracts | Passed; API contract defines stable `/api/v1` envelopes, endpoint paths, inputs, outputs, and error codes. |
| Backend can be implemented against database and queue contracts | Passed; data model and queue contracts define persistence, idempotency, retries, and failure states. |
| Worker jobs have clear inputs, outputs, retry behavior, and failure states | Passed; queue contract defines required job types and execution semantics. |
| Smart contract state aligns with backend state assumptions | Passed; Solana account draft defines on-chain source-of-truth boundaries and backend projection assumptions. |
| AI agent schemas include confidence breakdown and audit fields | Passed; agent schema includes composite confidence, audit fields, and compiler logs. |
| Typecheck | Passed with `pnpm typecheck`. |
| Lint | Passed with `pnpm lint`. |
| Tests | Passed with `pnpm test`. |
| Build | Passed with `pnpm build`. |
| Whitespace check | Passed with `git diff --check`; Git reported CRLF normalization warnings only. |

## M0.4 Confirmation Gate

`M0.4` was marked complete after user confirmation on 2026-06-03.

## M0.5 Work Log

### 2026-06-03

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before starting M0.5, as required.
- Used `.claude/skills/best-practices/SKILL.md` with `references/agent-principles.md` and `references/architecture.md`.
- Used `.claude/skills/develop-frontend/SKILL.md`, `checklists/checklist_pronto.md`, and `templates/prompt_de_revisao.md` for mobile-first UX, state, accessibility, and responsive constraints.
- Used `.claude/skills/web2-wallet-auth/SKILL.md` for wallet connection, transaction approval, and return-to-DApp flow considerations.
- Reviewed `docs/api-contracts.md` and `docs/product-rule-summary.md` to align M0.5 with current API and product rules.
- Added `docs/mobile-user-flow-diagram.md`.
- Added `docs/mobile-low-fidelity-wireframes.md`.
- Added `docs/mobile-ux-state-map.md`.
- Covered `/play` as the primary mobile entry point.
- Covered first-time, returning, wallet connection, wallet transaction approval, number selection, free-form rule proposal, token-limit warning and rejection, voting, active Rule of the Hour, draw/result, near-miss, creator reward/status, share card, and empty/loading/failed/delayed states.
- Confirmed no critical screen depends on desktop layout.
- Left M0.5 PRD checklist, approval criteria, and required artifacts unchecked pending user confirmation.

### 2026-06-03

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before verifying M0.5, as required.
- Rechecked the M0.5 artifact set against the PRD checklist.
- Marked M0.5 checklist, approval criteria, and required artifacts complete after user confirmation.
- Searched for `M0.6` in `PRD.md`, `PROGRESS_TRACKER.md`, and `docs`; no M0.6 milestone is defined.
- Confirmed the next defined PRD milestone after M0.5 is `M1.1 - Mobile Live Round Hub`.

## M0.5 Artifact Review

| Artifact | Status | Notes |
|---|---|---|
| Mobile user flow diagram | Implemented | See `docs/mobile-user-flow-diagram.md`; includes `/play`, first-time, returning, wallet, transaction return, number, rule, vote, result, reward, and share flows. |
| Low-fidelity wireframes | Implemented | See `docs/mobile-low-fidelity-wireframes.md`; includes mobile shell, live hub, first-time, number picker, approval, rule proposal, voting, active rule, results, and state wireframes. |
| UX state map | Implemented | See `docs/mobile-ux-state-map.md`; includes route, wallet, transaction, number, rule proposal, voting, active rule, draw/result/reward, and share states. |

## M0.5 Validation Results

| Requirement | Result |
|---|---|
| New user can understand intended game loop from flow diagrams | Passed; first-time flow and core game loop are documented. |
| Mobile wallet interruption and return behavior are represented | Passed; sequence diagram and transaction states preserve originating action and return behavior. |
| Core actions are reachable with mobile-first navigation | Passed; shared mobile shell and flows keep pick, rules, voting, results, and share reachable from `/play`. |
| No critical screen depends on desktop layout | Passed; all wireframes are mobile-first and specify minimum 320px behavior. |

## M0.5 Confirmation Gate

`M0.5` was marked complete after user confirmation on 2026-06-03.

## M0.6 Status

`M0.6` is not defined in `PRD.md`. Work cannot be started under that milestone without adding a PRD section or confirming that the intended next milestone is `M1.1 - Mobile Live Round Hub`.

## M1.1 Work Log

### 2026-06-03

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before starting M1.1, as required.
- Used `.claude/skills/best-practices/SKILL.md` with `references/agent-principles.md`, `references/architecture.md`, and `references/code-quality.md`.
- Used `.claude/skills/develop-frontend/SKILL.md` for mobile-first layout, state coverage, accessibility, and responsive constraints.
- Used the Next.js App Router guidance skill for route/component structure.
- Used `.claude/skills/playwright/SKILL.md`; `playwright-cli` wrapper was unavailable, so the official `npx playwright` CLI was used after installing the Chromium browser cache.
- Added `/play` as the public mobile game route.
- Redirected `/` to `/play`.
- Added `MobileLiveRoundHub` with current turn id, turn duration and cycle position, countdown, prize pool, leading Rule of the Hour, primary bottom CTA, secondary actions, compact activity feed, and next milestones.
- Added loading, empty, and delayed states switchable from the prototype state control.
- Added mobile sticky header and bottom action area.
- Updated global web styles for mobile-first layout, stable controls, focus states, and fixed navigation that does not cover scrollable content.
- Added `.next-dev-logs/` and `output/` to `.gitignore` for local dev-server and screenshot artifacts.
- Left M1.1 PRD checklist and approval criteria unchecked pending user confirmation.

### 2026-06-03

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before verifying M1.1 and starting M1.2, as required.
- Rechecked the M1.1 artifact set and validation results against the PRD checklist.
- Marked M1.1 checklist and approval criteria complete after user confirmation.
- Started M1.2.

## M1.1 Artifact Review

| Artifact | Status | Notes |
|---|---|---|
| `apps/web/src/features/live-round/MobileLiveRoundHub.tsx` | Implemented | Contains the interactive mobile hub, state control, live state, loading state, empty state, delayed state, header, CTA, activity feed, and milestone timeline. |
| `apps/web/src/app/play/page.tsx` | Implemented | Exposes the `/play` route. |
| `apps/web/src/app/page.tsx` | Implemented | Redirects `/` to `/play`. |
| `apps/web/src/app/globals.css` | Implemented | Defines the mobile-first shell, responsive layout, sticky header, fixed bottom CTA, state panels, and accessible focus states. |

## M1.1 Validation Results

| Requirement | Result |
|---|---|
| User can identify prize, countdown, and next action in under 10 seconds | Passed; these appear in the sticky header and first viewport. |
| Screen works on common mobile viewport sizes | Passed for `390x844` screenshot; layout reserves space above the bottom CTA and avoids overlap. |
| Bottom CTA remains reachable with one-handed use | Passed; fixed bottom CTA remains visible on `/play`. |
| Root route reaches primary play route | Passed; `/` returns `307` to `/play`. |
| Play route loads | Passed; `/play` returns HTTP `200`. |
| Typecheck | Passed with `pnpm typecheck`. |
| Lint | Passed with `pnpm lint`. |
| Tests | Passed with `pnpm test`. |
| Build | Passed with `pnpm build`; `/play` is included in generated routes. |
| Visual verification | Passed with Playwright screenshots at `390x844` and `1440x1000`; screenshots are local ignored artifacts under `output/playwright/`. |
| Whitespace check | Passed with `git diff --check`; Git reported CRLF normalization warnings only. |

## M1.1 Confirmation Gate

`M1.1` was marked complete after user confirmation on 2026-06-03.

## M1.2 Work Log

### 2026-06-03

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before starting M1.2, as required.
- Used `.claude/skills/best-practices/SKILL.md` with `references/agent-principles.md`, `references/architecture.md`, and `references/code-quality.md`.
- Used `.claude/skills/develop-frontend/SKILL.md` for mobile-first number selection, stable tile dimensions, accessible controls, state coverage, and responsive constraints.
- Used the Next.js App Router guidance skill for route/component structure.
- Added `NumberPicker` under `apps/web/src/features/number-picker/NumberPicker.tsx`.
- Added `/play/pick` under `apps/web/src/app/play/pick/page.tsx`.
- Connected the `MobileLiveRoundHub` primary CTA to `/play/pick`.
- Implemented numbers 1 to 100 in a mobile-friendly grid.
- Enforced exactly 6 selected numbers before review.
- Prevented duplicate selections through toggle semantics and disabled unselected tiles when the selection is full.
- Added sticky selected-number tray with remove/edit behavior.
- Added randomize and clear actions.
- Added incomplete-selection validation messaging.
- Added review step before simulated submission.
- Added success state after simulated submission.
- Added Playwright e2e coverage for the complete simulated number submission flow.
- Left M1.2 PRD checklist and approval criteria unchecked pending user confirmation.

## M1.2 Artifact Review

| Artifact | Status | Notes |
|---|---|---|
| `apps/web/src/features/number-picker/NumberPicker.tsx` | Implemented | Contains selection, remove/edit, randomize, clear, validation, review, and success states. |
| `apps/web/src/app/play/pick/page.tsx` | Implemented | Exposes the mobile number picker route. |
| `apps/web/src/features/live-round/MobileLiveRoundHub.tsx` | Updated | Primary bottom CTA now navigates to `/play/pick`. |
| `apps/web/src/app/globals.css` | Updated | Adds stable number tiles, sticky tray, picker header, review state, and bottom action bar styles. |
| `apps/web/e2e/number-picker.spec.ts` | Implemented | Verifies six-number selection, disabled review state, review step, and success state. |
| `apps/web/playwright.config.ts` | Implemented | Runs the web e2e test against a local Next dev server on port 3005. |

## M1.2 Validation Results

| Requirement | Result |
|---|---|
| User can select 6 unique numbers without assistance | Passed; e2e selects `01` through `06` and reaches review. |
| Invalid selections are blocked before submission | Passed; review CTA is disabled before 6 numbers are selected and extra unselected tiles disable at 6. |
| Interaction is usable on mobile without precision tapping | Passed; mobile screenshot at `390x844` shows large stable tiles and thumb-zone bottom actions. |
| Play route links to number picker | Passed; hub primary CTA navigates to `/play/pick`. |
| Number picker route loads | Passed; `/play/pick` returns HTTP `200`. |
| E2E | Passed with `pnpm --filter @idealer/web test:e2e`. |
| Typecheck | Passed with `pnpm typecheck`. |
| Lint | Passed with `pnpm lint`. |
| Tests | Passed with `pnpm test`. |
| Build | Passed with `pnpm build`; `/play/pick` is included in generated routes. |
| Visual verification | Passed with Playwright screenshots at `390x844` and `1440x1000`; screenshots are local ignored artifacts under `output/playwright/`. |
| Whitespace check | Passed with `git diff --check`; Git reported CRLF normalization warnings only. |

## M1.2 Confirmation Gate

`M1.2` was marked complete after user confirmation on 2026-06-04.

## M1.3 Work Log

### 2026-06-04

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before verifying M1.2 and starting M1.3, as required.
- Used `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/code-quality.md`, `.claude/skills/develop-frontend/SKILL.md`, and the Next.js App Router guidance skill.
- Rechecked M1.2 artifacts and validation results against the PRD checklist.
- Marked M1.2 checklist and approval criteria complete after user confirmation.
- Corrected the project turn-duration source of truth and implementation to `2h -> 2h -> 8h -> 8h -> repeat`.
- Added `RuleProposalComposer` with free-form input, approximate live token count, configured maximum, near-limit warning, over-limit rejection, sanitized preview, AI-style preview mock, ambiguity warning mock, inspiration examples, review step, and simulated success state.
- Added `/play/propose` and connected the live-round hub proposal action to it.
- Added Playwright E2E coverage for token-limit rejection and successful simulated proposal.
- Left M1.3 PRD checklist and approval criteria unchecked pending user confirmation.
- Reopened `PRD.md`, `AGENTS.md`, `.claude/skills`, frontend guidance, code-quality guidance, Next.js App Router guidance, and Playwright guidance before verifying M1.3 and starting M1.4.
- Rechecked M1.3 against its checklist and validation evidence.
- Marked M1.3 checklist and approval criteria complete after user confirmation.
- Started M1.4.

## M1.3 Artifact Review

| Artifact | Status | Notes |
|---|---|---|
| `apps/web/src/features/rule-proposal/RuleProposalComposer.tsx` | Implemented | Contains free-form composition, token-limit behavior, sanitized and AI-style previews, ambiguity feedback, review, and success states. |
| `apps/web/src/app/play/propose/page.tsx` | Implemented | Exposes the mobile rule proposal route. |
| `apps/web/src/features/live-round/MobileLiveRoundHub.tsx` | Updated | Proposal action now navigates to `/play/propose`. |
| `apps/web/src/app/globals.css` | Updated | Adds responsive composer, preview, warning, inspiration, review, and success-state styles. |
| `apps/web/e2e/rule-proposal.spec.ts` | Implemented | Verifies token-limit rejection and the complete simulated proposal flow. |

## M1.3 Validation Results

| Requirement | Result |
|---|---|
| Users can write a rule freely | Passed; the composer uses an unrestricted natural-language textarea. |
| Users understand why a rule is rejected for length | Passed; live token count, configured maximum, warning, and disabled review state are visible. |
| UI does not force fixed categories or rule combinations | Passed; examples are inspiration-only text and do not populate the composer. |
| Turn duration cycle | Passed; PRD, product summary, decision registry, tracker, and runtime constant use `2h -> 2h -> 8h -> 8h -> repeat`. |
| Runtime cycle verification | Passed; `getTurnDurationHours` produced `[2, 2, 8, 8, 2, 2, 8, 8]` for cycle indexes 0 through 7. |
| Rule proposal route loads | Passed; `/play/propose` is included in the production build. |
| E2E | Passed with `pnpm --filter @idealer/web test:e2e`; both number picker and rule proposal tests passed. |
| Typecheck | Passed with `pnpm typecheck`. |
| Lint | Passed with `pnpm lint`. |
| Tests | Passed with `pnpm test`. |
| Build | Passed with `pnpm build`; `/play/propose` is included in generated routes. |
| Visual verification | Passed at `390x844` and `1440x1000`; page has content, expected controls render, no framework overlay is present, and no console errors were detected. The unavailable `agent-browser` CLI was replaced explicitly with the installed Playwright browser runtime. |
| Whitespace check | Passed with `git diff --check`; Git reported CRLF normalization warnings only. |

## M1.3 Confirmation Gate

`M1.3` was marked complete after user confirmation on 2026-06-04.

## M1.4 Work Log

### 2026-06-04

- Added `RuleVotingPanel` as an interactive client component while keeping `/play/vote` as a server-rendered App Router page.
- Added proposed-rule cards with original text, explanation, creator, clarity, difficulty, token count, and live vote totals.
- Added current-user vote state, one-tap initial voting, vote changes, immediate feedback, and dynamically updated leading-rule state.
- Added a visible voting-close countdown and plain-language explanation that votes influence the finalist set while VRF selects the Rule of the Hour.
- Added an empty rule-pool prototype state.
- Added live activity events after votes.
- Connected the live-round hub Vote action to `/play/vote`.
- Added Playwright E2E coverage for initial voting, vote changes, leader updates, feedback, activity events, and the empty state.
- Left M1.4 PRD checklist and approval criteria unchecked pending user confirmation.
- Reopened `PRD.md`, `AGENTS.md`, `.claude/skills`, frontend guidance, code-quality guidance, and Playwright guidance before verifying M1.4 and starting M1.5.
- Rechecked M1.4 against its checklist, E2E evidence, and responsive visual evidence.
- Marked M1.4 checklist and approval criteria complete after user confirmation.
- Started M1.5.

## M1.4 Artifact Review

| Artifact | Status | Notes |
|---|---|---|
| `apps/web/src/features/rule-voting/RuleVotingPanel.tsx` | Implemented | Contains proposed-rule cards, live vote totals, user vote state, vote changes, dynamic leader, countdown, feedback, empty state, and activity feed. |
| `apps/web/src/app/play/vote/page.tsx` | Implemented | Exposes the mobile voting route. |
| `apps/web/src/features/live-round/MobileLiveRoundHub.tsx` | Updated | Vote action now navigates to `/play/vote`. |
| `apps/web/src/app/globals.css` | Updated | Adds responsive voting summary, rule cards, metadata, actions, empty state, and activity styles. |
| `apps/web/e2e/rule-voting.spec.ts` | Implemented | Verifies voting, vote change, visible leader update, feedback, activity event, and empty state. |

## M1.4 Validation Results

| Requirement | Result |
|---|---|
| User can vote in one or two taps | Passed; each rule card has a direct vote action and E2E completes an initial vote with one click. |
| User understands that voting influences the Rule of the Hour | Passed; the leading summary explicitly explains finalist-set influence and VRF selection. |
| Leading rule state updates visibly | Passed; E2E confirms `Balanced spread wins` becomes the visible leader immediately after voting. |
| Current user vote and vote change | Passed; selected action and summary show the current vote, and E2E confirms vote changes. |
| Feedback and activity event | Passed; an `aria-live` feedback message and a new activity event appear after each vote. |
| Empty state | Passed; the prototype state control exposes a clear no-eligible-rules state. |
| Live-round hub links to voting route | Passed; Vote navigates to `/play/vote`. |
| Voting route loads | Passed; `/play/vote` returns HTTP `200`. |
| E2E | Passed with `pnpm --filter @idealer/web test:e2e`; all 3 web flows passed. |
| Typecheck | Passed with `pnpm typecheck`. |
| Lint | Passed with `pnpm lint`. |
| Tests | Passed with `pnpm test`. |
| Build | Passed with `pnpm build`; `/play/vote` is included in generated routes. |
| Visual verification | Passed at `320x700`, `390x844`, and `1440x1000`; no horizontal overflow, framework overlay, or console errors were detected. Fixed-header geometry leaves a 12px gap before content. |
| Whitespace check | Passed with `git diff --check`; Git reported CRLF normalization warnings only. |

## M1.4 Confirmation Gate

`M1.4` was marked complete after user confirmation on 2026-06-04.

## M1.5 Work Log

### 2026-06-04

- Added `TurnCycleSimulator` with the fixed `2h -> 2h -> 8h -> 8h -> repeat` sequence.
- Added explicit current cycle step, current duration, next duration, turn number, phase, progress, and time-to-draw displays.
- Added proportional lifecycle milestones for voting close at 75%, guess close at 96.7%, and draw/rollover at 100%.
- Added manual phase advancement, direct late-entry testing, explicit next-turn rollover, and reset controls.
- Added accelerated simulation mode that advances phases and rolls through turns every 900ms.
- Added a late-entry edge state that blocks new guesses and voting near the draw.
- Added fail-closed index validation for cycle durations, phases, and phase progress.
- Connected the live-round hub Cycle action to `/play/simulate`.
- Added Playwright E2E coverage for proportional timing, all four duration steps, repeat after the second 8h turn, voting close, late entry, draw, and accelerated execution.
- Left M1.5 PRD checklist and approval criteria unchecked pending user confirmation.
- Reopened `PRD.md`, `AGENTS.md`, `.claude/skills`, frontend guidance, code-quality guidance, and Playwright guidance before verifying M1.5 and starting M1.6.
- Rechecked M1.5 against its checklist, E2E evidence, and responsive visual evidence.
- Marked M1.5 checklist and approval criteria complete after user confirmation.
- Started M1.6.

## M1.5 Artifact Review

| Artifact | Status | Notes |
|---|---|---|
| `apps/web/src/features/turn-cycle/TurnCycleSimulator.tsx` | Implemented | Contains deterministic cycle navigation, lifecycle phases, proportional timing, accelerated mode, rollover, late-entry state, and activity events. |
| `apps/web/src/app/play/simulate/page.tsx` | Implemented | Exposes the simulated turn-cycle route. |
| `apps/web/src/features/live-round/MobileLiveRoundHub.tsx` | Updated | Cycle action now navigates to `/play/simulate`. |
| `apps/web/src/app/globals.css` | Updated | Adds responsive cycle summary, progress, duration strip, controls, late-entry state, timeline, and activity styles. |
| `apps/web/e2e/turn-cycle.spec.ts` | Implemented | Verifies lifecycle timing, `2h -> 2h -> 8h -> 8h -> repeat`, late entry, draw, and accelerated simulation. |

## M1.5 Validation Results

| Requirement | Result |
|---|---|
| Cycle order is correct | Passed; E2E verifies `2h -> 2h -> 8h -> 8h -> 2h`, including repeat after the second 8h turn. |
| UI communicates current and next duration clearly | Passed; summary and duration strip show current step, current duration, and next duration. |
| Accelerated mode allows testing all durations quickly | Passed; accelerated mode advances every 900ms and E2E reaches draw within four seconds. |
| Voting close timing | Passed; timeline shows 75% and E2E verifies the `Voting closed` phase. |
| Guess close timing and late entry | Passed; timeline shows 96.7% and the late-entry edge state blocks voting and new guesses. |
| Draw timing and rollover | Passed; draw occurs at 100%, then the next phase advancement rolls to the following turn. |
| Invalid cycle or phase indexes | Passed; invalid indexes throw explicit errors instead of silently selecting a fallback. |
| Live-round hub links to simulator | Passed; Cycle navigates to `/play/simulate`. |
| Simulator route loads | Passed; `/play/simulate` returns HTTP `200`. |
| E2E | Passed with `pnpm --filter @idealer/web test:e2e`; all 4 web flows passed. |
| Typecheck | Passed with `pnpm typecheck`. |
| Lint | Passed with `pnpm lint`. |
| Tests | Passed with `pnpm test`. |
| Build | Passed with `pnpm build`; `/play/simulate` is included in generated routes. |
| Visual verification | Passed at `320x700`, `390x844`, and `1440x1000`; no horizontal overflow, framework overlay, or console errors were detected. Fixed-header geometry leaves a 12px gap before content, and mobile control targets are at least 44px high. |
| Whitespace check | Passed with `git diff --check`; Git reported CRLF normalization warnings only. |

## M1.5 Confirmation Gate

`M1.5` was marked complete after user confirmation on 2026-06-04.

## M1.6 Work Log

### 2026-06-04

- Added `DrawResultPanel` with near-miss, winner, and creator prototype result states.
- Added drawn numbers, submitted guess, original-rule result, alternative-rule result, active-rule text, deterministic outcome explanations, and creator attribution.
- Added a near-miss explanation that identifies the exact missed numbers and the remaining threshold.
- Added a simulated creator reward outcome equal to 15% of the individual alternative-rule winner payout.
- Made the creator reward source and accounting explicit: reserve-funded, full winner payout preserved, and zero deducted from the winner.
- Added next-round and share-result actions with accessible share-intent feedback.
- Added `/play/results` and connected the live-round hub Results action to it.
- Added Playwright E2E coverage for near-miss, winner, creator, reserve-funded reward, next-round CTA, and share feedback.
- Left M1.6 PRD checklist and approval criteria unchecked pending user confirmation.
- Reopened `PRD.md`, `AGENTS.md`, `.claude/skills`, frontend guidance, code-quality guidance, and Playwright guidance before verifying M1.6 and starting M1.7.
- Rechecked M1.6 against its checklist, E2E evidence, and responsive visual evidence.
- Marked M1.6 checklist and approval criteria complete after user confirmation.
- Started M1.7.

## M1.6 Artifact Review

| Artifact | Status | Notes |
|---|---|---|
| `apps/web/src/features/draw-result/DrawResultPanel.tsx` | Implemented | Contains result scenarios, number comparison, rule evaluations, near-miss feedback, creator attribution/reward, return CTA, and share feedback. |
| `apps/web/src/app/play/results/page.tsx` | Implemented | Exposes the simulated result route. |
| `apps/web/src/features/live-round/MobileLiveRoundHub.tsx` | Updated | Results action now navigates to `/play/results`. |
| `apps/web/src/app/globals.css` | Updated | Adds responsive result layout, number comparison, evaluation, creator accounting, and action styles. |
| `apps/web/e2e/draw-result.spec.ts` | Implemented | Verifies outcome explanations, creator accounting, next-round CTA, and share feedback. |

## M1.6 Validation Results

| Requirement | Result |
|---|---|
| User understands why they won or lost | Passed; original and alternative rule results explain each outcome and E2E verifies near-miss and winner states. |
| User sees a reason to join the next round | Passed; next turn duration, changing-rule message, and `/play/pick` CTA are visible. |
| Creator outcome is visible without confusing winner payout | Passed; creator reward, reserve source, full winner payout, and `0.00 SOL` winner deduction are displayed together. |
| Result route loads | Passed; `/play/results` returns HTTP `200` and is included in the production build. |
| E2E | Passed with `pnpm --filter @idealer/web test:e2e`; all 5 web flows passed. |
| Typecheck | Passed with `pnpm typecheck`. |
| Lint | Passed with `pnpm lint`. |
| Tests | Passed with `pnpm test`. |
| Build | Passed with `pnpm build`; `/play/results` is included in generated routes. |
| Visual verification | Passed at `320x700`, `390x844`, and `1440x1000`; no horizontal overflow or console errors were detected, and result action targets are at least 52px high. |
| Whitespace check | Passed with `git diff --check`; Git reported CRLF normalization warnings only. |

## M1.6 Confirmation Gate

`M1.6` was marked complete after user confirmation on 2026-06-04.

## M1.7 Work Log

### 2026-06-04

- Added `ShareCardGenerator` with active-rule, near-miss, and creator-elected story variants.
- Added a stable mobile social card with a `4:5` aspect ratio.
- Included turn number, Rule of the Hour title, prize pool, and story-specific outcome on every card.
- Added native Web Share API behavior.
- Added automatic copy-link fallback when native sharing is unavailable.
- Added an explicit Copy link action with visible success and failure feedback.
- Added session-only prototype analytics for share-intent count, last intent type, and selected story.
- Added `/play/share` and connected the result Share result CTA to it.
- Added Playwright E2E coverage for story switching, native sharing, explicit copy, automatic fallback copy, and prototype analytics.
- Left M1.7 PRD checklist and approval criteria unchecked pending user confirmation.

## M1.7 Artifact Review

| Artifact | Status | Notes |
|---|---|---|
| `apps/web/src/features/share-card/ShareCardGenerator.tsx` | Implemented | Contains three story variants, mobile card generation, share/copy behavior, fallback feedback, and share-intent analytics. |
| `apps/web/src/app/play/share/page.tsx` | Implemented | Exposes the share-card generator route. |
| `apps/web/src/features/draw-result/DrawResultPanel.tsx` | Updated | Share result CTA now navigates to `/play/share`. |
| `apps/web/src/app/globals.css` | Updated | Adds stable mobile social-card, story selector, actions, and analytics styles. |
| `apps/web/e2e/share-card.spec.ts` | Implemented | Verifies variants, required content, native sharing, copy link, fallback copy, and analytics. |

## M1.7 Validation Results

| Requirement | Result |
|---|---|
| Share card is readable on mobile | Passed; visual verification at `320x700` and `390x844` shows a stable `4:5` card without content overflow. |
| Card communicates the interesting story of the round | Passed; active-rule, near-miss, and creator-elected variants visibly change the outcome narrative. |
| User can share or copy without technical friction | Passed; native share, explicit Copy link, and automatic fallback copy are available with visible feedback. |
| Required card content | Passed; every variant includes turn number, rule title, prize pool, and outcome. |
| Prototype share analytics | Passed; share-intent count, last intent type, and selected story update visibly. |
| Share route loads | Passed; `/play/share` returns HTTP `200` and is included in the production build. |
| E2E | Passed with `pnpm --filter @idealer/web test:e2e`; all 7 web flows passed, including native-share fallback copy. |
| Typecheck | Passed with `pnpm typecheck`. |
| Lint | Passed with `pnpm lint`. |
| Tests | Passed with `pnpm test`. |
| Build | Passed with `pnpm build`; `/play/share` is included in generated routes. |
| Visual verification | Passed at `320x700`, `390x844`, and `1440x1000`; no horizontal/card-content overflow or console errors were detected, and action targets are at least 44px high. |
| Whitespace check | Passed with `git diff --check`; Git reported CRLF normalization warnings only. |

## M1.7 Confirmation Gate

`M1.7` is implemented and awaiting user confirmation before PRD checklist items are marked complete.
