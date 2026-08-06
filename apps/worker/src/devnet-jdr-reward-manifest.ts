import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  type AccountInfo,
} from "@solana/web3.js";
import {
  createTokenRewardSettlementConfig,
  decodeCampaignAccounts,
  decodeTokenRewardAction,
  deriveAssociatedTokenAddress,
  deriveCampaignRewardReceipt,
  runTokenRewardSettlementOnce,
  type ActionRewardKind,
} from "./token-reward-settlement.js";

const AUTHORIZED_MANIFEST_SHA256 =
  "18aba6cddb7bb3068f350f8ee4ae7f7b07cb56248796cdfee9c006025dd4090c";
const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const TYCHE_PROGRAM_DATA = "AWGUseV1DEsoSvdW7CDMxxBDUPQXAKqTXyxHVzeTnL8g";
const TYCHE_PROGRAM_SHA256 =
  "2ca0484a3fef56bfa9f5831022474f3cef839bc27db36758d83cb8f57bf012d1";
const TYCHE_PROGRAM_LENGTH = 1_023_336;
const SQUADS_VAULT = "DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp";
const BPF_UPGRADEABLE_LOADER = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);
const TOKEN_PROGRAM = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const PROGRAM_DATA_METADATA_LENGTH = 45;
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const MANIFEST_PATH = join(
  REPO_ROOT,
  "deployments",
  "solana-devnet-jdr-reward-manifest-2026-07-23.json",
);

interface ManifestAction {
  action: string;
  amountAtoms: string;
  beneficiary: string;
  beneficiaryAta: string;
  kind: ActionRewardKind;
  receipt: string;
}

interface RewardManifest {
  actions: ManifestAction[];
  campaign: string;
  campaignRemainingAtoms: string;
  campaignVault: string;
  cluster: string;
  commitment: string;
  estimatedPayerLamports: string;
  tycheProgram: string;
  mint: string;
  technicalFeePayer: string;
  tokenomicsCoreProgram: string;
  totalRewardAtoms: string;
}

interface StrictState {
  campaignDistributedAtoms: bigint;
  campaignRemainingAtoms: bigint;
  payerBalanceLamports: number;
  presentReceipts: Set<string>;
  slot: number;
  tokenBalances: Map<string, bigint>;
}

function assertCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function accountDiscriminator(name: string) {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

function loadManifest() {
  const bytes = readFileSync(MANIFEST_PATH);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assertCondition(
    sha256 === AUTHORIZED_MANIFEST_SHA256,
    `The JDR reward manifest hash changed: ${sha256}.`,
  );
  const manifest = JSON.parse(bytes.toString("utf8")) as RewardManifest;
  assertCondition(
    manifest.cluster === "devnet" &&
      manifest.commitment === "finalized" &&
      manifest.actions.length === 12,
    "The JDR reward manifest scope is invalid.",
  );
  const actionAddresses = manifest.actions.map(({ action }) => action);
  assertCondition(
    new Set(actionAddresses).size === actionAddresses.length,
    "The JDR reward manifest contains duplicate actions.",
  );
  const totalRewardAtoms = manifest.actions.reduce(
    (total, action) => total + BigInt(action.amountAtoms),
    0n,
  );
  assertCondition(
    totalRewardAtoms === BigInt(manifest.totalRewardAtoms),
    "The JDR reward manifest total is invalid.",
  );
  return { manifest, sha256, totalRewardAtoms };
}

function decodeReceipt(
  info: AccountInfo<Buffer>,
  action: ManifestAction,
  campaign: PublicKey,
  tokenomicsProgram: PublicKey,
) {
  const data = info.data;
  const expectedKind = action.kind === "proposal" ? 0 : 1;
  assertCondition(
    info.owner.equals(tokenomicsProgram) &&
      data.length >= 131 &&
      data
        .subarray(0, 8)
        .equals(accountDiscriminator("CampaignRewardReceipt")) &&
      new PublicKey(data.subarray(8, 40)).equals(campaign) &&
      new PublicKey(data.subarray(40, 72)).toBase58() === action.action &&
      new PublicKey(data.subarray(72, 104)).toBase58() === action.beneficiary &&
      data.readUInt8(104) === expectedKind &&
      data.readBigUInt64LE(105) === BigInt(action.amountAtoms) &&
      data.readBigUInt64LE(113) === BigInt(action.amountAtoms) &&
      data.readUInt8(121) === 0,
    `Reward receipt does not match manifest action ${action.action}.`,
  );
}

async function readStrictState(
  connection: Connection,
  manifest: RewardManifest,
): Promise<StrictState> {
  const tycheProgram = new PublicKey(manifest.tycheProgram);
  const tokenomicsProgram = new PublicKey(manifest.tokenomicsCoreProgram);
  const campaign = new PublicKey(manifest.campaign);
  const campaignVault = new PublicKey(manifest.campaignVault);
  const mint = new PublicKey(manifest.mint);
  const programData = new PublicKey(TYCHE_PROGRAM_DATA);
  const actionKeys = manifest.actions.map(
    ({ action }) => new PublicKey(action),
  );
  const receiptKeys = manifest.actions.map(
    ({ receipt }) => new PublicKey(receipt),
  );
  const ataAddresses = [
    ...new Set(manifest.actions.map(({ beneficiaryAta }) => beneficiaryAta)),
  ];
  const ataKeys = ataAddresses.map((address) => new PublicKey(address));

  const [genesisHash, base, inspected, payerBalanceLamports] =
    await Promise.all([
      connection.getGenesisHash(),
      connection.getMultipleAccountsInfoAndContext(
        [
          tycheProgram,
          programData,
          tokenomicsProgram,
          campaign,
          campaignVault,
          mint,
        ],
        { commitment: "finalized" },
      ),
      connection.getMultipleAccountsInfoAndContext(
        [...actionKeys, ...receiptKeys, ...ataKeys],
        { commitment: "finalized" },
      ),
      connection.getBalance(
        new PublicKey(manifest.technicalFeePayer),
        "finalized",
      ),
    ]);
  assertCondition(
    genesisHash === DEVNET_GENESIS_HASH,
    `The configured RPC is not Solana devnet: ${genesisHash}.`,
  );

  const [
    tycheInfo,
    programDataInfo,
    tokenomicsInfo,
    campaignInfo,
    campaignVaultInfo,
    mintInfo,
  ] = base.value;
  assertCondition(
    tycheInfo?.executable &&
      tycheInfo.owner.equals(BPF_UPGRADEABLE_LOADER) &&
      tycheInfo.data.length >= 36 &&
      tycheInfo.data.readUInt32LE(0) === 2 &&
      new PublicKey(tycheInfo.data.subarray(4, 36)).equals(programData),
    "The finalized Tyche program linkage is invalid.",
  );
  assertCondition(
    programDataInfo,
    "The finalized Tyche ProgramData account is missing.",
  );
  assertCondition(
    programDataInfo.owner.equals(BPF_UPGRADEABLE_LOADER) &&
      programDataInfo.data.length >= PROGRAM_DATA_METADATA_LENGTH &&
      programDataInfo.data.readUInt32LE(0) === 3 &&
      programDataInfo.data.readUInt8(12) === 1 &&
      new PublicKey(programDataInfo.data.subarray(13, 45)).toBase58() ===
        SQUADS_VAULT,
    "The finalized Tyche ProgramData authority is invalid.",
  );
  const programBytes = programDataInfo.data.subarray(
    PROGRAM_DATA_METADATA_LENGTH,
  );
  assertCondition(
    programBytes.length === TYCHE_PROGRAM_LENGTH &&
      createHash("sha256").update(programBytes).digest("hex") ===
        TYCHE_PROGRAM_SHA256,
    "The finalized Tyche program does not match the reviewed artifact.",
  );
  assertCondition(
    tokenomicsInfo?.executable &&
      tokenomicsInfo.owner.equals(BPF_UPGRADEABLE_LOADER),
    "The finalized Tokenomics Core program is invalid.",
  );
  assertCondition(campaignInfo, "The initial campaign account is missing.");
  assertCondition(
    campaignInfo.owner.equals(tokenomicsProgram),
    "The initial campaign account is missing or has the wrong owner.",
  );
  const campaignAccounts = decodeCampaignAccounts({
    campaign,
    data: campaignInfo.data,
    tokenomicsProgramId: tokenomicsProgram,
  });
  assertCondition(
    campaignAccounts.mint.equals(mint) &&
      campaignAccounts.campaignVault.equals(campaignVault),
    "The initial campaign account does not match the manifest.",
  );
  const campaignOriginalAtoms = campaignInfo.data.readBigUInt64LE(80);
  const campaignDistributedAtoms = campaignInfo.data.readBigUInt64LE(88);
  const campaignRemainingAtoms = campaignInfo.data.readBigUInt64LE(96);
  assertCondition(
    campaignOriginalAtoms === 200_000_000_000_000_000n,
    "The initial campaign allocation changed.",
  );
  assertCondition(
    campaignVaultInfo?.owner.equals(TOKEN_PROGRAM) &&
      new PublicKey(campaignVaultInfo.data.subarray(0, 32)).equals(mint) &&
      campaignVaultInfo.data.readBigUInt64LE(64) === campaignRemainingAtoms,
    "The campaign vault does not reconcile with campaign accounting.",
  );
  assertCondition(
    mintInfo?.owner.equals(TOKEN_PROGRAM) &&
      mintInfo.data.readUInt32LE(0) === 0 &&
      mintInfo.data.readBigUInt64LE(36) === 1_000_000_000_000_000_000n &&
      mintInfo.data.readUInt8(44) === 9 &&
      mintInfo.data.readUInt32LE(46) === 0,
    "The fixed-supply JDR mint invariant failed.",
  );

  const actionInfos = inspected.value.slice(0, manifest.actions.length);
  const receiptInfos = inspected.value.slice(
    manifest.actions.length,
    manifest.actions.length * 2,
  );
  const ataInfos = inspected.value.slice(manifest.actions.length * 2);
  const presentReceipts = new Set<string>();
  for (let index = 0; index < manifest.actions.length; index += 1) {
    const action = manifest.actions[index]!;
    const actionKey = actionKeys[index]!;
    const actionInfo = actionInfos[index];
    assertCondition(
      actionInfo,
      `Manifest action is missing: ${action.action}.`,
    );
    assertCondition(
      actionInfo.owner.equals(tycheProgram),
      `Manifest action is missing or has the wrong owner: ${action.action}.`,
    );
    const decoded = decodeTokenRewardAction({
      action: actionKey,
      data: actionInfo.data,
      kind: action.kind,
    });
    assertCondition(
      decoded.beneficiary.toBase58() === action.beneficiary &&
        deriveAssociatedTokenAddress({
          mint,
          owner: decoded.beneficiary,
        }).toBase58() === action.beneficiaryAta &&
        deriveCampaignRewardReceipt({
          action: actionKey,
          campaign,
          tokenomicsProgramId: tokenomicsProgram,
        }).toBase58() === action.receipt,
      `Manifest derivation mismatch for action ${action.action}.`,
    );
    const receiptInfo = receiptInfos[index];
    if (receiptInfo) {
      decodeReceipt(receiptInfo, action, campaign, tokenomicsProgram);
      presentReceipts.add(action.receipt);
    }
  }

  const paidManifestAtoms = manifest.actions.reduce(
    (total, action) =>
      total +
      (presentReceipts.has(action.receipt) ? BigInt(action.amountAtoms) : 0n),
    0n,
  );
  assertCondition(
    campaignDistributedAtoms === 60_000_000n + paidManifestAtoms &&
      campaignRemainingAtoms ===
        BigInt(manifest.campaignRemainingAtoms) - paidManifestAtoms,
    "Campaign accounting does not match the authorized manifest receipts.",
  );

  const tokenBalances = new Map<string, bigint>();
  for (let index = 0; index < ataAddresses.length; index += 1) {
    const address = ataAddresses[index]!;
    const info = ataInfos[index];
    if (!info) {
      tokenBalances.set(address, 0n);
      continue;
    }
    assertCondition(
      info.owner.equals(TOKEN_PROGRAM) &&
        new PublicKey(info.data.subarray(0, 32)).equals(mint),
      `Beneficiary ATA is invalid: ${address}.`,
    );
    tokenBalances.set(address, info.data.readBigUInt64LE(64));
  }

  return {
    campaignDistributedAtoms,
    campaignRemainingAtoms,
    payerBalanceLamports,
    presentReceipts,
    slot: Math.min(base.context.slot, inspected.context.slot),
    tokenBalances,
  };
}

async function discoverManifestTransactions(
  connection: Connection,
  manifest: RewardManifest,
) {
  const signatureInfos = await connection.getSignaturesForAddress(
    new PublicKey(manifest.campaign),
    { limit: 20 },
    "finalized",
  );
  const transactionsByReceipt = new Map<
    string,
    {
      payerCostLamports: number;
      signature: string;
      transactionFeeLamports: number;
    }
  >();
  for (const { signature } of signatureInfos) {
    let transaction = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        transaction = await connection.getParsedTransaction(signature, {
          commitment: "finalized",
          maxSupportedTransactionVersion: 0,
        });
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          !message.includes("429") &&
          !message.includes("Too many requests")
        ) {
          throw error;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 1_000 * 2 ** attempt),
        );
      }
    }
    if (!transaction?.meta || transaction.meta.err || !signature) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      continue;
    }
    const accountAddresses = new Set(
      transaction.transaction.message.accountKeys.map(({ pubkey }) =>
        pubkey.toBase58(),
      ),
    );
    for (const { receipt } of manifest.actions) {
      if (accountAddresses.has(receipt)) {
        transactionsByReceipt.set(receipt, {
          payerCostLamports:
            transaction.meta.preBalances[0]! -
            transaction.meta.postBalances[0]!,
          signature,
          transactionFeeLamports: transaction.meta.fee,
        });
      }
    }
    if (transactionsByReceipt.size === manifest.actions.length) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  assertCondition(
    transactionsByReceipt.size === manifest.actions.length,
    `Only ${transactionsByReceipt.size} of ${manifest.actions.length} manifest transactions were found.`,
  );
  return manifest.actions.map(
    ({ receipt }) => transactionsByReceipt.get(receipt)!,
  );
}

