import { readFile } from "node:fs/promises";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  getAddressDecoder,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";

const DEFAULT_DEVNET_RPC_URL = "https://api.devnet.solana.com";
const DEFAULT_IDEALER_PROGRAM_ID =
  "6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4";
const SYSTEM_PROGRAM_ID = address("11111111111111111111111111111111");
const OPEN_TURN_DISCRIMINATOR = new Uint8Array([
  78, 206, 19, 149, 237, 34, 191, 82,
]);
const CLOSE_TURN_DISCRIMINATOR = new Uint8Array([
  100, 243, 10, 218, 116, 61, 49, 153,
]);
const addressDecoder = getAddressDecoder();

type SolanaAddress = ReturnType<typeof address>;

export interface GlobalConfigSnapshot {
  activeTurnId: number;
  hasActiveTurn: boolean;
  nextTurnId: number;
  paused: boolean;
}

export interface TurnStateSnapshot {
  endTimestamp: number;
  status: "open" | "closed";
  turnId: number;
}

export interface TurnAutomationConfig {
  authorityKeypairBytes: null | Uint8Array;
  enabled: boolean;
  intervalMs: number;
  programId: SolanaAddress;
  rpcUrl: string;
}

export type TurnAutomationResult =
  | {
      action: "closed_turn" | "opened_turn";
      signature: string;
      turnId: number;
    }
  | {
      action:
        | "active_turn_not_expired"
        | "disabled"
        | "paused"
        | "turn_already_closed";
      turnId?: number;
    };

type AccountInfoResult = {
  value: null | {
    data: readonly [string, string] | string;
    owner: string;
  };
};

type RpcClient = ReturnType<typeof createSolanaRpc>;

function envFlag(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

function envNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function u64Le(value: number) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}

function u64LeArray(value: number) {
  return Array.from(u64Le(value));
}

function parseJsonKeypairBytes(raw: string) {
  const parsed = JSON.parse(raw) as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 64 ||
    !parsed.every(
      (value) => Number.isInteger(value) && value >= 0 && value <= 255,
    )
  ) {
    throw new Error(
      "Authority keypair must be a 64-byte Solana keypair JSON array.",
    );
  }

  return Uint8Array.from(parsed);
}

export async function loadAuthorityKeypairBytesFromEnv(env = process.env) {
  if (env.IDEALER_TURN_AUTHORITY_KEYPAIR) {
    return parseJsonKeypairBytes(env.IDEALER_TURN_AUTHORITY_KEYPAIR);
  }

  if (env.IDEALER_TURN_AUTHORITY_KEYPAIR_PATH) {
    const raw = await readFile(env.IDEALER_TURN_AUTHORITY_KEYPAIR_PATH, "utf8");
    return parseJsonKeypairBytes(raw);
  }

  return null;
}

export async function createTurnAutomationConfig(
  env = process.env,
): Promise<TurnAutomationConfig> {
  return {
    authorityKeypairBytes: await loadAuthorityKeypairBytesFromEnv(env),
    enabled: envFlag(env.IDEALER_TURN_AUTOMATION_ENABLED),
    intervalMs: envNumber(env.IDEALER_TURN_AUTOMATION_INTERVAL_MS, 30_000),
    programId: address(
      env.IDEALER_PROGRAM_ID ??
        env.NEXT_PUBLIC_IDEALER_PROGRAM_ID ??
        DEFAULT_IDEALER_PROGRAM_ID,
    ),
    rpcUrl:
      env.IDEALER_SOLANA_RPC_URL ??
      env.NEXT_PUBLIC_SOLANA_RPC_URL ??
      DEFAULT_DEVNET_RPC_URL,
  };
}

function getAccountDataBase64(
  account: AccountInfoResult["value"],
  expectedOwner: SolanaAddress,
) {
  if (!account) {
    throw new Error("Account was not found on devnet.");
  }

  if (account.owner !== expectedOwner.toString()) {
    throw new Error("Account owner does not match the Idealer program.");
  }

  if (Array.isArray(account.data) && typeof account.data[0] === "string") {
    return account.data[0];
  }

  if (typeof account.data === "string") {
    return account.data;
  }

  throw new Error("RPC account data was not base64 encoded.");
}

async function fetchProgramAccountData({
  account,
  programId,
  rpc,
}: {
  account: SolanaAddress;
  programId: SolanaAddress;
  rpc: RpcClient;
}) {
  const result = (await rpc
    .getAccountInfo(account, {
      commitment: "confirmed",
      encoding: "base64",
    })
    .send()) as AccountInfoResult;

  return Uint8Array.from(
    Buffer.from(getAccountDataBase64(result.value, programId), "base64"),
  );
}

