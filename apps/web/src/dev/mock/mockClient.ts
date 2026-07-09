/**
 * Client Solana "falso" para a galeria de UI.
 *
 * Implementa apenas a superfície que as telas tocam no caminho de RENDER:
 *  - runtime.rpc.getAccountInfo  -> devolve bytes canned do GlobalConfig/TurnState
 *  - runtime.rpc.getBalance      -> devolve um saldo plausível para o cofre
 *
 * Os bytes seguem EXATAMENTE o layout lido por decodeGlobalConfigAccount /
 * decodeTurnStateAccount em idealerProgram.ts (discriminador de 8 bytes + campos
 * em little-endian). Ações de escrita (transaction/solTransfer) são stubs que
 * falham de forma clara — elas só rodam em cliques, nunca ao montar a tela.
 */
import { getProgramDerivedAddress } from "@solana/kit";

import {
  IDEALER_PROGRAM_ID,
  type ActiveTurnSnapshot,
} from "../../solana/idealerProgram";
import {
  MOCK_GLOBAL_CONFIG,
  MOCK_TURN_STATE,
} from "./mockData";

const PRIZE_VAULT_LAMPORTS = 20_500_000_000n;

function u64LeBytes(value: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}

/** Escritor que espelha createAccountReader: cursor começa após o discriminador. */
function createAccountWriter(length: number) {
  const data = new Uint8Array(length);
  const view = new DataView(data.buffer);
  let offset = 8; // 8 bytes de discriminador (lidos como zeros)
  return {
    data,
    skip(bytes: number) {
      offset += bytes;
    },
    u8(value: number) {
      view.setUint8(offset, value);
      offset += 1;
    },
    u16(value: number) {
      view.setUint16(offset, value, true);
      offset += 2;
    },
    u32(value: number) {
      view.setUint32(offset, value, true);
      offset += 4;
    },
    u64(value: bigint | number) {
      view.setBigUint64(offset, BigInt(value), true);
      offset += 8;
    },
    i64(value: bigint | number) {
      view.setBigInt64(offset, BigInt(value), true);
      offset += 8;
    },
  };
}

function encodeGlobalConfig(): Uint8Array {
  const w = createAccountWriter(254);
  w.skip(32); // authority
  w.u8(0); // pendingAuthority option = none
  w.skip(96); // 3 pubkeys
  w.u64(MOCK_GLOBAL_CONFIG.guessSubmissionFeeLamports);
  w.skip(8); // rule proposal fee
  w.u64(MOCK_GLOBAL_CONFIG.ruleRemovalFeeLamports);
  w.u64(MOCK_GLOBAL_CONFIG.voteFeeLamports);
  w.skip(2);
  w.skip(16);
  w.skip(1);
  w.u16(MOCK_GLOBAL_CONFIG.ruleElectionCutoffBps);
  w.u16(MOCK_GLOBAL_CONFIG.guessCutoffBps);
  w.skip(36);
  w.u64(MOCK_GLOBAL_CONFIG.nextTurnId);
  w.u64(MOCK_GLOBAL_CONFIG.activeTurnId);
  w.u8(MOCK_GLOBAL_CONFIG.hasActiveTurn ? 1 : 0);
  w.u8(MOCK_GLOBAL_CONFIG.paused ? 1 : 0);
  return w.data;
}

function encodeTurnState(): Uint8Array {
  const w = createAccountWriter(46);
  w.u64(MOCK_TURN_STATE.turnId);
  w.i64(MOCK_TURN_STATE.startTimestamp);
  w.i64(MOCK_TURN_STATE.endTimestamp);
  w.u8(MOCK_TURN_STATE.status === "open" ? 0 : 1);
  w.u64(0); // prize_pool_amount_lamports
  w.u32(MOCK_TURN_STATE.turnDurationSeconds);
  w.u8(0); // cycle_index
  return w.data;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  if (typeof btoa === "function") {
    return btoa(binary);
  }
  // Fallback para contextos sem btoa (SSR).
  return Buffer.from(bytes).toString("base64");
}

type AccountData = { owner: string; data: [string, string] };

let accountMapPromise: Promise<Map<string, AccountData>> | null = null;

async function getAccountMap(): Promise<Map<string, AccountData>> {
  if (!accountMapPromise) {
    accountMapPromise = (async () => {
      const owner = IDEALER_PROGRAM_ID.toString();
      const [globalConfigAddress] = await getProgramDerivedAddress({
        programAddress: IDEALER_PROGRAM_ID,
        seeds: ["global_config"],
      });
      const [turnStateAddress] = await getProgramDerivedAddress({
        programAddress: IDEALER_PROGRAM_ID,
        seeds: ["turn", u64LeBytes(MOCK_GLOBAL_CONFIG.activeTurnId)],
      });

      const map = new Map<string, AccountData>();
      map.set(globalConfigAddress.toString(), {
        owner,
        data: [toBase64(encodeGlobalConfig()), "base64"],
      });
      map.set(turnStateAddress.toString(), {
        owner,
        data: [toBase64(encodeTurnState()), "base64"],
      });
      return map;
    })();
  }
  return accountMapPromise;
}

function mockActionError(): Error {
  return new Error(
    "Ações on-chain estão desativadas na galeria de UI (modo mock).",
  );
}

export const mockSolanaClient = {
  runtime: {
    rpc: {
      getAccountInfo(account: { toString(): string }) {
        return {
          send: async () => {
            const map = await getAccountMap();
            const value = map.get(account.toString()) ?? null;
            return { value };
          },
        };
      },
      getBalance() {
        return {
          send: async () => ({ value: PRIZE_VAULT_LAMPORTS }),
        };
      },
      simulateTransaction() {
        return {
          send: async () => ({ value: { err: null, logs: [] } }),
        };
      },
    },
  },
  transaction: {
    async prepareAndSend() {
      throw mockActionError();
    },
  },
  solTransfer: {
    async prepareTransfer() {
      return {};
    },
    async sendPreparedTransfer() {
      throw mockActionError();
    },
  },
};

// Snapshot pronto, caso algum consumidor queira o objeto já montado.
export const MOCK_ACTIVE_TURN_SNAPSHOT: Pick<
  ActiveTurnSnapshot,
  "globalConfig" | "turnState"
> = {
  globalConfig: MOCK_GLOBAL_CONFIG,
  turnState: MOCK_TURN_STATE,
};
