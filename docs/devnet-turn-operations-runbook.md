# Devnet Turn and Worker Operations Runbook

This runbook operates the real **Solana devnet** deployment. It is not a local
validator guide and must never be reused for mainnet.

Opening, ending, settling, and rewarding a turn can write on-chain state and
consume devnet SOL. Review the target, the active configuration, and the
result of each command before continuing.

## 1. Scope and safety defaults

Use the controlled devnet profile for a short manual test turn:

- manual turn control: enabled;
- automatic opening: disabled;
- test duration: 1,200 seconds;
- action and active-rule JDR reward workers: disabled;
- referral rewards: disabled unless one exact `turnId:invitee` target is
  reviewed;
- settlement automation: enable only while a turn needs its phase-2 pipeline.

The checked-in profile is
`infra/docker/worker-devnet-controlled.env`. It is a safe template, not an
automatically loaded Compose file. Copy only the required non-secret values to
the local `.env`; do not copy a historical referral target.

Never put a seed phrase, a private-key JSON array, or an exported browser-wallet
key in `.env`, the repository, logs, or this runbook. In container mode, the
technical devnet keypair stays in the Docker volume and is mounted read-only in
the worker. In host mode, it must be an existing, access-controlled local file
outside the repository.

## 2. Prerequisites

From the repository root, create `.env` from the example if it does not exist:

```powershell
Copy-Item .env.example .env
```

Set or verify these common devnet values in `.env`:

```dotenv
TYCHE_SOLANA_RPC_URL=https://api.devnet.solana.com
TYCHE_PROGRAM_ID=ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd
TOKENOMICS_CORE_PROGRAM_ID=BRK6G8Sep66LFREp2nGMLiganfw2nbWe1f8zeAdoP1Fm
TYCHE_TURN_MANUAL_CONTROL_ENABLED=true
TYCHE_TURN_AUTOMATION_ENABLED=false
TYCHE_TURN_MANUAL_OPEN_DURATION_SECONDS=1200
TYCHE_DEVNET_TURN_DURATION_SCALE_BPS=139
TYCHE_SETTLEMENT_AUTOMATION_ENABLED=false
TYCHE_TOKEN_REWARD_SETTLEMENT_ENABLED=false
TYCHE_ACTIVE_RULE_REWARD_SETTLEMENT_ENABLED=false
TYCHE_REFERRAL_REWARD_SETTLEMENT_ENABLED=false
TYCHE_REFERRAL_REWARD_TARGET_ALLOWLIST=
```

The following two values depend on the runtime mode:

| Mode | `TYCHE_API_BASE_URL` | `TYCHE_TURN_AUTHORITY_KEYPAIR_PATH` |
| --- | --- | --- |
| Host-native API and worker | `http://127.0.0.1:3002` | An existing ACL-protected host path, for example `C:/Users/<user>/.config/tyche/devnet/tyche-deployer-keypair.json` |
| Containerized API and worker | `http://api:3002` | `/solana-home/.config/tyche/devnet/tyche-deployer-keypair.json` |

The technical keypair must already exist in the `tyche-solana-home` Docker
volume. This read-only check prints only its public address:

```powershell
docker run --rm -v tyche-solana-home:/solana-home:ro rust:1.91-bookworm bash -lc 'export PATH=/solana-home/.local/share/solana/install/active_release/bin:$PATH; solana-keygen pubkey /solana-home/.config/tyche/devnet/tyche-deployer-keypair.json'
```

Do not open a turn if this public address is not the approved technical payer,
or if it has insufficient devnet SOL for account rent and network fees.

## 3. Select how to run the application services

Both modes use the same devnet programs and the same HTTP endpoints. Do not run
the API or worker in both modes at the same time, because they would contend for
the same ports and could run duplicate schedulers.

### 3.1 Host-native API, worker, and web (recommended)

This is the normal development and devnet-operation path. Docker is used only
for PostgreSQL and Redis, while the application services run directly on the
host with fast reload and visible terminal logs.

Set the host-mode values in `.env`, especially:

```dotenv
TYCHE_API_BASE_URL=http://127.0.0.1:3002
TYCHE_TURN_AUTHORITY_KEYPAIR_PATH=C:/Users/<user>/.config/tyche/devnet/tyche-deployer-keypair.json
```

Before starting the worker, verify that the host can read the existing keypair
without printing its secret:

```powershell
Test-Path $env:USERPROFILE\.config\tyche\devnet\tyche-deployer-keypair.json
solana-keygen pubkey $env:USERPROFILE\.config\tyche\devnet\tyche-deployer-keypair.json
```

If the key exists only in the Docker volume, use container mode instead. Do not
copy the keypair from a container into the repository or a chat transcript.