function createAccountReader(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8;

  return {
    readBool() {
      return this.readU8() !== 0;
    },
    readI64Number() {
      const value = Number(view.getBigInt64(offset, true));
      offset += 8;
      return value;
    },
    readU8() {
      const value = view.getUint8(offset);
      offset += 1;
      return value;
    },
    readU16() {
      const value = view.getUint16(offset, true);
      offset += 2;
      return value;
    },
    readU64Number() {
      const value = Number(view.getBigUint64(offset, true));
      offset += 8;
      return value;
    },
    skip(bytes: number) {
      offset += bytes;
    },
  };
}

export function decodeGlobalConfigAccount(
  data: Uint8Array,
): GlobalConfigSnapshot {
  const reader = createAccountReader(data);
  reader.skip(32);
  const pendingAuthorityTag = reader.readU8();

  if (pendingAuthorityTag === 1) {
    reader.skip(32);
  } else if (pendingAuthorityTag !== 0) {
    throw new Error("GlobalConfig pending authority option is invalid.");
  }

  reader.skip(32 * 3);
  reader.skip(8 + 8 + 8);
  reader.skip(2);
  reader.skip(4 * 4);
  reader.skip(1);
  reader.readU16();
  reader.readU16();
  reader.skip(2 + 1 + 1 + 2 + 2 + 8 + 2 + 2 + 8 + 4 + 4);
  const nextTurnId = reader.readU64Number();
  const activeTurnId = reader.readU64Number();
  const hasActiveTurn = reader.readBool();
  const paused = reader.readBool();

  return {
    activeTurnId,
    hasActiveTurn,
    nextTurnId,
    paused,
  };
}

