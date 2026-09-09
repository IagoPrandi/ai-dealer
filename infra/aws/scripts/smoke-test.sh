#!/usr/bin/env bash
#
# Post-deploy verification, run from the CI runner against the public
# hostnames. It checks two different things:
#
#   1. The release actually serves: health and one real read endpoint.
#   2. The edge allowlist in the Caddyfile still blocks the settlement and
#      operator routes. That allowlist is the only thing standing between the
#      internet and an unauthenticated settlement pipeline, so it is verified
#      on every deploy rather than trusted.
#
# The blocked-route probes are sent without a body. If the allowlist were
# broken the request would reach apps/api and fail body parsing instead of
# performing a mutation, and this script reports the failure.
#
# usage: smoke-test.sh <api-domain> <worker-domain>
set -euo pipefail

API_DOMAIN="${1:?api domain required}"
WORKER_DOMAIN="${2:?worker domain required}"

failures=0

pass() { echo "  ok    $*"; }
fail() {
  echo "  FAIL  $*" >&2
  failures=$((failures + 1))
}

status_of() {
  local method="$1" url="$2"
  curl --silent --show-error --location --max-time 30 \
    --output /dev/null --write-out '%{http_code}' \
    --request "$method" "$url"
}

echo "Serving checks"

health_body="$(curl --silent --show-error --max-time 30 "https://$API_DOMAIN/health" || true)"
if grep -q '"status":"ok"' <<<"$health_body"; then
  pass "GET /health reports status ok"
else
  fail "GET /health did not report status ok: ${health_body:-<empty>}"
fi

worker_health="$(status_of GET "https://$WORKER_DOMAIN/health")"
if [ "$worker_health" = "200" ]; then
  pass "worker GET /health returned 200"
else
  fail "worker GET /health returned $worker_health"
fi

rounds="$(status_of GET "https://$API_DOMAIN/rounds")"
if [ "$rounds" = "200" ]; then
  pass "GET /rounds returned 200"
else
  fail "GET /rounds returned $rounds"
fi

hsts="$(curl --silent --show-error --max-time 30 --head "https://$API_DOMAIN/health" |
  tr -d '\r' | grep -ci '^strict-transport-security:' || true)"
if [ "$hsts" -ge 1 ]; then
  pass "HSTS header present"
else
  fail "HSTS header missing"
fi

echo "Edge allowlist checks"

# method:path pairs that must never be reachable from the internet.
blocked=(
  "POST:/claim-records/create-turn"
  "POST:/claim-records/expire-unclaimed"
  "POST:/winner-records/calculate-turn"
  "POST:/reward-records/calculate-turn"
  "POST:/verification-jobs/create-turn"
  "POST:/turn-rollovers/settle"
  "POST:/settlement-transitions"
  "POST:/draws"
  "POST:/elections"
  "POST:/rule-eliminations"
  "POST:/rule-precompilations"
  "POST:/rule-validations/run"
  "POST:/tokenomics/projection"
  "POST:/tokenomics/artifacts"
  "GET:/admin/repeated-vote-fee-reconciliation/1"
)

for entry in "${blocked[@]}"; do
  method="${entry%%:*}"
  path="${entry#*:}"
  code="$(status_of "$method" "https://$API_DOMAIN$path")"
  if [ "$code" = "403" ]; then
    pass "$method $path is blocked at the edge"
  else
    fail "$method $path returned $code, expected 403 - the edge allowlist is not protecting it"
  fi
done

for path in /manual/open /manual/close /manual/cycle; do
  code="$(status_of POST "https://$WORKER_DOMAIN$path")"
  if [ "$code" = "403" ]; then
    pass "worker POST $path is blocked at the edge"
  else
    fail "worker POST $path returned $code, expected 403"
  fi
done

if [ "$failures" -gt 0 ]; then
  echo "smoke test failed with $failures problem(s)" >&2
  exit 1
fi

echo "smoke test passed"
