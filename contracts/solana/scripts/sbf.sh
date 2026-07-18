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
SBF_OUT_DIR="${SBF_OUT_DIR:-/sbf-target/deploy}"
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
  local idealer_feature_args=()
  if [ -n "${SBF_FEATURES:-}" ]; then
    # Optional cargo features (e.g. SBF_FEATURES=devnet-test). Defaults to none
    # so production builds never include test-only instructions.
    echo "[build] features: ${SBF_FEATURES}"
    idealer_feature_args=(--features "${SBF_FEATURES}")
  fi
  echo "[build] cargo build-sbf (tokenomics-core, isolated entrypoint)..."
  local build_log
  local build_status
  build_log="$(mktemp)"
  set +e
  # Build each deployable independently. A workspace-wide build unifies
  # idealer's tokenomics-core/cpi dependency into tokenomics-core itself and
  # silently produces a tokenomics artifact with no entrypoint.
  cargo-build-sbf \
    --manifest-path programs/tokenomics_core/Cargo.toml \
    --sbf-out-dir "${SBF_OUT_DIR}" 2>&1 \
    | tee "${build_log}"
  build_status="${PIPESTATUS[0]}"
  set -e
  if [ "${build_status}" -ne 0 ] || grep -q '^Error:' "${build_log}"; then
    echo "[build] tokenomics-core cargo build-sbf reported compiler errors" >&2
    rm -f "${build_log}"
    return 1
  fi
  rm -f "${build_log}"

  echo "[build] cargo build-sbf (idealer)..."
  build_log="$(mktemp)"
  set +e
  cargo-build-sbf \
    --manifest-path programs/idealer/Cargo.toml \
    --sbf-out-dir "${SBF_OUT_DIR}" \
    "${idealer_feature_args[@]}" 2>&1 \
    | tee "${build_log}"
  build_status="${PIPESTATUS[0]}"
  set -e
  if [ "${build_status}" -ne 0 ] || grep -q '^Error:' "${build_log}"; then
    echo "[build] idealer cargo build-sbf reported compiler errors" >&2
    rm -f "${build_log}"
    return 1
  fi
  rm -f "${build_log}"

  # cargo-build-sbf may create deploy keypairs as a side effect. The programs
  # use declared ids and verification never needs these disposable secrets.
  rm -f \
    "${SBF_OUT_DIR}/idealer-keypair.json" \
    "${SBF_OUT_DIR}/tokenomics_core-keypair.json"
  ls -la \
    "${SBF_OUT_DIR}/tokenomics_core.so" \
    "${SBF_OUT_DIR}/idealer.so"
}

cmd_test_sbf() {
  ensure_toolchain
  local test_out_dir="${SBF_TEST_OUT_DIR:-/sbf-target/test-deploy}"
  local test_features="${SBF_TEST_FEATURES:-sb-devnet}"
  echo "[test:sbf] building an isolated Switchboard-devnet SBF artifact..."
  SBF_OUT_DIR="${test_out_dir}" SBF_FEATURES="${test_features}" cmd_build
  cd /workspace/contracts/solana
  echo "[test:sbf] running ignored instruction suite against the SBF build..."
  # Single-threaded: the program-test bank/clock state is timing-sensitive, so
  # parallel execution of these stateful integration tests is flaky.
  SBF_OUT_DIR="${test_out_dir}" BPF_OUT_DIR="${test_out_dir}" \
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