async function main() {
  const envPath = join(REPO_ROOT, ".env");
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath);
  }
  const { manifest, sha256, totalRewardAtoms } = loadManifest();
  const rpcUrl =
    process.env.TYCHE_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "finalized");
  const pre = await readStrictState(connection, manifest);
  const unsettled = manifest.actions.filter(
    ({ receipt }) => !pre.presentReceipts.has(receipt),
  );
  const unsettledAtoms = unsettled.reduce(
    (total, action) => total + BigInt(action.amountAtoms),
    0n,
  );
  assertCondition(
    pre.payerBalanceLamports >= Number(manifest.estimatedPayerLamports),
    "The technical fee payer is underfunded for the estimated batch cost.",
  );

  if (process.env.TYCHE_JDR_REWARD_MANIFEST_BROADCAST !== "1") {
    console.log(
      JSON.stringify({
        action: "dry_run",
        campaignRemainingAtoms: pre.campaignRemainingAtoms.toString(),
        finalizedSlot: pre.slot,
        manifestSha256: sha256,
        payerBalanceLamports: pre.payerBalanceLamports,
        receiptsPresent: pre.presentReceipts.size,
        totalActions: manifest.actions.length,
        totalRewardAtoms: totalRewardAtoms.toString(),
        unsettledActions: unsettled.length,
        unsettledAtoms: unsettledAtoms.toString(),
      }),
    );
    return;
  }

  assertCondition(
    process.env.TYCHE_JDR_REWARD_MANIFEST_AUTHORIZED_SHA256 === sha256,
    "Broadcast requires the exact authorized JDR reward manifest SHA-256.",
  );
  const allowlist = manifest.actions.map(({ action }) => action).join(",");
  const config = await createTokenRewardSettlementConfig({
    ...process.env,
    TYCHE_TOKEN_REWARD_ACTION_ALLOWLIST: allowlist,
    TYCHE_TOKEN_REWARD_MAX_PER_PASS: String(manifest.actions.length),
    TYCHE_TOKEN_REWARD_SETTLEMENT_ENABLED: "true",
    TOKENOMICS_CORE_PROGRAM_ID: manifest.tokenomicsCoreProgram,
  });
  assertCondition(
    config.actionAllowlist?.map((address) => address.toBase58()).join(",") ===
      allowlist,
    "Worker action allowlist does not match the authorized manifest.",
  );
  assertCondition(
    config.automation.authorityKeypairBytes,
    "The technical fee payer keypair is unavailable.",
  );
  const authority = Keypair.fromSecretKey(
    config.automation.authorityKeypairBytes,
  );
  assertCondition(
    authority.publicKey.toBase58() === manifest.technicalFeePayer,
    "The loaded authority is not the authorized technical fee payer.",
  );

  await runTokenRewardSettlementOnce(config);
  const post = await readStrictState(connection, manifest);
  assertCondition(
    post.presentReceipts.size === manifest.actions.length,
    "The authorized manifest did not finalize all canonical receipts.",
  );
  assertCondition(
    pre.campaignRemainingAtoms - post.campaignRemainingAtoms === unsettledAtoms,
    "Campaign remaining-balance delta does not match this run.",
  );
  assertCondition(
    post.campaignDistributedAtoms - pre.campaignDistributedAtoms ===
      unsettledAtoms,
    "Campaign distributed-balance delta does not match this run.",
  );
  for (const beneficiaryAta of new Set(
    unsettled.map(({ beneficiaryAta }) => beneficiaryAta),
  )) {
    const expectedDelta = unsettled
      .filter((action) => action.beneficiaryAta === beneficiaryAta)
      .reduce((total, action) => total + BigInt(action.amountAtoms), 0n);
    assertCondition(
      post.tokenBalances.get(beneficiaryAta)! -
        pre.tokenBalances.get(beneficiaryAta)! ===
        expectedDelta,
      `Beneficiary ATA delta is invalid: ${beneficiaryAta}.`,
    );
  }

  const finalizedTransactions = await discoverManifestTransactions(
    connection,
    manifest,
  );
  const signatures = finalizedTransactions.map(({ signature }) => signature);
  const transactionFeesLamports = finalizedTransactions.reduce(
    (total, transaction) => total + transaction.transactionFeeLamports,
    0,
  );
  const payerCostLamports = finalizedTransactions.reduce(
    (total, transaction) => total + transaction.payerCostLamports,
    0,
  );
  const replay = await runTokenRewardSettlementOnce(config);
  assertCondition(
    replay.action === "nothing_to_settle",
    "The authorized manifest replay was not an idempotent no-op.",
  );

  console.log(
    JSON.stringify({
      action: "broadcast_finalized",
      campaignDistributedAtoms: post.campaignDistributedAtoms.toString(),
      campaignRemainingAtoms: post.campaignRemainingAtoms.toString(),
      finalizedSlot: post.slot,
      manifestSha256: sha256,
      payerCostLamports,
      receipts: post.presentReceipts.size,
      replay: replay.action,
      signatures,
      tokenDeltas: Object.fromEntries(
        [...post.tokenBalances].map(([address, balance]) => [
          address,
          (balance - (pre.tokenBalances.get(address) ?? 0n)).toString(),
        ]),
      ),
      transactionFeesLamports,
      unsettledAtoms: unsettledAtoms.toString(),
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exitCode = 1;
});
