import {
  AccountRole,
  address,
  createSolanaRpc,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
} from "@solana/kit";
import {
  type AuthorityInstruction,
  type RpcClient,
  type TurnAutomationConfig,
  simulateAndSend,
} from "./turn-automation.js";

const SYSTEM_PROGRAM_ID = address("11111111111111111111111111111111");
const RECORD_CLAIM_DISCRIMINATOR = new Uint8Array([
  111, 123, 69, 192, 195, 228, 137, 30,
]);
const addressEncoder = getAddressEncoder();
const addressDecoder = getAddressDecoder();

type SolanaAddress = ReturnType<typeof address>;

// Mirrors the on-chain `ClaimKind` enum order: WinnerPayout=0, CreatorReward=1,
// VoterReward=2. Matches the API `ClaimKind` string union.
export type WorkerClaimKind =
  | "creator_reward"
  | "voter_reward"
  | "winner_payout";
const CLAIM_KIND_BYTE: Readonly<Record<WorkerClaimKind, number>> = {
  creator_reward: 1,
  voter_reward: 2,
  winner_payout: 0,
};

export interface ClaimRecordLike {
  amountLamports: number;
  kind: WorkerClaimKind;
  status: string;
  wallet: string;
}

export interface RecordClaimResult {
  kind: WorkerClaimKind;
  signature?: string;
  status: "already_recorded" | "recorded";
  wallet: string;
}

function u64Le(value: number) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}

async function derivePda({
  programId,
  seeds,
}: {
  programId: SolanaAddress;
  seeds: Parameters<typeof getProgramDerivedAddress>[0]["seeds"];
}) {
  const [pda] = await getProgramDerivedAddress({
    programAddress: programId,
    seeds,
  });
  return pda;
}

/// Build the authority-signed `record_claim` instruction that mirrors a single
/// off-chain-computed claimable amount on chain so the wallet can later pull it.
export async function createRecordClaimInstruction({
  amountLamports,
  authority,
  claimant,
  kind,
  programId,
  turnId,
}: {
  amountLamports: number;
  authority: SolanaAddress;
  claimant: SolanaAddress;
  kind: WorkerClaimKind;
  programId: SolanaAddress;
  turnId: number;
}): Promise<AuthorityInstruction> {
  const claimantBytes = addressEncoder.encode(claimant);
  const [globalConfig, turnState, claim] = await Promise.all([
    derivePda({ programId, seeds: ["global_config"] }),
    derivePda({ programId, seeds: ["turn", u64Le(turnId)] }),
    derivePda({
      programId,
      seeds: [
        "claim",
        u64Le(turnId),
        claimantBytes,
        Uint8Array.of(CLAIM_KIND_BYTE[kind]),
      ],
    }),
  ]);

  const data = new Uint8Array([
    ...RECORD_CLAIM_DISCRIMINATOR,
    ...u64Le(turnId),
    ...claimantBytes,
    CLAIM_KIND_BYTE[kind],
    ...u64Le(amountLamports),
  ]);

  return {
    accounts: [
      { address: authority, role: AccountRole.WRITABLE_SIGNER },
      { address: globalConfig, role: AccountRole.READONLY },
      { address: turnState, role: AccountRole.READONLY },
      { address: claim, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data,
    programAddress: programId,
  };
}

/// Only winner payouts remain SOL claims in the game program. Creator and voter
/// rewards are settled as tokens through Tokenomics Core.
export function selectRecordableClaims(records: readonly ClaimRecordLike[]) {
  return records.filter(
    (record) =>
      record.status === "available" && record.kind === "winner_payout",
  );
}

/// The on-chain `Claim` PDA uses `init`, so re-posting the same tuple fails with
/// an "already in use" allocation error. That is the idempotent success path.
export function isClaimAlreadyRecorded(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("already in use") ||
      error.message.includes("already been processed"))
  );
}

interface ClaimCreateTurnResponse {
  claims: { claims: ClaimRecordLike[] };
}

/// Ensure the API has computed the turn's claim records, then post a
/// `record_claim` for each available one using the authority keypair. Already
/// recorded claims are treated as success so retries are safe.
export async function recordClaimsForTurn({
  apiBaseUrl,
  config,
  fetchImpl = fetch,
  rpc,
  send = simulateAndSend,
  turnId,
}: {
  apiBaseUrl: string;
  config: TurnAutomationConfig;
  fetchImpl?: typeof fetch;
  rpc?: RpcClient;
  send?: typeof simulateAndSend;
  turnId: number;
}): Promise<RecordClaimResult[]> {
  if (!config.authorityKeypairBytes) {
    throw new Error(
      "Claim recording requires IDEALER_TURN_AUTHORITY_KEYPAIR or IDEALER_TURN_AUTHORITY_KEYPAIR_PATH.",
    );
  }

  const response = await fetchImpl(`${apiBaseUrl}/claim-records/create-turn`, {
    body: JSON.stringify({ turnId }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(
      `claim-records/create-turn returned HTTP ${response.status}.`,
    );
  }
  const payload = (await response.json()) as ClaimCreateTurnResponse;
  const recordable = selectRecordableClaims(payload.claims.claims);

  const authorityKeypairBytes = config.authorityKeypairBytes;
  const solanaRpc = rpc ?? createSolanaRpc(config.rpcUrl);
  const authority = addressDecoder.decode(authorityKeypairBytes.slice(32, 64));

  const results: RecordClaimResult[] = [];
  for (const record of recordable) {
    const instruction = await createRecordClaimInstruction({
      amountLamports: record.amountLamports,
      authority,
      claimant: address(record.wallet),
      kind: record.kind,
      programId: config.programId,
      turnId,
    });

    try {
      const signature = await send({
        authorityKeypairBytes,
        instruction,
        rpc: solanaRpc,
      });
      results.push({
        kind: record.kind,
        signature: signature.toString(),
        status: "recorded",
        wallet: record.wallet,
      });
    } catch (error) {
      if (isClaimAlreadyRecorded(error)) {
        results.push({
          kind: record.kind,
          status: "already_recorded",
          wallet: record.wallet,
        });
        continue;
      }
      throw error;
    }
  }

  return results;
}