export function decodeTurnStateAccount(data: Uint8Array): TurnStateSnapshot {
  const reader = createAccountReader(data);
  const turnId = reader.readU64Number();
  reader.readI64Number();
  const endTimestamp = reader.readI64Number();
  const statusIndex = reader.readU8();

  if (statusIndex !== 0 && statusIndex !== 1) {
    throw new Error("TurnState status is invalid.");
  }

  return {
    endTimestamp,
    status: statusIndex === 0 ? "open" : "closed",
    turnId,
  };
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

async function getGlobalConfigPda(programId: SolanaAddress) {
  return derivePda({ programId, seeds: ["global_config"] });
}

async function getTurnStatePda({
  programId,
  turnId,
}: {
  programId: SolanaAddress;
  turnId: number;
}) {
  return derivePda({ programId, seeds: ["turn", u64Le(turnId)] });
}

async function getPrizeVaultPda({
  programId,
  turnId,
}: {
  programId: SolanaAddress;
  turnId: number;
}) {
  return derivePda({ programId, seeds: ["prize_vault", u64Le(turnId)] });
}

async function fetchGlobalConfig({
  programId,
  rpc,
}: {
  programId: SolanaAddress;
  rpc: RpcClient;
}) {
  const globalConfig = await getGlobalConfigPda(programId);
  const data = await fetchProgramAccountData({
    account: globalConfig,
    programId,
    rpc,
  });
  return {
    address: globalConfig,
    snapshot: decodeGlobalConfigAccount(data),
  };
}

async function fetchTurnState({
  programId,
  rpc,
  turnId,
}: {
  programId: SolanaAddress;
  rpc: RpcClient;
  turnId: number;
}) {
  const turnState = await getTurnStatePda({ programId, turnId });
  const data = await fetchProgramAccountData({
    account: turnState,
    programId,
    rpc,
  });
  return {
    address: turnState,
    snapshot: decodeTurnStateAccount(data),
  };
}

function createOpenTurnData(turnId: number) {
  return new Uint8Array([...OPEN_TURN_DISCRIMINATOR, ...u64LeArray(turnId)]);
}

async function createOpenTurnInstruction({
  authority,
  programId,
  turnId,
}: {
  authority: SolanaAddress;
  programId: SolanaAddress;
  turnId: number;
}) {
  const [globalConfig, turnState, prizeVault] = await Promise.all([
    getGlobalConfigPda(programId),
    getTurnStatePda({ programId, turnId }),
    getPrizeVaultPda({ programId, turnId }),
  ]);

  return {
    accounts: [
      { address: authority, role: AccountRole.WRITABLE_SIGNER },
      { address: globalConfig, role: AccountRole.WRITABLE },
      { address: turnState, role: AccountRole.WRITABLE },
      { address: prizeVault, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: createOpenTurnData(turnId),
    programAddress: programId,
  };
}

async function createCloseTurnInstruction({
  authority,
  programId,
  turnState,
}: {
  authority: SolanaAddress;
  programId: SolanaAddress;
  turnState: SolanaAddress;
}) {
  const globalConfig = await getGlobalConfigPda(programId);

  return {
    accounts: [
      { address: authority, role: AccountRole.READONLY_SIGNER },
      { address: globalConfig, role: AccountRole.WRITABLE },
      { address: turnState, role: AccountRole.WRITABLE },
    ],
    data: CLOSE_TURN_DISCRIMINATOR,
    programAddress: programId,
  };
}

async function simulateAndSend({
  authorityKeypairBytes,
  instruction,
  rpc,
}: {
  authorityKeypairBytes: Uint8Array;
  instruction: Awaited<ReturnType<typeof createOpenTurnInstruction>>;
  rpc: RpcClient;
}) {
  const authority = await createKeyPairSignerFromBytes(authorityKeypairBytes);
  const latestBlockhash = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const message = appendTransactionMessageInstructions(
    [instruction],
    setTransactionMessageLifetimeUsingBlockhash(
      latestBlockhash.value,
      setTransactionMessageFeePayerSigner(
        authority,
        createTransactionMessage({ version: 0 }),
      ),
    ),
  );

  const signedTransaction = await signTransactionMessageWithSigners(message);
  const wireTransaction = getBase64EncodedWireTransaction(signedTransaction);
  const simulation = await rpc
    .simulateTransaction(wireTransaction, {
      commitment: "confirmed",
      encoding: "base64",
      sigVerify: true,
    })
    .send();

  if (simulation.value.err) {
    throw new Error(
      `Turn automation transaction simulation failed: ${JSON.stringify(
        simulation.value.err,
      )}`,
    );
  }

  return rpc
    .sendTransaction(wireTransaction, {
      encoding: "base64",
      maxRetries: 3n,
      preflightCommitment: "confirmed",
      skipPreflight: false,
    })
    .send();
}

export async function runTurnAutomationOnce(
  config: TurnAutomationConfig,
): Promise<TurnAutomationResult> {
  if (!config.enabled) {
    return { action: "disabled" };
  }

  if (!config.authorityKeypairBytes) {
    throw new Error(
      "Turn automation is enabled but IDEALER_TURN_AUTHORITY_KEYPAIR or IDEALER_TURN_AUTHORITY_KEYPAIR_PATH is not set.",
    );
  }

  const rpc = createSolanaRpc(config.rpcUrl);
  const globalConfig = await fetchGlobalConfig({
    programId: config.programId,
    rpc,
  });

  if (globalConfig.snapshot.paused) {
    return { action: "paused" };
  }

  const authority = addressDecoder.decode(
    config.authorityKeypairBytes.slice(32, 64),
  );

  if (!globalConfig.snapshot.hasActiveTurn) {
    const turnId = globalConfig.snapshot.nextTurnId;
    const instruction = await createOpenTurnInstruction({
      authority,
      programId: config.programId,
      turnId,
    });
    const signature = await simulateAndSend({
      authorityKeypairBytes: config.authorityKeypairBytes,
      instruction,
      rpc,
    });
    return { action: "opened_turn", signature: signature.toString(), turnId };
  }

  const activeTurn = await fetchTurnState({
    programId: config.programId,
    rpc,
    turnId: globalConfig.snapshot.activeTurnId,
  });

  if (activeTurn.snapshot.status !== "open") {
    return {
      action: "turn_already_closed",
      turnId: activeTurn.snapshot.turnId,
    };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds < activeTurn.snapshot.endTimestamp) {
    return {
      action: "active_turn_not_expired",
      turnId: activeTurn.snapshot.turnId,
    };
  }

  const instruction = await createCloseTurnInstruction({
    authority,
    programId: config.programId,
    turnState: activeTurn.address,
  });
  const signature = await simulateAndSend({
    authorityKeypairBytes: config.authorityKeypairBytes,
    instruction,
    rpc,
  });
  return {
    action: "closed_turn",
    signature: signature.toString(),
    turnId: activeTurn.snapshot.turnId,
  };
}

export function startTurnAutomationLoop(config: TurnAutomationConfig) {
  if (!config.enabled) {
    return null;
  }

  let running = false;
  const logResult = (result: TurnAutomationResult) => {
    if (result.action === "closed_turn" || result.action === "opened_turn") {
      console.log(
        `turn automation ${result.action} turn=${result.turnId} signature=${result.signature}`,
      );
    }
  };

  const run = async () => {
    if (running) {
      return;
    }

    running = true;
    try {
      const result = await runTurnAutomationOnce(config);
      logResult(result);

      if (result.action === "closed_turn") {
        logResult(await runTurnAutomationOnce(config));
      }
    } catch (error) {
      console.error("turn automation failed", error);
    } finally {
      running = false;
    }
  };

  void run();
  return setInterval(() => {
    void run();
  }, config.intervalMs);
}
