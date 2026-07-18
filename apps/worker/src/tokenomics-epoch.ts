import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  buildMerkleTree,
  calculateEpochAccounting,
  type EpochClaimInput,
  type TreasuryDistributionLeaf,
} from "@idealer/tokenomics";

const execFileAsync = promisify(execFile);

export interface EpochCalculatorPosition {
  beneficiary: string;
  position: string;
  weight: string;
}

export interface EpochCalculatorInput {
  epochId: string;
  finalisedFeesLamports: string;
  network: string;
  positions: EpochCalculatorPosition[];
  programId: string;
  rolloverInLamports: string;
}

export interface EpochCalculatorClaim {
  amountLamports: string;
  beneficiary: string;
  leafHash: string;
  position: string;
  weight: string;
}

export interface EpochCalculatorOutput {
  claims: EpochCalculatorClaim[];
  epochId: string;
  grossDistributableLamports: string;
  merkleRoot: string | null;
  rolloverOutLamports: string;
  roundingDustLamports: string;
  sumOfMerkleClaimsLamports: string;
  totalWeight: string;
}

export interface IndependentEpochAgreement {
  agreed: true;
  rust: EpochCalculatorOutput;
  typescript: EpochCalculatorOutput;
}

export function calculateEpochInTypescript(
  input: EpochCalculatorInput,
): EpochCalculatorOutput {
  const programId = bytes32FromHex(input.programId, "programId");
  const epochId = parseUnsigned(input.epochId, "epochId");
  const positions: EpochClaimInput[] = input.positions.map((position) => ({
    beneficiary: bytes32FromHex(position.beneficiary, "beneficiary"),
    positionId: position.position,
    weight: parseUnsigned(position.weight, "weight"),
  }));
  const accounting = calculateEpochAccounting(
    parseUnsigned(input.finalisedFeesLamports, "finalisedFeesLamports"),
    parseUnsigned(input.rolloverInLamports, "rolloverInLamports"),
    positions,
  );
  const leaves: TreasuryDistributionLeaf[] = accounting.claims.map((claim) => ({
    amountLamports: claim.amountLamports,
    asset: "SOL",
    beneficiary: claim.beneficiary,
    epochId,
    network: input.network,
    positionId: bytes32FromHex(claim.positionId, "position"),
    programId,
  }));
  const tree = leaves.length > 0 ? buildMerkleTree(leaves) : null;
  const leafHashByPosition = new Map(
    tree?.leaves.map((record) => [
      toHex(record.leaf.positionId),
      toHex(record.hash),
    ]) ?? [],
  );
  return {
    claims: accounting.claims.map((claim) => ({
      amountLamports: claim.amountLamports.toString(),
      beneficiary: toHex(claim.beneficiary),
      leafHash: leafHashByPosition.get(claim.positionId) ?? failMissingLeaf(),
      position: claim.positionId,
      weight: claim.weight.toString(),
    })),
    epochId: input.epochId,
    grossDistributableLamports:
      accounting.grossDistributableLamports.toString(),
    merkleRoot: tree ? toHex(tree.root) : null,
    rolloverOutLamports: accounting.rolloverOutLamports.toString(),
    roundingDustLamports: accounting.roundingDustLamports.toString(),
    sumOfMerkleClaimsLamports: accounting.sumOfMerkleClaimsLamports.toString(),
    totalWeight: accounting.totalWeight.toString(),
  };
}

export function requireIndependentEpochAgreement(
  input: EpochCalculatorInput,
  rust: EpochCalculatorOutput,
): IndependentEpochAgreement {
  const typescript = calculateEpochInTypescript(input);
  const canonicalRust = canonicalizeOutput(rust);
  const canonicalTypescript = canonicalizeOutput(typescript);
  if (JSON.stringify(canonicalRust) !== JSON.stringify(canonicalTypescript)) {
    throw new Error(
      `tokenomics_epoch_calculator_disagreement:${JSON.stringify({
        rust: canonicalRust,
        typescript: canonicalTypescript,
      })}`,
    );
  }
  return { agreed: true, rust: canonicalRust, typescript: canonicalTypescript };
}

export async function runRustEpochCalculator(
  inputPath: string,
): Promise<EpochCalculatorOutput> {
  const executable = process.env.IDEALER_TOKENOMICS_RUST_CALCULATOR;
  if (!executable) {
    throw new Error("IDEALER_TOKENOMICS_RUST_CALCULATOR is required");
  }
  const { stdout } = await execFileAsync(executable, [inputPath], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  });
  return parseCalculatorOutput(stdout);
}

export function parseCalculatorOutput(value: string): EpochCalculatorOutput {
  const parsed: unknown = JSON.parse(value);
  if (!isCalculatorOutput(parsed)) {
    throw new Error("invalid_rust_tokenomics_calculator_output");
  }
  return canonicalizeOutput(parsed);
}

function canonicalizeOutput(
  output: EpochCalculatorOutput,
): EpochCalculatorOutput {
  return {
    ...output,
    claims: [...output.claims].sort((left, right) =>
      left.position.localeCompare(right.position),
    ),
  };
}

function isCalculatorOutput(value: unknown): value is EpochCalculatorOutput {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<EpochCalculatorOutput>;
  return (
    Array.isArray(candidate.claims) &&
    typeof candidate.epochId === "string" &&
    typeof candidate.grossDistributableLamports === "string" &&
    (typeof candidate.merkleRoot === "string" ||
      candidate.merkleRoot === null) &&
    typeof candidate.rolloverOutLamports === "string" &&
    typeof candidate.roundingDustLamports === "string" &&
    typeof candidate.sumOfMerkleClaimsLamports === "string" &&
    typeof candidate.totalWeight === "string" &&
    candidate.claims.every(
      (claim) =>
        claim &&
        typeof claim.amountLamports === "string" &&
        typeof claim.beneficiary === "string" &&
        typeof claim.leafHash === "string" &&
        typeof claim.position === "string" &&
        typeof claim.weight === "string",
    )
  );
}

function bytes32FromHex(value: string, field: string): Uint8Array {
  if (!/^[\da-f]{64}$/i.test(value)) {
    throw new Error(`${field}_must_be_32_byte_hex`);
  }
  return Uint8Array.from(Buffer.from(value, "hex"));
}

function parseUnsigned(value: string, field: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${field}_must_be_unsigned_decimal`);
  }
  return BigInt(value);
}

function toHex(value: Uint8Array): string {
  return Buffer.from(value).toString("hex");
}

function failMissingLeaf(): never {
  throw new Error("missing_calculated_leaf");
}
