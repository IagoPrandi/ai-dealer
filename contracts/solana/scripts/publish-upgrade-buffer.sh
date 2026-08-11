#!/usr/bin/env bash
# Publish a reviewed program artifact as an upgrade buffer, then hand the buffer
# to the governance authority that will consume it.
#
# Runs INSIDE the pinned toolchain container with the same mounts as sbf.sh. The
# RPC endpoint is read from the mounted `.env` so its provider credential never
# reaches a command line, a log, or this repository. Keypairs are read from the
# mounted volume and never printed.
#
#   publish-upgrade-buffer.sh preflight
#   publish-upgrade-buffer.sh publish
#   NEW_BUFFER_AUTHORITY=<pubkey> BUFFER=<pubkey> publish-upgrade-buffer.sh handoff
#
# Set PAYER_ENV_NAME=PRIVATE_KEY_WALLET_A or PRIVATE_KEY_WALLET_B to load the
# payer from /workspace/.env into an ephemeral container-only keypair file.
set -euo pipefail

DEPLOY_DIR="/root/.config/tyche/devnet"
DEPLOY_PROGRAM="${DEPLOY_PROGRAM:-tyche}"
SBF_OUT_DIR="${SBF_OUT_DIR:-/sbf-target/deploy}"
SO_PATH="${SO_PATH:-${SBF_OUT_DIR}/${DEPLOY_PROGRAM}.so}"
PAYER="${PAYER:-${DEPLOY_DIR}/tyche-deployer-keypair.json}"
PAYER_ENV_NAME="${PAYER_ENV_NAME:-}"
PAYER_EXPECTED_PUBLIC_KEY="${PAYER_EXPECTED_PUBLIC_KEY:-}"
BUFFER_SIGNER="${BUFFER_SIGNER:-}"
BUFFER_EXPECTED_PUBLIC_KEY="${BUFFER_EXPECTED_PUBLIC_KEY:-}"
TEMP_PAYER_DIR=""
export PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

cleanup() {
  if [ -n "${TEMP_PAYER_DIR}" ] && [ -d "${TEMP_PAYER_DIR}" ]; then
    rm -f "${TEMP_PAYER_DIR}/payer.json"
    rmdir "${TEMP_PAYER_DIR}"
  fi
}
trap cleanup EXIT

