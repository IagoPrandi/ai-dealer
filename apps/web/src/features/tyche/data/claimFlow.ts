import { address } from "@solana/kit";

import { createClaimInstruction } from "../../../solana/tycheProgram";
import { postClaimComplete, postClaimRequest } from "./apiClient";
import {
  describeTxError,
  sendInstruction,
  txErrorCode,
  WALLET_APPROVAL_TIMEOUT_ERROR_CODE,
} from "./tx";
import type { ClaimRecordApi } from "./types";

export interface ClaimFlowDependencies {
  complete: typeof postClaimComplete;
  createInstruction: typeof createClaimInstruction;
  request: typeof postClaimRequest;
  send: typeof sendInstruction;
}

const defaultDependencies: ClaimFlowDependencies = {
  complete: postClaimComplete,
  createInstruction: createClaimInstruction,
  request: postClaimRequest,
  send: sendInstruction,
};

export async function claimRecordToWallet({
  client,
  dependencies = defaultDependencies,
  record,
  wallet,
  walletAddress,
}: {
  client: Parameters<typeof sendInstruction>[0];
  dependencies?: ClaimFlowDependencies;
  record: ClaimRecordApi;
  wallet: Parameters<typeof sendInstruction>[1];
  walletAddress: string;
}): Promise<string> {
  let approvalRecorded = false;
  let signature: string | null = null;
  try {
    await dependencies.request(record.claimId, walletAddress);
    approvalRecorded = true;
    const instruction = await dependencies.createInstruction({
      kind: record.kind,
      player: address(walletAddress),
      turnId: record.turnId,
    });
    signature = await dependencies.send(client, wallet, instruction);
    await dependencies.complete({
      claimId: record.claimId,
      signature,
      status: "claimed",
      wallet: walletAddress,
    });
    return signature;
  } catch (cause) {
    const timedOut =
      txErrorCode(cause) === WALLET_APPROVAL_TIMEOUT_ERROR_CODE;
    if (approvalRecorded && signature === null && !timedOut) {
      try {
        await dependencies.complete({
          claimId: record.claimId,
          failureReason: describeTxError(cause),
          status: "failed",
          wallet: walletAddress,
        });
      } catch (completionCause) {
        console.warn("Failed to persist the claim failure.", completionCause);
      }
    }
    throw cause;
  }
}
