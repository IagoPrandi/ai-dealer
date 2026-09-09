# Tyche backend on AWS

Runbook for the production backend (`apps/api` + `apps/worker`) on AWS, with the
frontend (`apps/web`, `apps/admin`) on Vercel and CI/CD in GitHub Actions.

Commercial name **Tywish**, internal codename `tyche` — see `.claude/CLAUDE.md`.
Resource names, tags, and env prefixes use `tyche` on purpose.

---

## 1. Why this shape

The topology is dictated by the code, not by preference. Read this before
proposing a "more scalable" layout:

| Fact in the code                                                                                                                                             | Consequence                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api` keeps the operational game state in process memory (`apps/api/src/index.ts`, the `Map`s around line 1653) and rehydrates it from Postgres on boot | Exactly **one** API replica. A second one would serve divergent state. Horizontal scale is a code change, not an infrastructure change. |
| `apps/worker` owns singleton automation loops (turn, settlement, rewards)                                                                                    | Exactly **one** worker replica. Two would double-drive turns.                                                                           |
| Rule preflight and dealer answers stream over SSE for minutes                                                                                                | No platform with a short request timeout, and no response buffering at the edge.                                                        |
| The worker shells out to `tokenomics-calculator`, a Rust binary                                                                                              | A container image, built from `contracts/solana` in the same build.                                                                     |
| Redis is only touched by the two health checks (`apps/api/src/lifespan.ts`, `apps/worker/src/index.ts`)                                                      | Redis runs as a container on the host. No paid managed cache.                                                                           |
| The audit hash chain, claim records, and prize accounting live in Postgres                                                                                   | Managed RDS with backups, not a container.                                                                                              |
| The settlement endpoints on `apps/api` have **no authentication** and are meant to be called by the worker over the private network                          | The public edge is deny-by-default. See section 8.                                                                                      |

So: one EC2 instance running `api`, `worker`, `redis`, and Caddy; one managed
Postgres; one image repository; and a deploy channel that needs no inbound
access to the host.

```
Vercel (apps/web, apps/admin)
        |  browser: https://api.<domain>, https://worker.<domain>
        |  SSR/public pages: same-origin Next proxy -> the same hostnames
        v
   Caddy (TLS, deny-by-default allowlist)
        |
   +----+-----------------------------+
   | api:3002        worker:3003      |   one EC2 instance, one compose project
   |        redis:6379                |
   +----------------------------------+
        |
   RDS Postgres (private subnets, no public access)
```

---

## 2. What it costs

Rough us-east-1 on-demand, per month:

| Item                                                 | Monthly     |
| ---------------------------------------------------- | ----------- |
| EC2 `t3.medium`, 2 vCPU / 4 GiB                      | ~US$ 30     |
| EBS: 30 GiB root + 5 GiB data, gp3                   | ~US$ 2.80   |
| RDS `db.t4g.micro`, single-AZ, 20 GiB gp3            | ~US$ 13     |
| Secrets Manager, 2 secrets                           | US$ 0.80    |
| ECR storage, 15 images                               | ~US$ 1      |
| S3 release bundle + CloudWatch logs + alarms         | ~US$ 1.50   |
| Elastic IP (attached), SSM, Parameter Store standard | US$ 0       |
| **Total**                                            | **~US$ 49** |

Choices that keep it there, each of which you can reverse:

- **No load balancer.** An ALB is ~US$ 17/month and would front a single
  instance that cannot be load-balanced anyway. Caddy terminates TLS with
  Let's Encrypt instead.
- **No NAT gateway.** ~US$ 32/month for egress the application host gets
  through the internet gateway directly.
- **No VPC endpoints.** ~US$ 7/month each; SSM, ECR, and Secrets Manager are
  reached over the internet gateway with SigV4-signed TLS.
- **No ElastiCache.** Redis holds nothing durable here.
- **No Multi-AZ database.** A failover would not remove the downtime a
  single-instance API already has on restart.
- **Container logs stay on the host**, rotated by the `json-file` driver. Log
  reading keeps working during an incident and CloudWatch ingest is not billed.
  `docker-compose.prod.yml` documents the `awslogs` switch.

Dropping to `t3.small` saves about US$ 7/month and is fine below roughly 300
concurrent players. Going the other way, if the `-instance-burst-surcharge`
alarm keeps firing the burstable shape is wrong for your load: move to
`c7i-flex.large` or `m7i-flex.large`.

---

## 3. First-time bootstrap

Everything below is once per environment. Steps 1-3 need an AWS session with
administrative rights and MFA.

### 3.1 Terraform state bucket

```bash
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REGION=us-east-1
BUCKET="tyche-production-tfstate-$ACCOUNT_ID"

