#!/usr/bin/env bash
# Publish a reviewed program artifact as an upgrade buffer, then hand the buffer
# to the governance authority that will consume it.
#
# Runs INSIDE the pinned toolchain container with the same mounts as sbf.sh. The
# RPC endpoint is read from the mounted `.env` so its provider credential never
# reaches a command line, a log, or this repository. Keypairs are read from the
# mounted volume and never printed.
#
#   publish-upgrade-buffer.sh publish
#   NEW_BUFFER_AUTHORITY=<pubkey> BUFFER=<pubkey> publish-upgrade-buffer.sh handoff
set -euo pipefail

DEPLOY_DIR="/root/.config/tyche/devnet"
DEPLOY_PROGRAM="${DEPLOY_PROGRAM:-tyche}"
SBF_OUT_DIR="${SBF_OUT_DIR:-/sbf-target/deploy}"
SO_PATH="${SO_PATH:-${SBF_OUT_DIR}/${DEPLOY_PROGRAM}.so}"
PAYER="${PAYER:-${DEPLOY_DIR}/tyche-deployer-keypair.json}"
export PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

resolve_rpc_url() {
  local url
  url="$(grep -m1 '^TYCHE_SOLANA_RPC_URL=' /workspace/.env | cut -d '=' -f 2- | tr -d '\r')"
  if [ -z "${url}" ]; then
    echo "[config] TYCHE_SOLANA_RPC_URL is not set in /workspace/.env" >&2
    return 1
  fi
  printf '%s' "${url}"
}

cmd_publish() {
  if [ ! -f "${SO_PATH}" ]; then
    echo "[publish] artifact not found: ${SO_PATH}" >&2
    return 1
  fi
  local rpc_url
  rpc_url="$(resolve_rpc_url)"
  echo "[publish] artifact ${SO_PATH}"
  echo "[publish] $(sha256sum "${SO_PATH}")"
  echo "[publish] bytes $(stat -c '%s' "${SO_PATH}")"
  echo "[publish] rpc host $(printf '%s' "${rpc_url}" | cut -d / -f 3)"
  solana program write-buffer "${SO_PATH}" \
    --keypair "${PAYER}" \
    --url "${rpc_url}" \
    --output json
}

# Hand the reviewed buffer to the upgrade authority (normally a governance
# vault) so it -- and only it -- can consume the buffer in an upgrade.
cmd_handoff() {
  if [ -z "${BUFFER:-}" ] || [ -z "${NEW_BUFFER_AUTHORITY:-}" ]; then
    echo "[config] BUFFER and NEW_BUFFER_AUTHORITY are required" >&2
    return 1
  fi
  local rpc_url
  rpc_url="$(resolve_rpc_url)"
  echo "[handoff] buffer ${BUFFER}"
  echo "[handoff] new buffer authority ${NEW_BUFFER_AUTHORITY}"
  solana program set-buffer-authority "${BUFFER}" \
    --new-buffer-authority "${NEW_BUFFER_AUTHORITY}" \
    --keypair "${PAYER}" \
    --url "${rpc_url}"
}

case "${1:-publish}" in
  publish) cmd_publish ;;
  handoff) cmd_handoff ;;
  *) echo "usage: publish-upgrade-buffer.sh [publish|handoff]" >&2; exit 2 ;;
esac