prepare_payer() {
  if [ -z "${PAYER_ENV_NAME}" ]; then
    return
  fi
  case "${PAYER_ENV_NAME}" in
    PRIVATE_KEY_WALLET_A|PRIVATE_KEY_WALLET_B) ;;
    *)
      echo "[config] PAYER_ENV_NAME must be PRIVATE_KEY_WALLET_A or PRIVATE_KEY_WALLET_B" >&2
      return 1
      ;;
  esac
  if [ ! -f /workspace/.env ]; then
    echo "[config] /workspace/.env is required for ${PAYER_ENV_NAME}" >&2
    return 1
  fi
  TEMP_PAYER_DIR="$(mktemp -d)"
  PAYER="${TEMP_PAYER_DIR}/payer.json"
  (
    cd /workspace/apps/worker
    node --env-file=/workspace/.env --input-type=module -e '
      import { writeFileSync } from "node:fs";

      const [name, output] = process.argv.slice(1);
      const encoded = process.env[name]?.trim();
      if (!encoded) throw new Error(`${name} is missing from /workspace/.env`);
      const decodeBase58 = (value) => {
        const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
        let number = 0n;
        for (const character of value) {
          const digit = alphabet.indexOf(character);
          if (digit < 0) throw new Error(`${name} is not valid base58`);
          number = number * 58n + BigInt(digit);
        }
        const bytes = [];
        while (number > 0n) {
          bytes.push(Number(number & 255n));
          number >>= 8n;
        }
        bytes.reverse();
        for (const character of value) {
          if (character !== "1") break;
          bytes.unshift(0);
        }
        return Uint8Array.from(bytes);
      };
      const decoded = encoded.startsWith("[")
        ? Uint8Array.from(JSON.parse(encoded))
        : decodeBase58(encoded);
      if (decoded.length !== 64) throw new Error(`${name} must contain a 64-byte Solana keypair`);
      writeFileSync(output, JSON.stringify(Array.from(decoded)), {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
    ' "${PAYER_ENV_NAME}" "${PAYER}"
  )
  local actual_public_key
  actual_public_key="$(solana-keygen pubkey "${PAYER}")"
  if [ -n "${PAYER_EXPECTED_PUBLIC_KEY}" ] && [ "${actual_public_key}" != "${PAYER_EXPECTED_PUBLIC_KEY}" ]; then
    echo "[config] ${PAYER_ENV_NAME} resolves to an unexpected public key" >&2
    return 1
  fi
  echo "[payer] ${PAYER_ENV_NAME} -> ${actual_public_key}"
}

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
  prepare_payer
  rpc_url="$(resolve_rpc_url)"
  local -a buffer_options=()
  if [ -n "${BUFFER_SIGNER}" ]; then
    if [ ! -f "${BUFFER_SIGNER}" ]; then
      echo "[config] buffer signer not found: ${BUFFER_SIGNER}" >&2
      return 1
    fi
    local buffer_public_key
    buffer_public_key="$(solana-keygen pubkey "${BUFFER_SIGNER}")"
    if [ -n "${BUFFER_EXPECTED_PUBLIC_KEY}" ] && [ "${buffer_public_key}" != "${BUFFER_EXPECTED_PUBLIC_KEY}" ]; then
      echo "[config] buffer signer resolves to an unexpected public key" >&2
      return 1
    fi
    echo "[publish] buffer ${buffer_public_key}"
    buffer_options=(--buffer "${BUFFER_SIGNER}")
  fi
  echo "[publish] artifact ${SO_PATH}"
  echo "[publish] $(sha256sum "${SO_PATH}")"
  echo "[publish] bytes $(stat -c '%s' "${SO_PATH}")"
  echo "[publish] rpc host $(printf '%s' "${rpc_url}" | cut -d / -f 3)"
  solana program write-buffer "${SO_PATH}" \
    --keypair "${PAYER}" \
    --fee-payer "${PAYER}" \
    --buffer-authority "${PAYER}" \
    "${buffer_options[@]}" \
    --commitment finalized \
    --use-rpc \
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
  prepare_payer
  rpc_url="$(resolve_rpc_url)"
  echo "[handoff] buffer ${BUFFER}"
  echo "[handoff] new buffer authority ${NEW_BUFFER_AUTHORITY}"
  solana program set-buffer-authority "${BUFFER}" \
    --new-buffer-authority "${NEW_BUFFER_AUTHORITY}" \
    --keypair "${PAYER}" \
    --url "${rpc_url}"
}

cmd_preflight() {
  if [ ! -f "${SO_PATH}" ]; then
    echo "[preflight] artifact not found: ${SO_PATH}" >&2
    return 1
  fi
  local rpc_url payer_public_key
  prepare_payer
  rpc_url="$(resolve_rpc_url)"
  payer_public_key="$(solana-keygen pubkey "${PAYER}")"
  echo "[preflight] artifact ${SO_PATH}"
  echo "[preflight] $(sha256sum "${SO_PATH}")"
  echo "[preflight] bytes $(stat -c '%s' "${SO_PATH}")"
  echo "[preflight] rpc host $(printf '%s' "${rpc_url}" | cut -d / -f 3)"
  echo "[preflight] genesis $(solana genesis-hash --url "${rpc_url}")"
  echo "[preflight] payer ${payer_public_key}"
  echo "[preflight] payer lamports $(solana balance "${payer_public_key}" --lamports --url "${rpc_url}")"
  if [ -n "${BUFFER_SIGNER}" ]; then
    if [ ! -f "${BUFFER_SIGNER}" ]; then
      echo "[config] buffer signer not found: ${BUFFER_SIGNER}" >&2
      return 1
    fi
    local buffer_public_key
    buffer_public_key="$(solana-keygen pubkey "${BUFFER_SIGNER}")"
    if [ -n "${BUFFER_EXPECTED_PUBLIC_KEY}" ] && [ "${buffer_public_key}" != "${BUFFER_EXPECTED_PUBLIC_KEY}" ]; then
      echo "[config] buffer signer resolves to an unexpected public key" >&2
      return 1
    fi
    echo "[preflight] buffer ${buffer_public_key}"
  fi
}

case "${1:-publish}" in
  preflight) cmd_preflight ;;
  publish) cmd_publish ;;
  handoff) cmd_handoff ;;
  *) echo "usage: publish-upgrade-buffer.sh [preflight|publish|handoff]" >&2; exit 2 ;;
esac
