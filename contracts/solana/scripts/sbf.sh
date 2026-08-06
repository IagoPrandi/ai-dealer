#!/usr/bin/env bash
# SBF build / SBF integration test / devnet upgrade-deploy helper for the
# Tyche program. Designed to run INSIDE the pinned toolchain container with
# these mounts:
#   - workspace        -> /workspace
#   - tyche-solana-home -> /root   (persists the Agave toolchain + deploy keys)
#   - tyche-cargo-registry -> /usr/local/cargo/registry
#   - tyche-sbf-target -> /sbf-target  (CARGO_TARGET_DIR)
#
# Never prints or copies keypair contents. Keypairs are read from the mounted
# volume at /root/.config/tyche/devnet/.
set -euo pipefail

AGAVE_VERSION="${AGAVE_VERSION:-2.1.21}"
DEPLOY_DIR="/root/.config/tyche/devnet"
DEPLOY_PROGRAM="${DEPLOY_PROGRAM:-tyche}"
case "${DEPLOY_PROGRAM}" in
  tyche)
    default_program_keypair="${DEPLOY_DIR}/tyche-program-keypair.json"
    ;;
  tokenomics_core)
    default_program_keypair="${DEPLOY_DIR}/tokenomics-core-program-keypair.json"
    ;;
  *)
    echo "[config] DEPLOY_PROGRAM must be tyche or tokenomics_core" >&2
    exit 2
    ;;
esac
PROGRAM_KEYPAIR_PATH="${PROGRAM_KEYPAIR_PATH:-${default_program_keypair}}"
PROGRAM_ID="${PROGRAM_ID:-}"
SBF_OUT_DIR="${SBF_OUT_DIR:-/sbf-target/deploy}"
SO_PATH="${SBF_OUT_DIR}/${DEPLOY_PROGRAM}.so"
export PATH="/root/.local/share/solana/install/active_release/bin:${PATH}"

resolve_program_id() {
  if [ ! -f "${PROGRAM_KEYPAIR_PATH}" ]; then
    echo "[config] externally managed program keypair not found: ${PROGRAM_KEYPAIR_PATH}" >&2
    return 1
  fi
  local keypair_program_id
  keypair_program_id="$(solana-keygen pubkey "${PROGRAM_KEYPAIR_PATH}")"
  if [ -n "${PROGRAM_ID}" ] && [ "${PROGRAM_ID}" != "${keypair_program_id}" ]; then
    echo "[config] PROGRAM_ID does not match PROGRAM_KEYPAIR_PATH" >&2
    return 1
  fi
  echo "${keypair_program_id}"
}

assert_declared_program_id() {
  local program_id="$1"
  local declared_program_id
  declared_program_id="$(
    sed -n 's/.*declare_id!("\([^"]*\)").*/\1/p' \
      "/workspace/contracts/solana/programs/${DEPLOY_PROGRAM}/src/lib.rs" \
      | head -1
  )"
  if [ -z "${declared_program_id}" ] || [ "${declared_program_id}" != "${program_id}" ]; then
    echo "[config] ${DEPLOY_PROGRAM} declare_id does not match the deployment keypair" >&2
    return 1
  fi
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
  local tyche_feature_args=()
  local tokenomics_feature_args=()
  if [ -n "${TOKENOMICS_SBF_FEATURES:-}" ]; then
    echo "[build] tokenomics-core features: ${TOKENOMICS_SBF_FEATURES}"
    tokenomics_feature_args=(--features "${TOKENOMICS_SBF_FEATURES}")
  fi
  if [ -n "${SBF_FEATURES:-}" ]; then
    # Optional cargo features (e.g. SBF_FEATURES=devnet-test). Defaults to none
    # so production builds never include test-only instructions.
    echo "[build] features: ${SBF_FEATURES}"
    tyche_feature_args=(--features "${SBF_FEATURES}")
  fi
  echo "[build] cargo build-sbf (tokenomics-core, isolated entrypoint)..."
  local build_log
  local build_status
  build_log="$(mktemp)"
  set +e
  # Build each deployable independently. A workspace-wide build unifies
  # tyche's tokenomics-core/cpi dependency into tokenomics-core itself and
  # silently produces a tokenomics artifact with no entrypoint.
  cargo-build-sbf \
    --manifest-path programs/tokenomics_core/Cargo.toml \
    --sbf-out-dir "${SBF_OUT_DIR}" \
    "${tokenomics_feature_args[@]}" 2>&1 \
    | tee "${build_log}"
  build_status="${PIPESTATUS[0]}"
  set -e
  if [ "${build_status}" -ne 0 ] || grep -q '^Error:' "${build_log}"; then
    echo "[build] tokenomics-core cargo build-sbf reported compiler errors" >&2
    rm -f "${build_log}"
    return 1
  fi
  rm -f "${build_log}"

  echo "[build] cargo build-sbf (tyche)..."
  build_log="$(mktemp)"
  set +e
  cargo-build-sbf \
    --manifest-path programs/tyche/Cargo.toml \
    --sbf-out-dir "${SBF_OUT_DIR}" \
    "${tyche_feature_args[@]}" 2>&1 \
    | tee "${build_log}"
  build_status="${PIPESTATUS[0]}"
  set -e
  if [ "${build_status}" -ne 0 ] || grep -q '^Error:' "${build_log}"; then
    echo "[build] tyche cargo build-sbf reported compiler errors" >&2
    rm -f "${build_log}"
    return 1
  fi
  rm -f "${build_log}"

  # cargo-build-sbf may create deploy keypairs as a side effect. The programs
  # use declared ids and verification never needs these disposable secrets.
  rm -f \
    "${SBF_OUT_DIR}/tyche-keypair.json" \
    "${SBF_OUT_DIR}/tokenomics_core-keypair.json"
  ls -la \
    "${SBF_OUT_DIR}/tokenomics_core.so" \
    "${SBF_OUT_DIR}/tyche.so"
}

