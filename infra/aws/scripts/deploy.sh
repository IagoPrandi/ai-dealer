#!/usr/bin/env bash
#
# Rolls one release onto the host. Invoked as `tyche-deploy <tag>` or
# `tyche-deploy rollback` through SSM Run Command, never over SSH.
#
# Replacing the API container is a short outage by design: apps/api holds the
# operational game state in process memory and rehydrates it from Postgres on
# boot. Expect roughly 30-60 seconds where the public API is unavailable. That
# is the trade this single-instance topology makes, and it is why the health
# gate below refuses to leave a broken release running.
set -euo pipefail

# shellcheck disable=SC1091
source /etc/tyche/deploy.conf

# The release directory is replaced wholesale by every rollout; the state
# directory survives it and is what makes a rollback possible.
RELEASE_DIR="/opt/tyche/release"
STATE_DIR="/opt/tyche/state"
COMPOSE_FILE="$RELEASE_DIR/docker-compose.prod.yml"
ENV_FILE="$STATE_DIR/.env"
CURRENT_TAG_FILE="$STATE_DIR/current-tag"
PREVIOUS_TAG_FILE="$STATE_DIR/previous-tag"
HEALTH_TIMEOUT_SECONDS=240

log() { echo "[deploy] $*"; }
fatal() {
  echo "[deploy] FATAL: $*" >&2
  exit 1
}

[ "$#" -ge 1 ] || fatal "usage: deploy.sh <image-tag>|rollback"
[ -f "$COMPOSE_FILE" ] || fatal "$COMPOSE_FILE missing from the release bundle."

requested="$1"
rolling_back=0
previous_tag=""
[ -f "$CURRENT_TAG_FILE" ] && previous_tag="$(cat "$CURRENT_TAG_FILE")"

if [ "$requested" = "rollback" ]; then
  [ -f "$PREVIOUS_TAG_FILE" ] || fatal "no previous release recorded; nothing to roll back to."
  requested="$(cat "$PREVIOUS_TAG_FILE")"
  rolling_back=1
  log "rolling back to $requested"
fi

case "$requested" in
  *[!A-Za-z0-9._-]*) fatal "refusing to deploy tag with unexpected characters: $requested" ;;
esac

IMAGE="$ECR_REPOSITORY:$requested"
REGISTRY="${ECR_REPOSITORY%%/*}"

# ---------------------------------------------------------------------------
# Fetch the image before touching the running services, so a bad tag or an
# expired login fails while the previous release is still serving traffic.
# ---------------------------------------------------------------------------
log "authenticating to $REGISTRY"
aws ecr get-login-password --region "$AWS_REGION" |
  docker login --username AWS --password-stdin "$REGISTRY"

log "pulling $IMAGE"
docker pull --quiet "$IMAGE"

# ---------------------------------------------------------------------------
# Configuration. render-env.sh aborts on missing or placeholder values, so a
# rollout cannot start with half-configured services.
# ---------------------------------------------------------------------------
log "rendering runtime environment"
"$RELEASE_DIR/scripts/render-env.sh"

read_runtime() {
  grep -E "^$1=" /etc/tyche/runtime.env | head -n1 | cut -d= -f2-
}

api_domain="$(read_runtime TYCHE_API_DOMAIN)"
worker_domain="$(read_runtime TYCHE_WORKER_DOMAIN)"
acme_email="$(read_runtime ACME_EMAIL)"

[ -n "$api_domain" ] || fatal "TYCHE_API_DOMAIN is not configured."
[ -n "$worker_domain" ] || fatal "TYCHE_WORKER_DOMAIN is not configured."
[ -n "$acme_email" ] || fatal "ACME_EMAIL is not configured."

# Interpolation values for the compose file. This file holds no secrets; the
# secrets are read by the containers from /etc/tyche/runtime.env.
umask 022
cat >"$ENV_FILE" <<ENV
TYCHE_IMAGE=$IMAGE
TYCHE_API_DOMAIN=$api_domain
TYCHE_WORKER_DOMAIN=$worker_domain
ACME_EMAIL=$acme_email
ENV

# ---------------------------------------------------------------------------
# Roll out
# ---------------------------------------------------------------------------
log "starting release $requested"
docker compose --project-directory "$RELEASE_DIR" \
  --file "$COMPOSE_FILE" --env-file "$ENV_FILE" \
  up --detach --remove-orphans

# ---------------------------------------------------------------------------
# Health gate. Both services expose /health, and the compose healthchecks call
# it; this waits for the container health status rather than for the process to
# merely be running, because apps/api listens only after its state has
# rehydrated.
# ---------------------------------------------------------------------------
log "waiting up to ${HEALTH_TIMEOUT_SECONDS}s for api and worker to report healthy"
deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
healthy=0
while [ "$SECONDS" -lt "$deadline" ]; do
  api_state="$(docker inspect --format '{{.State.Health.Status}}' tyche-api 2>/dev/null || echo missing)"
  worker_state="$(docker inspect --format '{{.State.Health.Status}}' tyche-worker 2>/dev/null || echo missing)"
  if [ "$api_state" = "healthy" ] && [ "$worker_state" = "healthy" ]; then
    healthy=1
    break
  fi
  if [ "$api_state" = "missing" ] || [ "$worker_state" = "missing" ]; then
    log "container missing (api=$api_state worker=$worker_state)"
  fi
  sleep 5
done

if [ "$healthy" -ne 1 ]; then
  log "release $requested did not become healthy (api=$api_state worker=$worker_state)"
  log "--- last 120 log lines ---"
  docker compose --project-directory "$RELEASE_DIR" \
    --file "$COMPOSE_FILE" --env-file "$ENV_FILE" \
    logs --tail 120 api worker || true
  if [ "$rolling_back" -eq 1 ]; then
    fatal "the rollback target is also unhealthy; this needs manual investigation."
  fi
  # The caller decides: the deploy workflow runs `tyche-deploy rollback`. Doing
  # it here would hide which release actually failed.
  fatal "health gate failed. Roll back with: tyche-deploy rollback"
fi

# ---------------------------------------------------------------------------
# Record the release only after it proved healthy.
# ---------------------------------------------------------------------------
if [ "$rolling_back" -eq 0 ] && [ -n "$previous_tag" ] && [ "$previous_tag" != "$requested" ]; then
  echo "$previous_tag" >"$PREVIOUS_TAG_FILE"
fi
echo "$requested" >"$CURRENT_TAG_FILE"

# Keep the current and previous images so a rollback needs no network, and drop
# the rest to stop the root volume from filling with old releases.
keep_current="$(cat "$CURRENT_TAG_FILE")"
keep_previous=""
[ -f "$PREVIOUS_TAG_FILE" ] && keep_previous="$(cat "$PREVIOUS_TAG_FILE")"
docker images --format '{{.Repository}}:{{.Tag}}' "$ECR_REPOSITORY" |
  while read -r image; do
    tag="${image##*:}"
    if [ "$tag" != "$keep_current" ] && [ "$tag" != "$keep_previous" ]; then
      log "removing superseded image $image"
      docker rmi "$image" >/dev/null 2>&1 || true
    fi
  done

log "release $requested is live (previous: ${keep_previous:-none})"