aws s3api create-bucket --bucket "$BUCKET" --region "$REGION"
aws s3api put-bucket-versioning --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'
```

State locking uses the S3 native lock file (`use_lockfile=true`), so there is no
DynamoDB table to create.

### 3.2 Variables

```bash
cd infra/aws/terraform
cp terraform.tfvars.example production.tfvars
$EDITOR production.tfvars   # domains, origins, repository, alarm address
```

Commit `production.tfvars`: it contains no credentials, and the pull-request
plan job needs it.

### 3.3 Apply

```bash
terraform init \
  -backend-config="bucket=tyche-production-tfstate-$ACCOUNT_ID" \
  -backend-config="key=production/terraform.tfstate" \
  -backend-config="region=$REGION" \
  -backend-config="use_lockfile=true" \
  -backend-config="encrypt=true"

terraform plan  -var-file=production.tfvars
terraform apply -var-file=production.tfvars
```

Then confirm the SNS subscription email, or no alarm is ever delivered.

Two things to check on the first apply, both of which fail loudly rather than
silently:

- `db_engine_version` defaults to `18` to match the `postgres:18.1` image used
  locally. Confirm the region offers it, and pin a version it does offer
  otherwise:
  ```bash
  aws rds describe-db-engine-versions --engine postgres \
    --query 'DBEngineVersions[].EngineVersion' --output text | tr '\t' '\n' | sort -V | tail
  ```
- `COMPOSE_VERSION` in `user-data.sh.tftpl` is a pinned Docker Compose release.
  Confirm the tag exists; a wrong pin fails the first boot with a 404 in
  `/var/log/tyche-bootstrap.log`, reachable through Session Manager.

### 3.4 DNS

Point both hostnames at the Elastic IP **before the first deploy**; Caddy
cannot complete the ACME challenge otherwise, and repeated failures consume
Let's Encrypt rate limits.

```bash
terraform output public_ip
# api.<domain>     A  <ip>
# worker.<domain>  A  <ip>
```

With `route53_zone_id` set, Terraform creates both records for you.

### 3.5 Runtime secrets

Terraform creates the secret but never its contents, so no credential passes
through the plan, the state, or this repository. Write it once:

```bash
cat >/tmp/tyche-secrets.json <<'JSON'
{
  "TYCHE_SOLANA_RPC_URL": "https://...",
  "LLM_BASE_URL": "https://openrouter.ai/api/v1",
  "LLM_MODEL": "...",
  "LLM_MODEL_COMPILE": "...",
  "LLM_MODEL_REVIEW": "...",
  "API_KEY_OPENROUTER": "...",
  "LLM_API_KEY": "...",
  "TYCHE_TURN_AUTHORITY_KEYPAIR": "[12,34,...]",
  "OPERATOR_AI_CONSOLE_AUTHORIZED_WALLETS": "wallet1,wallet2",
  "TOKENOMICS_PROJECTION_TOKEN": "..."
}
JSON

aws secretsmanager put-secret-value \
  --secret-id "$(terraform output -raw runtime_secret_arn)" \
  --secret-string file:///tmp/tyche-secrets.json

