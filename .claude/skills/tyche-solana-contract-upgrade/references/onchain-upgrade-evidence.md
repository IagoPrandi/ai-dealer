# On-chain upgrade evidence

Use this checklist with `tyche-solana-contract-upgrade`. It supplements, not
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

### Hash the artifact-length prefix, not the trimmed bytes

ProgramData and buffer payloads are zero-padded to their allocation, so the
comparison must hash exactly the first `artifact byte length` bytes. Trimming
trailing zeros before hashing silently compares a different span: an artifact
may legitimately end in zeros, and the hash will not match even when the bytes
are correct. Carry the reviewed byte length alongside the SHA-256 and hash that
prefix on both the buffer and, after execution, the deployed ProgramData.

### Fund the buffer payer before starting

Buffer rent is roughly `(bytes + 128) * 6960` lamports — about `7.2 SOL` for a
`1 MB` artifact — and it is released to the upgrade's spill address only when
the upgrade executes. Read the payer's balance first: a write-buffer run that
dies part-way leaves a funded orphan buffer. Prefer spilling back to whoever
funded the publication rather than to whoever happens to propose.

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
  never change recipient, authority, or artifact to force progress. The Solana
  CLI defaults to `api.devnet.solana.com`, which reliably 429s part-way through
  a `write-buffer` of ~1000 transactions — pass the project endpoint explicitly.
- Read that endpoint from the mounted `/workspace/.env` **inside** the container
  rather than passing it as an argument. The URL carries a provider API key; an
  inline value leaks it into the command line, the tool output, and the log. Log
  only its host.
- PowerShell strips the inner quotes from `docker run ... bash -c '<script>'`,
  so a command that parses fine in a shell arrives at bash mangled (`syntax
  error near unexpected token`) or, worse, silently parses into the wrong value.
  Put anything beyond a single bare word in a committed script and invoke it as
  `bash /workspace/<path>.sh` — the pattern `sbf.sh` already uses.
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
