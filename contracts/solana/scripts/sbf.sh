#!/usr/bin/env bash
# SBF build / SBF integration test / devnet upgrade-deploy helper for the
# Idealer program. Designed to run INSIDE the pinned toolchain container with
# these mounts:
#   - workspace        -> /workspace
#   - idealer-solana-home -> /root   (persists the Agave toolchain + deploy keys)
#   - idealer-cargo-registry -> /usr/local/cargo/registry
#   - idealer-sbf-target -> /sbf-target  (CARGO_TARGET_DIR)
#
# Never prints or copies keypair contents. Keypairs are read from the mounted
# volume at /root/.config/idealer/devnet/.
set -euo pipefail

AGAVE_VERSION="${AGAVE_VERSION:-2.1.21}"
DEPLOY_DIR="/root/.config/idealer/devnet"
PROGRAM_KEYPAIR_PATH="${PROGRAM_KEYPAIR_PATH:-${DEPLOY_DIR}/idealer-program-keypair.json}"
PROGRAM_ID="${PROGRAM_ID:-}"
SBF_OUT_DIR="/sbf-target/deploy"
SO_PATH="${SBF_OUT_DIR}/idealer.so"
export PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

resolve_program_id() {
  if [ -n "${PROGRAM_ID}" ]; then
    echo "${PROGRAM_ID}"
    return 0
  fi
  solana-keygen pubkey "${PROGRAM_KEYPAIR_PATH}"
}

ensure_toolchain() {
  if ! command -v cargo-build-sbf >/dev/null 2>&1; then
    echo "[toolchain] installing agave ${AGAVE_VERSION}..."
    apt-get update -qq && apt-get install -y -qq curl bzip2 >/dev/null
    sh -c "$(curl -sSfL https://release.anza.xyz/v${AGAVE_VERSION}/install)" >/dev/null
    export PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"
  fi
  echo "[versions] $(solana --version) | $(cargo-build-sbf --version | head -1)"
}

cmd_build() {
  ensure_toolchain
  cd /workspace/contracts/solana
  local feature_args=()
  if [ -n "${SBF_FEATURES:-}" ]; then
    # Optional cargo features (e.g. SBF_FEATURES=devnet-test). Defaults to none
    # so production builds never include test-only instructions.
    echo "[build] features: ${SBF_FEATURES}"
    feature_args=(--features "${SBF_FEATURES}")
  fi
  echo "[build] cargo build-sbf..."
  cargo-build-sbf --sbf-out-dir "${SBF_OUT_DIR}" "${feature_args[@]}"
  ls -la "${SO_PATH}"
}

cmd_test_sbf() {
  ensure_toolchain
  cd /workspace/contracts/solana
  echo "[test:sbf] running ignored instruction suite against the SBF build..."
  # Single-threaded: the program-test bank/clock state is timing-sensitive, so
  # parallel execution of these stateful integration tests is flaky.
  SBF_OUT_DIR="${SBF_OUT_DIR}" BPF_OUT_DIR="${SBF_OUT_DIR}" \
    cargo test --test instructions --all-features --locked -- --ignored --test-threads=1
}

cmd_deploy() {
  ensure_toolchain
  solana config set --url devnet >/dev/null
  local deployer="${DEPLOY_DIR}/idealer-deployer-keypair.json"
  local program_kp="${PROGRAM_KEYPAIR_PATH}"
  local program_id
  program_id="$(resolve_program_id)"
  local deployer_pub
  deployer_pub="$(solana-keygen pubkey "${deployer}")"
  echo "[deploy] deployer ${deployer_pub}"
  echo "[deploy] program ${program_id}"
  echo "[deploy] balance $(solana balance "${deployer_pub}" --url devnet)"

  if [ ! -f "${SO_PATH}" ]; then
    echo "[deploy] no artifact at ${SO_PATH}; building first"
    cmd_build
  fi

  echo "[deploy] deploying program ${program_id}..."
  solana program deploy "${SO_PATH}" \
    --program-id "${program_kp}" \
    --upgrade-authority "${deployer}" \
    --keypair "${deployer}" \
    --url devnet
  echo "[verify]"
  solana program show "${program_id}" --url devnet -k "${deployer}"
}

cmd_fund() {
  ensure_toolchain
  local deployer_pub
  deployer_pub="$(solana-keygen pubkey "${DEPLOY_DIR}/idealer-deployer-keypair.json")"
  local target_sol="${2:-4}"
  for attempt in $(seq 1 12); do
    local balance
    balance="$(solana balance "${deployer_pub}" --url devnet | awk '{print $1}')"
    echo "[fund] attempt ${attempt}: balance ${balance} SOL (target ${target_sol})"
    if awk "BEGIN{exit !(${balance} >= ${target_sol})}"; then
      echo "[fund] target reached"
      return 0
    fi
    solana airdrop 1 "${deployer_pub}" --url devnet || echo "[fund] airdrop throttled"
    sleep 20
  done
  echo "[fund] could not reach target via faucet" >&2
  return 1
}

case "${1:-build}" in
  build) cmd_build ;;
  test-sbf) cmd_test_sbf ;;
  fund) cmd_fund "$@" ;;
  deploy) cmd_deploy ;;
  *) echo "usage: sbf.sh [build|test-sbf|fund|deploy]" >&2; exit 2 ;;
esac
