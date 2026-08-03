# On-chain upgrade evidence

Use this checklist with `idealer-solana-contract-upgrade`. It supplements, not
replaces, the current program README and deployment scripts.

## Artifact evidence

- Build each deployable program independently with the repository's pinned SBF
  helper. A workspace-wide build can produce the wrong artifact/entrypoint.
- Use an isolated `SBF_OUT_DIR`; retain the final `.so` until the proposal is
  executed and verified.
- Record: source commit, program name/ID, features, `.so` path, byte length,
  SHA-256, native test output, default/all-feature clippy, and serial SBF test
  result.
- Check that the deployment keypair's public key equals `declare_id!` before an
  upload. A matching build for a different program ID is not deployable.

## ProgramData and buffer evidence

Before an upgrade, read the chain rather than relying on cached UI state:

```text
program executable owner
ProgramData address, authority, data length/capacity
buffer address, owner, authority, data length, SHA-256
new artifact byte length and SHA-256
required ProgramData extension bytes and rent estimate
```

If capacity is insufficient, the extension is its own governed action. Verify
the final ProgramData capacity after execution before uploading or proposing an
upgrade. A buffer upload is not an upgrade; a proposal is not an approval; two
approvals are not execution.

## Squads evidence

For every proposal, read the actual on-chain multisig account and prove:

```text
cluster, multisig address, member addresses and permissions,
threshold, vault index/address, proposal address/status,
transaction accounts/data, vote records, execution signature
```

The upgrade instruction must target the verified ProgramData and reviewed
buffer, use the canonical vault as authority/spill recipient when required, and
contain no unrelated token instruction. The buffer's authority must be the
vault before a governed upgrade can consume it.

## Transaction gates

1. Simulate signed bytes using the actual payer/signers and fresh blockhash.
2. Read the simulation logs, units, error, fee payer, and every account write.
3. State exact cost and token movement. Account rent is distinct from the
   network fee.
4. Obtain user authorization for this exact stage and cluster.
5. Broadcast once; retry only with the same idempotent/reviewed instruction
   after checking whether it already finalized.
6. Read finalized transaction metadata and on-chain accounts.

Do not serialize raw `bigint` values with `JSON.stringify`; convert them to
strings in status/error output. A serialization exception after a wallet prompt
does not prove the transaction failed—read the signature on-chain.

## Windows and Docker lessons

- Run `docker run -v` commands from PowerShell, not Git Bash, to avoid Windows
  path rewriting.
- The native Windows host lacks the pinned Anchor/Solana SBF toolchain; use the
  repository Docker helper and persistent toolchain/key volumes.
- Source mounted into an already-running container is not reliable hot reload.
  Recreate the affected service and prove the intended code/config is live.
- Compose values from `.env` can override inline shell values. Inspect the
  container's effective environment after recreation.
- Public devnet RPC can return 429 or time out. Back off and re-read state;
  never change recipient, authority, or artifact to force progress.
- Docker Desktop can wedge. Inspect Compose state first; restart Docker Desktop
  if necessary. Do not prune volumes, reset the worktree, or generate a new
  program keypair as a recovery shortcut.

## Final evidence

An upgrade is complete only after all are true:

- the execution transaction is finalized with `err: null`;
- the program is executable at the expected ID;
- ProgramData capacity and upgrade authority match the reviewed governance
  design;
- deployed program bytes hash to the approved artifact SHA-256;
- the proposal reports executed with the required approvals;
- the buffer is closed or in its expected post-execution state;
- API/indexer/audit data reconcile to the chain; and
- deployment records, runbook, Progress Tracker, and Work Log are updated.