shred -u /tmp/tyche-secrets.json
```

What belongs where:

| Kind                                              | Location                                                 |
| ------------------------------------------------- | -------------------------------------------------------- |
| Provider keys, RPC URL, keypairs, operator tokens | this secret                                              |
| Feature flags, timeouts, model routing knobs      | `infra/aws/compose/production.env` (committed)           |
| Domains, CORS origins, database endpoint          | SSM Parameter Store, written by Terraform                |
| Program ids, Switchboard addresses                | `deployments/solana-<cluster>.json`, read at deploy time |

`render-env.sh` refuses to deploy while the secret still holds the Terraform
placeholder, and refuses if the LLM endpoint or model, `TYCHE_SOLANA_RPC_URL`,
or `WEB_ORIGIN` are missing. A backend that boots without them fails later,
mid-turn, in a way that looks like a model outage rather than a
misconfiguration.

### 3.6 GitHub configuration

Repository **variables** (Settings, Secrets and variables, Actions, Variables):

```bash
terraform output github_actions_variables
```

| Variable                  | Purpose                                             |
| ------------------------- | --------------------------------------------------- |
| `AWS_REGION`              | region for every AWS call                           |
| `AWS_DEPLOY_ROLE_ARN`     | assumed by the backend deploy workflow through OIDC |
| `AWS_PLAN_ROLE_ARN`       | read-only, for the pull-request Terraform plan      |
| `TF_STATE_BUCKET`         | state bucket from 3.1                               |
| `VERCEL_ORG_ID`           | Vercel team id                                      |
| `VERCEL_PROJECT_ID_WEB`   | player app project                                  |
| `VERCEL_PROJECT_ID_ADMIN` | optional; the admin job is skipped without it       |

Repository **secrets**: only `VERCEL_TOKEN`. AWS needs no stored credential —
the workflows use OIDC.

To require a human approval before a production rollout, add reviewers to the
`production` GitHub environment; the `deploy` job already targets it.

### 3.7 Vercel projects

One project per app, both linked to this repository:

| Setting                              | `apps/web`                  | `apps/admin`                  |
| ------------------------------------ | --------------------------- | ----------------------------- |
| Root Directory                       | `apps/web`                  | `apps/admin`                  |
| Include files outside root directory | on                          | on                            |
| Framework                            | Next.js                     | Next.js                       |
| Install / Build command              | from `apps/web/vercel.json` | from `apps/admin/vercel.json` |

The build command is set in `vercel.json` on purpose: the default `next build`
would skip building `@tyche/constants`, which the app imports from `dist/`.

Environment variables (`vercel env add <NAME> production`):

| Variable                                                                                                                                                                                                         | Value                                    | Why                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `TYCHE_API_PROXY_TARGET`                                                                                                                                                                                         | `https://api.<domain>`                   | required in production by `apps/web/src/lib/apiProxy.ts`; used by SSR and the public pages |
| `TYCHE_WORKER_PROXY_TARGET`                                                                                                                                                                                      | `https://worker.<domain>`                | required in production by `apps/web/next.config.ts`                                        |
| `TYCHE_API_BASE_URL`                                                                                                                                                                                             | `https://api.<domain>`                   | server-side API base                                                                       |
| `NEXT_PUBLIC_TYCHE_API_URL`                                                                                                                                                                                      | `https://api.<domain>`                   | sends browser traffic straight to the API instead of through Vercel functions              |
| `NEXT_PUBLIC_TYCHE_WORKER_URL`                                                                                                                                                                                   | `https://worker.<domain>`                | live turn status                                                                           |
| `NEXT_PUBLIC_SITE_URL`                                                                                                                                                                                           | `https://<domain>`                       | canonical URLs, PWA                                                                        |
| `NEXT_PUBLIC_SOLANA_RPC_URL`, `NEXT_PUBLIC_TYCHE_PROGRAM_ID`, `NEXT_PUBLIC_TOKENOMICS_CORE_PROGRAM_ID`, `NEXT_PUBLIC_TYCHE_TOKEN_MINT`, `NEXT_PUBLIC_TYCHE_TOKEN_SYMBOL`, `NEXT_PUBLIC_TYCHE_TOKEN_METADATA_URI` | from `deployments/solana-<cluster>.json` | wallet and token surfaces                                                                  |

`NEXT_PUBLIC_TYCHE_API_URL` matters for cost as well as latency: without it the
browser calls `/api/proxy/*`, so every SSE stream is held open by a Vercel
function for its whole lifetime. Set it in **production only** and leave
previews on the proxy, because preview URLs are random and cannot be listed in
`web_origins` for CORS.

---

## 4. Deploying

| What                              | How                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend, normal                   | Push to `main`. `deploy-backend.yml` verifies, builds, publishes, rolls out, smoke-tests. A push that touches no backend path skips the rollout. |
| Backend, redeploy an existing tag | Run **Deploy backend** manually with `image_tag = sha-<commit>`.                                                                                 |
| Backend, roll back                | Run **Deploy backend** manually with `rollback = true`. Skips the test run: the release it restores already passed one.                          |
| Frontend preview                  | Open a pull request touching `apps/web`, `apps/admin`, or `packages`.                                                                            |
| Frontend production               | Push to `main`.                                                                                                                                  |
| Infrastructure                    | Plan runs on the pull request; **apply is manual** (section 3.3).                                                                                |

A rollout replaces the API container, so the public API is unavailable for
roughly 30-60 seconds while the state rehydrates from Postgres. Deploy between
turns when you can.

What the pipeline enforces, in order: format on changed files, lint, typecheck,
tests, build, `pnpm audit` (blocking on critical), Trivy filesystem scan
(blocking on critical), image build, Trivy image scan, config validation on the
host, container health gate, public smoke test, automatic rollback.

---

## 5. Day-to-day operations

