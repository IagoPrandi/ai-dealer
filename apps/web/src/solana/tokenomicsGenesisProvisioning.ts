"use client";

import { createWalletTransactionSigner } from "@solana/client";
import type { useSolanaClient, useWalletConnection } from "@solana/react-hooks";
import {
  AccountRole,
  address,
  generateKeyPairSigner,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  type KeyPairSigner,
} from "@solana/kit";
import { Connection, PublicKey } from "@solana/web3.js";

import { IDEALER_PROGRAM_ID, SYSTEM_PROGRAM_ID } from "./idealerProgram";
import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import { verifyExpectedDevnetMultisig } from "./squadsProvisioning";
import {
  BPF_UPGRADEABLE_LOADER_ID,
  CLASSIC_SPL_TOKEN_PROGRAM_ID,
  INITIAL_CAMPAIGN_CONFIG_HASH,
  INITIAL_UNUSED_BALANCE_POLICY_HASH,
  TOKEN_METADATA_PROGRAM_ID,
  TOKENOMICS_GENESIS_CONFIG,
  tokenomicsProgramAddress,
  validateTokenomicsGenesisConfig,
  validateTokenomicsGenesisSnapshot,
} from "./tokenomicsGenesisConfig";

type SolanaClient = ReturnType<typeof useSolanaClient>;
type WalletConnection = ReturnType<typeof useWalletConnection>;
type ConnectedWallet = NonNullable<WalletConnection["wallet"]>;
type ConfirmableTransaction = Parameters<
  SolanaClient["actions"]["sendTransaction"]
>[0];
type KitInstruction = Parameters<
  SolanaClient["transaction"]["prepare"]
>[0]["instructions"][number];

const INITIALIZE_GENESIS_DISCRIMINATOR = Uint8Array.from([
  17, 205, 102, 29, 35, 92, 43, 84,
]);
const COMPUTE_BUDGET_PROGRAM_ID = address(
  "ComputeBudget111111111111111111111111111111",
);
const RENT_SYSVAR_ID = address("SysvarRent111111111111111111111111111111111");
const TOKEN_PROGRAM_ID = address(CLASSIC_SPL_TOKEN_PROGRAM_ID);
const METADATA_PROGRAM_ID = address(TOKEN_METADATA_PROGRAM_ID);
const UPGRADEABLE_LOADER_ID = new PublicKey(BPF_UPGRADEABLE_LOADER_ID);
const ADDRESS_ENCODER = getAddressEncoder();
const TEXT_ENCODER = new TextEncoder();

// Anchor account sizes plus the canonical Metaplex metadata allocation.
const GENESIS_ACCOUNT_SIZES = Object.freeze([
  723, // TokenConfig
  57, // TreasuryPolicyExecutor
  82, // SPL mint
  165, // Creator Treasury Reserve Vault
  165, // Treasury Lock Escrow
  165, // Initial Campaign Reserve Vault
  171, // CampaignReserve
  194, // treasury LockPosition
  25, // DistributionVaultRecord
  17, // TreasurySolVaultRecord
  33, // CorrectionReserveVaultRecord
  679, // Metaplex Metadata
]);

export interface TokenomicsGenesisAddresses {
  campaign: string;
  campaignVault: string;
  correctionReserveVault: string;
  distributionVault: string;
  executor: string;
  gameAuthority: string;
  metadata: string;
  mint: string;
  tokenConfig: string;
  treasuryEscrow: string;
  treasuryPosition: string;
  treasuryReserve: string;
  treasurySolVault: string;
}

export interface TokenomicsGenesisSummary {
  addresses: TokenomicsGenesisAddresses;
  estimatedRentLamports: bigint;
  metadataUri: string;
  payerBalanceLamports: bigint;
  programDataAddress: string;
  programId: string;
  programUpgradeAuthority: string;
}

export interface PreparedTokenomicsGenesis {
  instructions: readonly KitInstruction[];
  mintSigner: KeyPairSigner;
  rpcEndpoint: string;
  summary: TokenomicsGenesisSummary;
}

export interface TokenomicsGenesisResult extends TokenomicsGenesisSummary {
  signature: string;
}