Start PostgreSQL and Redis:

```powershell
docker compose up -d postgres redis
```

Then start each service in its own PowerShell terminal:

```powershell
pnpm --filter @tyche/api dev
pnpm --filter @tyche/worker dev
pnpm --filter @tyche/web dev
```

Stop a host-native service with `Ctrl+C` in its terminal. After a worker `.env`
or source change, stop and start that worker command again. The live terminal is
also the primary worker log stream.

### 3.2 Containerized API, worker, and web

Start the database, cache, API, worker, and web server as containers:

```powershell
docker compose --profile containerized up -d postgres redis api worker web
```

If source or environment variables changed, recreate only the affected service:

```powershell
docker compose up -d --force-recreate api worker
docker compose up -d --force-recreate web
```

Do not expect `tsx watch` to reliably reload a Windows bind mount. Recreate the
container after changing worker or API source or environment configuration.

Check the services and health endpoints:

```powershell
docker compose ps
Invoke-RestMethod http://127.0.0.1:3002/health
Invoke-RestMethod http://127.0.0.1:3003/health
```

Expected endpoints:

- DApp: `http://127.0.0.1:3000`
- API: `http://127.0.0.1:3002`
- Worker: `http://127.0.0.1:3003`

Confirm the effective worker configuration rather than relying only on a stale
browser page:

```powershell
docker inspect tyche-worker --format '{{range .Config.Env}}{{println .}}{{end}}' |
  Select-String 'TYCHE_(TURN_AUTOMATION_ENABLED|TURN_MANUAL_CONTROL_ENABLED|TURN_MANUAL_OPEN_DURATION_SECONDS|SETTLEMENT_AUTOMATION_ENABLED|.*REWARD.*ENABLED)'
```

For a manual test round, `TURN_AUTOMATION_ENABLED` must be `false` and
`TURN_MANUAL_CONTROL_ENABLED` must be `true`.

## 4. Read the current on-chain turn state

This request is read-only:

```powershell
Invoke-RestMethod http://127.0.0.1:3003/turn/active | ConvertTo-Json -Depth 8
```

Interpret the result before writing:

- `hasActiveTurn: true`: do not call `/manual/open`.
- `paused: true`: do not open or settle; resolve the governed pause first.
- no active turn and the predecessor is `CLOSED`: the next turn may be opened.
- a predecessor not yet `CLOSED`: settlement must finish before a new turn is
  allowed.

## 5. Advance safely to a new short devnet turn

For normal operation, use `POST /manual/cycle`. It ends the active turn's
phase 1, drives the real settlement pipeline to `CLOSED`, and only then opens
the next short turn. When there is no active turn, it first checks whether a
pending predecessor needs settlement before opening the next one.

It internally signs and simulates every authority instruction before it
broadcasts. It is still an on-chain write, so use it only after reviewing the
current state and approving the devnet fee/rent.

```powershell
$cycle = Invoke-RestMethod -Method Post http://127.0.0.1:3003/manual/cycle
$cycle | ConvertTo-Json -Depth 8
```

Successful output has `action: "opened_next_turn"`; its nested `open` result
contains the `turnId`, the `open_turn` signature, and `setCycleSignature` for
the 1,200-second duration reset. The endpoint can take up to five minutes while
it settles a real active turn.

Use `POST /manual/open` only when `/turn/active` has already confirmed that no
turn is active and the previous turn is terminal `CLOSED`:

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:3003/manual/open |
  ConvertTo-Json -Depth 8
```

Possible safe outcomes:

- `active_turn_exists`: `/manual/open` made no change because a turn is open;
  use `/manual/cycle` for the controlled advance.
- `paused`: no action was sent.
- an HTTP 500 or cycle timeout: inspect the predecessor settlement; do not
  bypass the gate or use force-close.

Re-read state and watch the worker logs. Use the command that matches the
selected runtime:

```powershell
Invoke-RestMethod http://127.0.0.1:3003/turn/active | ConvertTo-Json -Depth 8
# Containerized worker only:
docker compose logs --tail 100 -f worker
# Host-native worker: read the terminal that runs `pnpm --filter @tyche/worker dev`.
```

## 6. Seed or use the turn

Use the DApp to submit real devnet test inputs, or use the reviewed operator
scripts. The input seeder is dry-run by default; it broadcasts only when its
explicit broadcast flag is set:

```powershell
docker exec -e TYCHE_M5_INPUTS_BROADCAST=0 tyche-worker pnpm --filter @tyche/worker exec tsx src/devnet-seed-real-inputs.ts
# Host-native worker:
pnpm --filter @tyche/worker devnet:seed-real-inputs
```

Do not enable a reward worker merely because a turn is open. Reward automation
requires a separately reviewed recipient/action scope.

## 7. End phase 1 and settle safely

To end the create-and-play window early without skipping the real phase-2
election/draw flow, first enable the settlement scheduler in `.env`, then restart
the worker in the selected runtime:

```dotenv
TYCHE_SETTLEMENT_AUTOMATION_ENABLED=true
```

```powershell
# Containerized worker:
docker compose up -d --force-recreate worker
# Host-native worker: stop its `pnpm --filter @tyche/worker dev` process, then run it again.
```

Then end the play window:

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:3003/manual/close | ConvertTo-Json -Depth 8
```

