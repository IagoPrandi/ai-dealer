import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  createActiveRuleRewardSettlementConfig,
  inspectActiveRuleRewardSettlement,
  runActiveRuleRewardSettlementOnce,
  simulateActiveRuleRewardSettlement,
} from "./active-rule-reward-settlement.js";

const ROOT_ENV_PATH = resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
  ".env",
);
if (existsSync(ROOT_ENV_PATH)) {
  process.loadEnvFile(ROOT_ENV_PATH);
}

const BROADCAST =
  process.env.TYCHE_ACTIVE_RULE_REWARD_BROADCAST === "1";

function printable(value: unknown) {
  return JSON.stringify(
    value,
    (_key, item: unknown) => {
      if (typeof item === "bigint") {
        return item.toString();
      }
      if (item instanceof PublicKey) {
        return item.toBase58();
      }
      if (item instanceof Map) {
        return Object.fromEntries(
          [...item.entries()].map(([key, amount]) => [
            key,
            typeof amount === "bigint" ? amount.toString() : amount,
          ]),
        );
      }
      return item;
    },
    2,
  );
}

export async function runActiveRuleRewardOperator() {
  const config = await createActiveRuleRewardSettlementConfig();
  if (!config.tokenomicsProgramId) {
    throw new Error("TOKENOMICS_CORE_PROGRAM_ID is required.");
  }
  if (config.turnAllowlist.length === 0) {
    throw new Error(
      "Set TYCHE_ACTIVE_RULE_REWARD_TURN_ALLOWLIST to the reviewed turn IDs.",
    );
  }

  if (BROADCAST) {
    const result = await runActiveRuleRewardSettlementOnce({
      ...config,
      enabled: true,
    });
    console.log(printable(result));
    return;
  }

  const connection = new Connection(config.automation.rpcUrl, "finalized");
  const tycheProgramId = new PublicKey(
    config.automation.programId.toString(),
  );
  for (const turnId of config.turnAllowlist) {
    const inspection = await inspectActiveRuleRewardSettlement({
      apiBaseUrl: config.apiBaseUrl,
      connection,
      tycheProgramId,
      tokenomicsProgramId: config.tokenomicsProgramId,
      turnId,
    });
    if (
      inspection.action === "ready" &&
      config.automation.authorityKeypairBytes
    ) {
      const simulation = await simulateActiveRuleRewardSettlement({
        authority: Keypair.fromSecretKey(
          config.automation.authorityKeypairBytes,
        ),
        connection,
        tycheProgramId,
        plan: inspection.plan,
        tokenomicsProgramId: config.tokenomicsProgramId,
      });
      console.log(printable({ ...inspection, simulation }));
    } else {
      console.log(printable(inspection));
    }
  }
  console.log(
    "Dry run only. Review the exact turn, beneficiaries, amounts, reserve delta, and fee estimate before setting TYCHE_ACTIVE_RULE_REWARD_BROADCAST=1.",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void runActiveRuleRewardOperator().catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Active-rule reward inspection failed.",
    );
    process.exitCode = 1;
  });
}