```bash
# shell on the host (no SSH, no key pair, no port 22)
aws ssm start-session --target "$(terraform output -raw instance_id)"

sudo -i
cat /opt/tyche/state/current-tag        # running release
cat /opt/tyche/state/previous-tag       # rollback target
docker compose --project-directory /opt/tyche/release \
  --file /opt/tyche/release/docker-compose.prod.yml \
  --env-file /opt/tyche/state/.env ps
docker logs --tail 200 -f tyche-api
```

Deploy history is in the SSM command history and in the CloudWatch log group
`/tyche/production/deploy`.

Database access goes through the host, since RDS is not publicly reachable:

```bash
aws ssm start-session --target "$(terraform output -raw instance_id)" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=$(terraform output -raw database_endpoint),portNumber=5432,localPortNumber=5432"
```

Then connect to `localhost:5432` with the credentials from the RDS-managed
secret (`terraform output database_master_secret_arn`).

---

## 6. Configuration changes

The compose file, the Caddyfile, `production.env`, the host scripts, and the
deployment manifests are part of the release bundle. Change them in the
repository and deploy; do not edit them on the instance. The deploy syncs
`s3://<bucket>/release/` into `/opt/tyche/release/` with `--delete` on every
run, so a hand edit is silently reverted at the next rollout.

Secret changes are the exception: write the secret and then trigger a manual
deploy of the current tag, which re-renders `/etc/tyche/runtime.env` and
restarts the services.

---

## 7. Restoring the host

The instance is disposable. The data volume is not.

- Replacing the instance (`terraform apply -replace=aws_instance.app`) keeps
  `/var/lib/tyche` — the issued certificates and the Redis append-only file —
  because it lives on a separate EBS volume with `prevent_destroy`.
- After the replacement, run the deploy workflow with `image_tag` set to the
  tag in `current-tag`. The API rehydrates its state from Postgres.
- The database is restored from an automated backup or from point-in-time
  recovery within the retention window (7 days by default).

---

## 8. The edge allowlist is a security boundary

`apps/api` serves player endpoints and the settlement pipeline on the same
port, and the settlement endpoints carry **no authentication** — they exist to
be called by `apps/worker` over the private compose network
(`TYCHE_API_BASE_URL=http://api:3002`). Publishing that port unfiltered would
let anyone on the internet create turns, drive draws and elections, calculate
winners and rewards, and create claim records.

`infra/aws/compose/Caddyfile` therefore forwards only the methods and paths the
browser actually uses and answers everything else with `403
OPERATOR_ONLY_ENDPOINT`. The allowlist was derived from the request sites in
`apps/web` and `apps/admin` and cross-checked against the route table in
`apps/api/src/index.ts`.

Consequences you need to know:

- **Adding a player-facing route to the API means adding it to the Caddyfile.**
  Otherwise it returns 403 in production. A 403 carrying
  `OPERATOR_ONLY_ENDPOINT` means the route was never allowlisted; it does not
  mean the API rejected the request.
- `infra/aws/scripts/smoke-test.sh` re-verifies on every deploy that fifteen
  settlement and operator routes plus the worker's manual-control routes are
  still blocked. A broken allowlist fails the deploy and triggers a rollback.
- The allowlist is a mitigation, not a fix. The underlying issue is that the
  settlement pipeline is unauthenticated; the fix belongs in `apps/api`. Until
  then, treat this file as security-critical code and review changes to it as
  such.
- `/operator/ai-operations*` **is** exposed, because `apps/admin` needs it and
  it enforces its own wallet-signature authorization against
  `OPERATOR_AI_CONSOLE_AUTHORIZED_WALLETS`.
- There is no edge rate limiting: stock Caddy has none, and adding it means
  building a custom image with the `caddy-ratelimit` plugin. The dealer
  endpoint has its own per-turn and per-minute limits in `apps/api`. If LLM
  spend becomes a concern, that plugin is the next step.

---

## 9. Deliberate limits

Honest list of what this stack does not do:

- **No staging environment.** The module is environment-parameterised
  (`var.environment` with its own state key), so a staging stack costs another
  apply and about US$ 49/month. Frontend staging is covered free by Vercel
  previews, which reach the production API through the server-side proxy.
- **No zero-downtime backend deploy.** Impossible while the API is a single
  stateful process.
- **No automatic instance replacement.** The status-check alarm triggers EC2
  auto-recovery (same instance, new hardware); it is not an Auto Scaling group.
  A single stateful instance must not be replaced automatically.
- **No `terraform apply` in CI**, by design. See `infra.yml`.
- **Settlement and reward automation ship disabled.** Those loops sign
  fund-moving transactions and the project gates them on reviewed on-chain
  artifacts. Enabling one is an explicit change to `production.env`, reviewed
  and deployed like code.
