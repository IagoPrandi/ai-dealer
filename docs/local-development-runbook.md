# Local Development Runbook

This runbook covers the local development baseline.

## Required Services

Docker Compose starts only the local data stores:

- `tyche-postgres`
- `tyche-redis`

Run API, worker, public DApp, and admin from the host with `pnpm`; this avoids
slow Docker rebuilds and gives each service native hot reload.

Optional Docker profiles define:

- `tyche-prometheus` and `tyche-grafana` with `--profile observability`
- `tyche-mailpit` with `--profile mail`
- containerized application services with `--profile containerized` for an
  explicit container-only diagnostic; this is not the normal local workflow.

## Startup

Create a local `.env` from the checked-in example if needed:

```bash
cp .env.example .env
```

The web package loads this root `.env` explicitly. Configure
`NEXT_PUBLIC_SOLANA_RPC_URL` with the intended devnet provider; the DApp derives
the matching `wss://` endpoint from that URL so both transports keep the same
provider host and query credentials.

Start PostgreSQL and Redis:

```bash
docker compose up -d postgres redis
```

Start the application services from the host in separate terminals:

```bash
pnpm --filter @tyche/api dev
pnpm --filter @tyche/worker dev
pnpm --filter @tyche/web dev
pnpm --filter @tyche/admin dev
```

Start with observability and mail tooling:

```bash
docker compose --profile observability --profile mail up -d
```

## Local URLs

- Public DApp: `http://localhost:3000`
- API health: `http://localhost:3002/health`
- Worker health: `http://localhost:3003/health`
- Admin console: `http://localhost:3001`
- Prometheus, with profile: `http://localhost:9090`
- Grafana, with profile: `http://localhost:3004`
- Mailpit UI, with profile: `http://localhost:8025`

## Testing on a Real Phone (PWA install)

Tyche is a **mobile-first PWA**, not a native/Expo app. The "app on the phone"
experience comes from installing the PWA to the home screen (`display: standalone`),
which requires a **secure (HTTPS) origin** — the service worker will not register
over plain `http://<LAN-IP>`, so the install prompt never appears there.

Two supported ways to reach an HTTPS origin from the phone (phone and computer on
the same network for option B):

### Option A — Cloudflare tunnel (recommended, trusted cert)

```bash
# terminal 1 — app (already binds 0.0.0.0:3000)
pnpm --filter @tyche/web dev
# terminal 2 — public HTTPS URL that proxies to localhost:3000
pnpm --filter @tyche/web dev:tunnel
```

`dev:tunnel` prints a `https://<random>.trycloudflare.com` URL. Open it on the phone,
then use the browser menu → **Add to Home Screen** to install. Because the cert is
trusted, the service worker registers and the app opens full-screen like a native app.

### Option B — Next.js self-signed HTTPS over LAN

```bash
pnpm --filter @tyche/web dev:https
```

Open `https://<your-computer-LAN-IP>:3000` on the phone and accept the certificate
warning. Use this when offline / without a tunnel; the trusted-cert path (Option A)
is more reliable for exercising the install prompt.

### App icons

Home-screen icons live in `apps/web/public/icons/` as PNG (SVG is not accepted by
iOS for home-screen icons). They are regenerated from `icon-source.svg` with:

```bash
cd apps/web && node scripts/build-icons.mjs
```

## Shutdown

Stop containers while keeping volumes:

```bash
docker compose down
```

## Reset

Stop containers and remove local data volumes:

```bash
docker compose down --volumes --remove-orphans
```

## Health Checks

Inspect service health:

```bash
docker compose ps
```

Expected Docker containers:

- `tyche-postgres`: healthy
- `tyche-redis`: healthy

Check host-run services directly:

```bash
curl http://localhost:3002/health
curl http://localhost:3003/health
```

API and worker health checks fail closed when PostgreSQL or Redis is unavailable.