function u32Le(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function u64Le(value: bigint) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

function concatBytes(...values: readonly Uint8Array[]) {
  const output = new Uint8Array(
    values.reduce((length, value) => length + value.length, 0),
  );
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

function borshString(value: string) {
  const bytes = TEXT_ENCODER.encode(value);
  return concatBytes(u32Le(bytes.length), bytes);
}

function hexBytes(value: string) {
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error("A genesis commitment hash is invalid.");
  }
  return Uint8Array.from(value.match(/../g)!, (pair) =>
    Number.parseInt(pair, 16),
  );
}

export function encodeInitializeGenesisInstructionData({
  epochRootPublisher,
  gameAuthority,
  governance,
  guardian,
  metadataUri,
}: {
  epochRootPublisher: string;
  gameAuthority: string;
  governance: string;
  guardian: string;
  metadataUri: string;
}) {
  return concatBytes(
    INITIALIZE_GENESIS_DISCRIMINATOR,
    new Uint8Array(ADDRESS_ENCODER.encode(address(governance))),
    new Uint8Array(ADDRESS_ENCODER.encode(address(guardian))),
    new Uint8Array(ADDRESS_ENCODER.encode(address(gameAuthority))),
    new Uint8Array(ADDRESS_ENCODER.encode(address(epochRootPublisher))),
    borshString(TOKENOMICS_GENESIS_CONFIG.network),
    borshString(metadataUri),
    hexBytes(INITIAL_CAMPAIGN_CONFIG_HASH),
    hexBytes(INITIAL_UNUSED_BALANCE_POLICY_HASH),
  );
}

async function pda(
  programAddress: ReturnType<typeof address>,
  seeds: Parameters<typeof getProgramDerivedAddress>[0]["seeds"],
) {
  return (
    await getProgramDerivedAddress({
      programAddress,
      seeds,
    })
  )[0].toString();
}

export async function deriveTokenomicsGenesisAddresses(
  mint: string,
): Promise<TokenomicsGenesisAddresses> {
  const coreProgram = tokenomicsProgramAddress();
  const mintBytes = ADDRESS_ENCODER.encode(address(mint));
  const governanceBytes = ADDRESS_ENCODER.encode(
    address(TOKENOMICS_GENESIS_CONFIG.governance),
  );
  const campaignId = u64Le(0n);
  const metadataProgramBytes = ADDRESS_ENCODER.encode(METADATA_PROGRAM_ID);

  const [
    campaign,
    campaignVault,
    correctionReserveVault,
    distributionVault,
    executor,
    gameAuthority,
    metadata,
    tokenConfig,
    treasuryEscrow,
    treasuryPosition,
    treasuryReserve,
    treasurySolVault,
  ] = await Promise.all([
    pda(coreProgram, ["campaign", campaignId]),
    pda(coreProgram, ["campaign_vault", campaignId]),
    pda(coreProgram, ["correction_reserve_vault"]),
    pda(coreProgram, ["distribution_vault"]),
    pda(coreProgram, ["treasury_policy_executor"]),
    pda(IDEALER_PROGRAM_ID, ["global_config"]),
    pda(METADATA_PROGRAM_ID, ["metadata", metadataProgramBytes, mintBytes]),
    pda(coreProgram, ["token_config"]),
    pda(coreProgram, ["treasury_lock_escrow"]),
    pda(coreProgram, ["lock_position", governanceBytes]),
    pda(coreProgram, ["creator_treasury_reserve_vault"]),
    pda(coreProgram, ["treasury_sol_vault"]),
  ]);

  return {
    campaign,
    campaignVault,
    correctionReserveVault,
    distributionVault,
    executor,
    gameAuthority,
    metadata,
    mint,
    tokenConfig,
    treasuryEscrow,
    treasuryPosition,
    treasuryReserve,
    treasurySolVault,
  };
}

function computeUnitLimitInstruction(): KitInstruction {
  return {
    accounts: [],
    data: concatBytes(Uint8Array.of(2), u32Le(1_000_000)),
    programAddress: COMPUTE_BUDGET_PROGRAM_ID,
  };
}

function initializeGenesisInstruction(
  payer: string,
  mintSigner: KeyPairSigner,
  addresses: TokenomicsGenesisAddresses,
): KitInstruction {
  const mintAccount = {
    address: mintSigner.address,
    role: AccountRole.WRITABLE_SIGNER,
    signer: mintSigner,
  } as const;

  return {
    accounts: [
      { address: address(payer), role: AccountRole.WRITABLE_SIGNER },
      { address: address(addresses.tokenConfig), role: AccountRole.WRITABLE },
      { address: address(addresses.executor), role: AccountRole.WRITABLE },
      mintAccount,
      { address: address(addresses.metadata), role: AccountRole.WRITABLE },
      {
        address: address(TOKENOMICS_GENESIS_CONFIG.governance),
        role: AccountRole.READONLY,
      },
      {
        address: address(addresses.treasuryReserve),
        role: AccountRole.WRITABLE,
      },
      {
        address: address(addresses.treasuryEscrow),
        role: AccountRole.WRITABLE,
      },
      { address: address(addresses.campaignVault), role: AccountRole.WRITABLE },
      { address: address(addresses.campaign), role: AccountRole.WRITABLE },
      {
        address: address(addresses.treasuryPosition),
        role: AccountRole.WRITABLE,
      },
      {
        address: address(addresses.distributionVault),
        role: AccountRole.WRITABLE,
      },
      {
        address: address(addresses.treasurySolVault),
        role: AccountRole.WRITABLE,
      },
      {
        address: address(addresses.correctionReserveVault),
        role: AccountRole.WRITABLE,
      },
      { address: METADATA_PROGRAM_ID, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
      { address: RENT_SYSVAR_ID, role: AccountRole.READONLY },
    ],
    data: encodeInitializeGenesisInstructionData({
      epochRootPublisher: TOKENOMICS_GENESIS_CONFIG.epochRootPublisher,
      gameAuthority: addresses.gameAuthority,
      governance: TOKENOMICS_GENESIS_CONFIG.governance,
      guardian: TOKENOMICS_GENESIS_CONFIG.guardian,
      metadataUri: TOKENOMICS_GENESIS_CONFIG.metadataUri,
    }),
    programAddress: tokenomicsProgramAddress(),
  };
}

function decodeUpgradeableProgram(
  programData: Buffer,
  expectedProgramDataAddress: PublicKey,
) {
  if (programData.length < 36 || programData.readUInt32LE(0) !== 2) {
    throw new Error("Tokenomics Core is not an upgradeable program account.");
  }
  const programDataAddress = new PublicKey(programData.subarray(4, 36));
  if (!programDataAddress.equals(expectedProgramDataAddress)) {
    throw new Error(
      "The Tokenomics Core ProgramData address changed during review.",
    );
  }
}

function decodeProgramDataAuthority(data: Buffer) {
  if (data.length < 13 || data.readUInt32LE(0) !== 3) {
    throw new Error("Tokenomics Core has an invalid ProgramData account.");
  }
  const authorityOption = data.readUInt8(12);
  if (authorityOption === 0) {
    return null;
  }
  if (authorityOption !== 1 || data.length < 45) {
    throw new Error("Tokenomics Core has an invalid upgrade authority option.");
  }
  return new PublicKey(data.subarray(13, 45)).toBase58();
}

async function assertProgramAndAuthority(connection: Connection) {
  const program = new PublicKey(TOKENOMICS_GENESIS_CONFIG.programId);
  const programInfo = await connection.getAccountInfo(program, "confirmed");
  if (!programInfo || !programInfo.executable) {
    throw new Error(
      "Tokenomics Core is not deployed as an executable devnet program.",
    );
  }
  if (!programInfo.owner.equals(UPGRADEABLE_LOADER_ID)) {
    throw new Error("Tokenomics Core is not owned by the upgradeable loader.");
  }
  if (programInfo.data.length < 36 || programInfo.data.readUInt32LE(0) !== 2) {
    throw new Error("Tokenomics Core has an invalid program account.");
  }
  const programDataAddress = new PublicKey(programInfo.data.subarray(4, 36));
  decodeUpgradeableProgram(programInfo.data, programDataAddress);
  const programDataInfo = await connection.getAccountInfo(
    programDataAddress,
    "confirmed",
  );
  if (
    !programDataInfo ||
    !programDataInfo.owner.equals(UPGRADEABLE_LOADER_ID)
  ) {
    throw new Error("Tokenomics Core ProgramData could not be verified.");
  }
  const upgradeAuthority = decodeProgramDataAuthority(programDataInfo.data);
  if (upgradeAuthority !== TOKENOMICS_GENESIS_CONFIG.governance) {
    throw new Error(
      "Tokenomics Core upgrade authority is not controlled by the configured Squads vault.",
    );
  }
  return {
    programDataAddress: programDataAddress.toBase58(),
    upgradeAuthority,
  };
}

async function assertGenesisAccountsAvailable(
  connection: Connection,
  addresses: TokenomicsGenesisAddresses,
) {
  const expectedEmpty = [
    addresses.tokenConfig,
    addresses.executor,
    addresses.metadata,
    addresses.treasuryReserve,
    addresses.treasuryEscrow,
    addresses.campaignVault,
    addresses.campaign,
    addresses.treasuryPosition,
    addresses.distributionVault,
    addresses.treasurySolVault,
    addresses.correctionReserveVault,
  ].map((value) => new PublicKey(value));
  const [accounts, gameAuthorityInfo] = await Promise.all([
    connection.getMultipleAccountsInfo(expectedEmpty, "confirmed"),
    connection.getAccountInfo(
      new PublicKey(addresses.gameAuthority),
      "confirmed",
    ),
  ]);

  const occupiedIndex = accounts.findIndex(
    (accountInfo) => accountInfo !== null,
  );
  if (occupiedIndex >= 0) {
    throw new Error(
      `Genesis was blocked because ${expectedEmpty[occupiedIndex]!.toBase58()} already exists.`,
    );
  }
  if (
    !gameAuthorityInfo ||
    !gameAuthorityInfo.owner.equals(new PublicKey(IDEALER_PROGRAM_ID))
  ) {
    throw new Error(
      "The configured Idealer GlobalConfig game authority is missing or has the wrong owner.",
    );
  }
}

function isPhantomWalletA(wallet: ConnectedWallet) {
  return (
    wallet.account.address.toString() ===
      TOKENOMICS_GENESIS_CONFIG.genesisPayer &&
    wallet.connector.name.toLowerCase().includes("phantom")
  );
}

export async function prepareTokenomicsGenesis({
  payerAddress,
  rpcEndpoint,
}: {
  payerAddress: string;
  rpcEndpoint: string;
}): Promise<PreparedTokenomicsGenesis> {
  const configErrors = validateTokenomicsGenesisConfig();
  if (configErrors.length > 0) {
    throw new Error(configErrors.join(" "));
  }
  if (payerAddress !== TOKENOMICS_GENESIS_CONFIG.genesisPayer) {
    throw new Error("Only devnet wallet A can pay for the genesis rehearsal.");
  }

  const connection = new Connection(rpcEndpoint, "confirmed");
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== SQUADS_DEVNET_CONFIG.genesisHash) {
    throw new Error(
      "The configured RPC is not Solana devnet. Genesis was blocked.",
    );
  }

  await verifyExpectedDevnetMultisig({ rpcEndpoint });
  const program = await assertProgramAndAuthority(connection);
  const mintSigner = await generateKeyPairSigner();
  const addresses = await deriveTokenomicsGenesisAddresses(
    mintSigner.address.toString(),
  );
  await assertGenesisAccountsAvailable(connection, addresses);

  const [estimatedRents, payerBalance] = await Promise.all([
    Promise.all(
      GENESIS_ACCOUNT_SIZES.map((size) =>
        connection.getMinimumBalanceForRentExemption(size, "confirmed"),
      ),
    ),
    connection.getBalance(new PublicKey(payerAddress), "confirmed"),
  ]);
  const estimatedRentLamports = estimatedRents.reduce(
    (total, value) => total + BigInt(value),
    0n,
  );
  if (BigInt(payerBalance) < estimatedRentLamports + 100_000n) {
    throw new Error(
      "Wallet A does not have enough devnet SOL for estimated rent and fees.",
    );
  }

  return {
    instructions: [
      computeUnitLimitInstruction(),
      initializeGenesisInstruction(payerAddress, mintSigner, addresses),
    ],
    mintSigner,
    rpcEndpoint,
    summary: {
      addresses,
      estimatedRentLamports,
      metadataUri: TOKENOMICS_GENESIS_CONFIG.metadataUri,
      payerBalanceLamports: BigInt(payerBalance),
      programDataAddress: program.programDataAddress,
      programId: TOKENOMICS_GENESIS_CONFIG.programId,
      programUpgradeAuthority: program.upgradeAuthority,
    },
  };
}

function readAddress(data: Buffer, offset: number) {
  return new PublicKey(data.subarray(offset, offset + 32)).toBase58();
}

function readU64(data: Buffer, offset: number) {
  return data.readBigUInt64LE(offset);
}

function readString(data: Buffer, offset: number) {
  const length = data.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + length;
  if (end > data.length) {
    throw new Error("An on-chain string exceeds its account data.");
  }
  return {
    nextOffset: end,
    value: data.subarray(start, end).toString("utf8"),
  };
}

function decodeMint(data: Buffer) {
  if (data.length !== 82) {
    throw new Error("The finalized JDR mint has an invalid data length.");
  }
  const mintAuthorityOption = data.readUInt32LE(0);
  const freezeAuthorityOption = data.readUInt32LE(46);
  return {
    decimals: data.readUInt8(44),
    freezeAuthority: freezeAuthorityOption === 0 ? null : readAddress(data, 50),
    mintAuthority: mintAuthorityOption === 0 ? null : readAddress(data, 4),
    supply: readU64(data, 36),
  };
}

function decodeTokenAccount(data: Buffer) {
  if (data.length !== 165) {
    throw new Error(
      "A finalized JDR token account has an invalid data length.",
    );
  }
  return {
    amount: readU64(data, 64),
    mint: readAddress(data, 0),
    owner: readAddress(data, 32),
  };
}

function decodeTokenConfig(data: Buffer) {
  let offset = 8;
  const governance = readAddress(data, offset);
  offset += 32;
  const guardian = readAddress(data, offset);
  offset += 32;
  const gameAuthority = readAddress(data, offset);
  offset += 32;
  const publisher = readAddress(data, offset);
  offset += 32;
  const mint = readAddress(data, offset);
  offset += 32;
  const metadata = readAddress(data, offset);
  offset += 32;
  const metadataUpdateAuthority = readAddress(data, offset);
  offset += 32;
  const metadataUri = readString(data, offset);
  offset = metadataUri.nextOffset;
  const metadataMutable = data.readUInt8(offset) !== 0;
  offset += 1;
  const treasuryReserve = readAddress(data, offset);
  offset += 32;
  const treasuryEscrow = readAddress(data, offset);

  return {
    gameAuthority,
    governance,
    guardian,
    metadata,
    metadataMutable,
    metadataUpdateAuthority,
    metadataUri: metadataUri.value,
    mint,
    publisher,
    treasuryEscrow,
    treasuryReserve,
  };
}

function decodeTreasuryPosition(data: Buffer) {
  return {
    beneficialOwner: readAddress(data, 8),
    lockedAtoms: readU64(data, 168),
    mint: readAddress(data, 136),
    returnAccount: readAddress(data, 72),
    unlockAuthority: readAddress(data, 40),
  };
}

function decodeMetadata(data: Buffer) {
  let offset = 1;
  const updateAuthority = readAddress(data, offset);
  offset += 32;
  const mint = readAddress(data, offset);
  offset += 32;
  const name = readString(data, offset);
  offset = name.nextOffset;
  const symbol = readString(data, offset);
  offset = symbol.nextOffset;
  const uri = readString(data, offset);
  offset = uri.nextOffset;
  const sellerFeeBasisPoints = data.readUInt16LE(offset);
  return {
    mint,
    name: name.value.replace(/\0+$/, ""),
    sellerFeeBasisPoints,
    symbol: symbol.value.replace(/\0+$/, ""),
    updateAuthority,
    uri: uri.value.replace(/\0+$/, ""),
  };
}

async function verifyFinalizedGenesis(prepared: PreparedTokenomicsGenesis) {
  const connection = new Connection(prepared.rpcEndpoint, "finalized");
  const a = prepared.summary.addresses;
  const accountAddresses = [
    a.mint,
    a.campaignVault,
    a.treasuryEscrow,
    a.treasuryReserve,
    a.tokenConfig,
    a.treasuryPosition,
    a.metadata,
  ].map((value) => new PublicKey(value));
  const accounts = await connection.getMultipleAccountsInfo(
    accountAddresses,
    "finalized",
  );
  const [
    mintInfo,
    campaignInfo,
    escrowInfo,
    reserveInfo,
    configInfo,
    positionInfo,
    metadataInfo,
  ] = accounts;
  if (
    !mintInfo ||
    !campaignInfo ||
    !escrowInfo ||
    !reserveInfo ||
    !configInfo ||
    !positionInfo ||
    !metadataInfo
  ) {
    throw new Error(
      "Genesis finalized, but one or more required accounts could not be read back.",
    );
  }
  const coreProgram = new PublicKey(TOKENOMICS_GENESIS_CONFIG.programId);
  for (const accountInfo of [configInfo, positionInfo]) {
    if (!accountInfo.owner.equals(coreProgram)) {
      throw new Error(
        "A finalized Tokenomics Core account has the wrong owner.",
      );
    }
  }
  for (const accountInfo of [mintInfo, campaignInfo, escrowInfo, reserveInfo]) {
    if (
      !accountInfo.owner.equals(new PublicKey(CLASSIC_SPL_TOKEN_PROGRAM_ID))
    ) {
      throw new Error("A finalized SPL account has the wrong owner.");
    }
  }
  if (!metadataInfo.owner.equals(new PublicKey(TOKEN_METADATA_PROGRAM_ID))) {
    throw new Error("The finalized metadata account has the wrong owner.");
  }

  const mint = decodeMint(mintInfo.data);
  const campaign = decodeTokenAccount(campaignInfo.data);
  const escrow = decodeTokenAccount(escrowInfo.data);
  const reserve = decodeTokenAccount(reserveInfo.data);
  const config = decodeTokenConfig(configInfo.data);
  const position = decodeTreasuryPosition(positionInfo.data);
  const metadata = decodeMetadata(metadataInfo.data);
  const verificationErrors = validateTokenomicsGenesisSnapshot(
    {
      campaignAmountAtoms: campaign.amount,
      campaignMint: campaign.mint,
      campaignOwner: campaign.owner,
      configGameAuthority: config.gameAuthority,
      configGovernance: config.governance,
      configGuardian: config.guardian,
      configMetadata: config.metadata,
      configMetadataMutable: config.metadataMutable,
      configMetadataUpdateAuthority: config.metadataUpdateAuthority,
      configMetadataUri: config.metadataUri,
      configMint: config.mint,
      configPublisher: config.publisher,
      configTreasuryEscrow: config.treasuryEscrow,
      configTreasuryReserve: config.treasuryReserve,
      escrowAmountAtoms: escrow.amount,
      escrowMint: escrow.mint,
      escrowOwner: escrow.owner,
      mintAuthority: mint.mintAuthority,
      mintDecimals: mint.decimals,
      mintFreezeAuthority: mint.freezeAuthority,
      mintOwner: mintInfo.owner.toBase58(),
      mintSupplyAtoms: mint.supply,
      reserveAmountAtoms: reserve.amount,
      reserveMint: reserve.mint,
      reserveOwner: reserve.owner,
      treasuryLockedAtoms: position.lockedAtoms,
      treasuryPositionBeneficialOwner: position.beneficialOwner,
      treasuryPositionMint: position.mint,
      treasuryPositionReturnAccount: position.returnAccount,
      treasuryPositionUnlockAuthority: position.unlockAuthority,
    },
    {
      campaignVault: a.campaignVault,
      executor: a.executor,
      gameAuthority: a.gameAuthority,
      metadata: a.metadata,
      mint: a.mint,
      tokenConfig: a.tokenConfig,
      treasuryEscrow: a.treasuryEscrow,
      treasuryReserve: a.treasuryReserve,
    },
  );
  if (
    metadata.mint !== a.mint ||
    metadata.name !== TOKENOMICS_GENESIS_CONFIG.name ||
    metadata.symbol !== TOKENOMICS_GENESIS_CONFIG.symbol ||
    metadata.uri !== TOKENOMICS_GENESIS_CONFIG.metadataUri ||
    metadata.updateAuthority !== TOKENOMICS_GENESIS_CONFIG.governance ||
    metadata.sellerFeeBasisPoints !== 0
  ) {
    verificationErrors.push(
      "The finalized Metaplex metadata does not match the reviewed JDR identity.",
    );
  }
  if (verificationErrors.length > 0) {
    throw new Error(
      `Genesis finalized, but strict read-back verification failed: ${verificationErrors.join(" ")}`,
    );
  }
}

function assertHasBlockhashLifetime(transaction: {
  lifetimeConstraint: unknown;
}): asserts transaction is ConfirmableTransaction & {
  lifetimeConstraint: { lastValidBlockHeight: bigint };
} {
  const lifetime = transaction.lifetimeConstraint;
  if (
    typeof lifetime !== "object" ||
    lifetime === null ||
    !("lastValidBlockHeight" in lifetime)
  ) {
    throw new Error(
      "The prepared transaction did not use a recent blockhash. Nothing was submitted.",
    );
  }
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function signSimulateSendAndVerifyGenesis({
  client,
  prepared,
  wallet,
}: {
  client: SolanaClient;
  prepared: PreparedTokenomicsGenesis;
  wallet: ConnectedWallet;
}): Promise<TokenomicsGenesisResult> {
  if (!isPhantomWalletA(wallet)) {
    throw new Error(
      "Genesis requires Phantom connected to the configured devnet wallet A.",
    );
  }
  const connection = new Connection(prepared.rpcEndpoint, "confirmed");
  await Promise.all([
    verifyExpectedDevnetMultisig({ rpcEndpoint: prepared.rpcEndpoint }),
    assertProgramAndAuthority(connection),
    assertGenesisAccountsAvailable(connection, prepared.summary.addresses),
  ]);

  const walletSigner = createWalletTransactionSigner(wallet, {
    commitment: "confirmed",
  });
  if (walletSigner.mode !== "partial") {
    throw new Error(
      "This Phantom connection cannot return signed bytes for simulation. Nothing was submitted.",
    );
  }
  const transaction = await client.transaction.prepare({
    authority: walletSigner.signer,
    commitment: "confirmed",
    feePayer: walletSigner.signer,
    instructions: prepared.instructions,
    version: 0,
  });
  const signedTransaction = await client.transaction.sign(transaction);
  const simulation = await client.runtime.rpc
    .simulateTransaction(getBase64EncodedWireTransaction(signedTransaction), {
      commitment: "confirmed",
      encoding: "base64",
      replaceRecentBlockhash: false,
      sigVerify: true,
    })
    .send();
  if (simulation.value.err) {
    const logs =
      simulation.value.logs?.slice(-10).join(" ") ?? "No logs returned.";
    throw new Error(
      `The signed genesis transaction failed simulation and was not submitted. ${JSON.stringify(simulation.value.err)} ${logs}`,
    );
  }
  assertHasBlockhashLifetime(signedTransaction);

  let signature: string;
  try {
    signature = (
      await client.actions.sendTransaction(signedTransaction, "finalized")
    ).toString();
  } catch (error) {
    throw new Error(
      `The simulated genesis transaction was not finalized: ${errorText(error)}`,
      { cause: error },
    );
  }
  await verifyFinalizedGenesis(prepared);
  return { ...prepared.summary, signature };
}
