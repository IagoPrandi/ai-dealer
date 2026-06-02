# Local Development Runbook

This runbook covers the `M0.3` Docker baseline.

## Required Services

The default Docker Compose stack starts:

- `idealer-postgres`
- `idealer-redis`
- `idealer-api`
- `idealer-worker`
- `idealer-web`

Optional profiles define:

- `idealer-admin` with `--profile admin`
- `idealer-prometheus` and `idealer-grafana` with `--profile observability`
- `idealer-mailpit` with `--profile mail`

## Startup

Create a local `.env` from the checked-in example if needed:

```bash
cp .env.example .env
```

Start the required local stack:

```bash
docker compose up --build
```

Start with admin:

```bash
docker compose --profile admin up --build
```

Start with observability and mail tooling:

```bash
docker compose --profile observability --profile mail up --build
```

## Local URLs

- Public DApp: `http://localhost:3000`
- API health: `http://localhost:3002/health`
- Worker health: `http://localhost:3003/health`
- Admin console, with profile: `http://localhost:3001`
- Prometheus, with profile: `http://localhost:9090`
- Grafana, with profile: `http://localhost:3004`
- Mailpit UI, with profile: `http://localhost:8025`

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

Expected required containers:

- `idealer-postgres`: healthy
- `idealer-redis`: healthy
- `idealer-api`: healthy
- `idealer-worker`: healthy
- `idealer-web`: healthy

API and worker health checks fail closed when Postgres or Redis is unavailable.