cmd_test_sbf() {
  ensure_toolchain
  local test_out_dir="${SBF_TEST_OUT_DIR:-/sbf-target/test-deploy}"
  local test_features="${SBF_TEST_FEATURES:-sb-devnet}"
  local tokenomics_test_features="${TOKENOMICS_SBF_TEST_FEATURES:-devnet-empty-metadata-uri,devnet-campaign-v2-migration}"
  echo "[test:sbf] building an isolated Switchboard-devnet SBF artifact..."
  SBF_OUT_DIR="${test_out_dir}" \
    SBF_FEATURES="${test_features}" \
    TOKENOMICS_SBF_FEATURES="${tokenomics_test_features}" \
    cmd_build
  cd /workspace/contracts/solana
  echo "[test:sbf] running ignored instruction suite against the SBF build..."
  # These stateful integration suites must run serially. `--test-threads=1`
  # only serializes cases inside one test binary; Cargo can still launch the
  # Tyche and Tokenomics Core binaries concurrently when addressed through
  # the workspace, which makes the SBF run flaky.
  SBF_OUT_DIR="${test_out_dir}" BPF_OUT_DIR="${test_out_dir}" \
    cargo test -p tokenomics-core --test instructions --all-features --locked -- --ignored --test-threads=1
  SBF_OUT_DIR="${test_out_dir}" BPF_OUT_DIR="${test_out_dir}" \
    cargo test -p tyche --test instructions --all-features --locked -- --ignored --test-threads=1
}

cmd_deploy() {
  ensure_toolchain
  solana config set --url devnet >/dev/null
  local deployer="${DEPLOY_DIR}/tyche-deployer-keypair.json"
  local program_kp="${PROGRAM_KEYPAIR_PATH}"
  local program_id
  program_id="$(resolve_program_id)"
  assert_declared_program_id "${program_id}"
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

cmd_set_upgrade_authority() {
  ensure_toolchain
  if [ -z "${NEW_UPGRADE_AUTHORITY:-}" ]; then
    echo "[config] NEW_UPGRADE_AUTHORITY is required" >&2
    return 1
  fi
  local deployer="${DEPLOY_DIR}/tyche-deployer-keypair.json"
  local program_id
  program_id="$(resolve_program_id)"
  assert_declared_program_id "${program_id}"
  echo "[authority] program ${program_id}"
  echo "[authority] new upgrade authority ${NEW_UPGRADE_AUTHORITY}"
  solana program show "${program_id}" --url devnet -k "${deployer}"
  solana program set-upgrade-authority "${program_id}" \
    --new-upgrade-authority "${NEW_UPGRADE_AUTHORITY}" \
    --skip-new-upgrade-authority-signer-check \
    --upgrade-authority "${deployer}" \
    --keypair "${deployer}" \
    --url devnet
  solana program show "${program_id}" --url devnet -k "${deployer}"
}

cmd_fund() {
  ensure_toolchain
  local deployer_pub
  deployer_pub="$(solana-keygen pubkey "${DEPLOY_DIR}/tyche-deployer-keypair.json")"
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
  set-upgrade-authority) cmd_set_upgrade_authority ;;
  *) echo "usage: sbf.sh [build|test-sbf|fund|deploy|set-upgrade-authority]" >&2; exit 2 ;;
esac