This only shortens phase 1. The turn stays open while the real settlement path
runs: eligible-pool lock, ORAO requests/fulfillments, shortlist/elimination,
active-rule selection, draw, verification, winner processing, and `CLOSED`.

Monitor it with:

```powershell
# Containerized worker:
docker compose logs --tail 200 -f worker
# Host-native worker: read its terminal.
Invoke-RestMethod http://127.0.0.1:3002/rounds/35 | ConvertTo-Json -Depth 10
```

Replace `35` with the actual turn ID. If the scheduler is intentionally off,
one reviewed manual pass is available:

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:3003/manual/settle | ConvertTo-Json -Depth 10
```

Call it only after inspecting the returned state; it can send the next valid
settlement instruction. Never use `/manual/force-close` for a normal test: it
skips the phase-2 game flow and is only an emergency test escape hatch.

After `CLOSED`, restore the controlled default and recreate the worker:

```dotenv
TYCHE_SETTLEMENT_AUTOMATION_ENABLED=false
```

```powershell
# Containerized worker:
docker compose up -d --force-recreate worker
# Host-native worker: restart `pnpm --filter @tyche/worker dev`.
```

## 8. Reward-worker policy

Keep these disabled unless the exact transfer scope has been reviewed:

```dotenv
TYCHE_TOKEN_REWARD_SETTLEMENT_ENABLED=false
TYCHE_ACTIVE_RULE_REWARD_SETTLEMENT_ENABLED=false
TYCHE_REFERRAL_REWARD_SETTLEMENT_ENABLED=false
```

Referral automation is intentionally target-bound. A temporary devnet target
uses this form and must be removed after verification:

```dotenv
TYCHE_REFERRAL_REWARD_SETTLEMENT_ENABLED=true
TYCHE_REFERRAL_REWARD_SETTLEMENT_INTERVAL_MS=300000
TYCHE_REFERRAL_REWARD_TARGET_ALLOWLIST=<turnId>:<invitee-public-key>
```

The worker verifies the referral-attribution PDA, the invitee's first
GameToken timing, the campaign, and existing settlement flags. A settled
receipt is a no-op on retry; do not broaden an allowlist to compensate for an
RPC timeout.

## 9. Shutdown and troubleshooting

Stop application services without deleting volumes:

```powershell
docker compose --profile containerized down
```

For host-native mode, stop API, worker, and web with `Ctrl+C` in their own
terminals, then stop only the data stores if desired:

```powershell
docker compose down
```

Useful diagnostics:

```powershell
docker compose ps
docker compose logs --tail 200 api worker
docker compose config --quiet
```

Common problems:

| Symptom | Safe response |
| --- | --- |
| `429 Too Many Requests` from devnet RPC | Wait and retry the read-only check. Do not change recipients or resend a completed reward; receipt checks are idempotent. |
| Worker cannot reach API | In a container, use `TYCHE_API_BASE_URL=http://api:3002`, not `http://localhost:3002`. |
| Host-native worker cannot reach API | Use `TYCHE_API_BASE_URL=http://127.0.0.1:3002` and confirm the host API process is listening. |
| Keypair path missing in worker | In a container use the mounted `/solana-home/...` path; on the host use the protected Windows path. Restart the relevant worker after correcting `.env`. |
| `active_turn_exists` | Read `/turn/active`; use the existing turn or settle it. Do not try to open another one. |
| Predecessor not `CLOSED` | Run the normal settlement flow until its terminal transition is recorded. |
| Docker Engine returns `500` or becomes unresponsive | Restart Docker Desktop, then run `docker compose ps`. Do not remove volumes or run a prune as a recovery shortcut. |

## 10. Mainnet boundary

Every program ID, multisig member, wallet, token metadata decision, and key
path in this runbook is for devnet operations only. Mainnet requires a separate
audited artifact, mainnet configuration ceremony, metadata HTTPS decision,
multisig/governance verification, operational rehearsal, and explicit go/no-go.
