use std::{env, fs, process};

use anchor_lang::prelude::Pubkey;
use serde::{Deserialize, Serialize};
use tokenomics_core::domain::{
    calculate_proportional_claims, distribution_leaf_hash, epoch_accounting,
    merkle_root_from_leaf_hashes, WeightedPosition,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CalculatorInput {
    program_id: String,
    network: String,
    epoch_id: String,
    finalised_fees_lamports: String,
    rollover_in_lamports: String,
    positions: Vec<PositionInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PositionInput {
    position: String,
    beneficiary: String,
    weight: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CalculatorOutput {
    epoch_id: String,
    gross_distributable_lamports: String,
    total_weight: String,
    sum_of_merkle_claims_lamports: String,
    rounding_dust_lamports: String,
    rollover_out_lamports: String,
    merkle_root: Option<String>,
    claims: Vec<ClaimOutput>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ClaimOutput {
    position: String,
    beneficiary: String,
    weight: String,
    amount_lamports: String,
    leaf_hash: String,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("tokenomics-calculator: {error}");
        process::exit(1);
    }
}

fn run() -> Result<(), String> {
    let input_path = env::args()
        .nth(1)
        .ok_or_else(|| "usage: tokenomics-calculator <input.json>".to_owned())?;
    let source = fs::read_to_string(input_path).map_err(|error| error.to_string())?;
    let input: CalculatorInput =
        serde_json::from_str(&source).map_err(|error| error.to_string())?;

    let program_id = pubkey_from_hex(&input.program_id)?;
    let epoch_id = parse_u64("epochId", &input.epoch_id)?;
    let finalised_fees = parse_u64("finalisedFeesLamports", &input.finalised_fees_lamports)?;
    let rollover_in = parse_u64("rolloverInLamports", &input.rollover_in_lamports)?;
    let weighted_positions: Vec<WeightedPosition> = input
        .positions
        .iter()
        .map(|position| {
            Ok(WeightedPosition {
                position: pubkey_from_hex(&position.position)?,
                beneficiary: pubkey_from_hex(&position.beneficiary)?,
                weight: parse_u128("weight", &position.weight)?,
            })
        })
        .collect::<Result<_, String>>()?;
    let total_weight = weighted_positions.iter().try_fold(0u128, |sum, position| {
        sum.checked_add(position.weight)
            .ok_or_else(|| "total weight overflow".to_owned())
    })?;
    let gross = finalised_fees
        .checked_add(rollover_in)
        .ok_or_else(|| "gross distributable overflow".to_owned())?;
    let claims = calculate_proportional_claims(gross, &weighted_positions)
        .map_err(|error| error.to_string())?;
    let sum_of_claims = claims.iter().try_fold(0u64, |sum, claim| {
        sum.checked_add(claim.amount_lamports)
            .ok_or_else(|| "claim sum overflow".to_owned())
    })?;
    let accounting = epoch_accounting(finalised_fees, rollover_in, total_weight, sum_of_claims)
        .map_err(|error| error.to_string())?;
    let claim_outputs: Vec<ClaimOutput> = claims
        .iter()
        .map(|claim| {
            let leaf_hash = distribution_leaf_hash(
                &program_id,
                input.network.as_bytes(),
                epoch_id,
                &claim.position,
                &claim.beneficiary,
                claim.amount_lamports,
            )
            .map_err(|error| error.to_string())?;
            Ok(ClaimOutput {
                position: bytes_to_hex(claim.position.as_ref()),
                beneficiary: bytes_to_hex(claim.beneficiary.as_ref()),
                weight: claim.weight.to_string(),
                amount_lamports: claim.amount_lamports.to_string(),
                leaf_hash: bytes_to_hex(&leaf_hash),
            })
        })
        .collect::<Result<_, String>>()?;
    let hashes: Vec<[u8; 32]> = claim_outputs
        .iter()
        .map(|claim| bytes32_from_hex(&claim.leaf_hash))
        .collect::<Result<_, String>>()?;
    let merkle_root = if hashes.is_empty() {
        None
    } else {
        Some(bytes_to_hex(
            &merkle_root_from_leaf_hashes(&hashes).map_err(|error| error.to_string())?,
        ))
    };
    let output = CalculatorOutput {
        epoch_id: epoch_id.to_string(),
        gross_distributable_lamports: accounting.gross_distributable_lamports.to_string(),
        total_weight: total_weight.to_string(),
        sum_of_merkle_claims_lamports: accounting.sum_of_merkle_claims_lamports.to_string(),
        rounding_dust_lamports: accounting.rounding_dust_lamports.to_string(),
        rollover_out_lamports: accounting.rollover_out_lamports.to_string(),
        merkle_root,
        claims: claim_outputs,
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&output).map_err(|error| error.to_string())?
    );
    Ok(())
}

fn parse_u64(field: &str, value: &str) -> Result<u64, String> {
    value
        .parse()
        .map_err(|_| format!("{field} must be an unsigned 64-bit decimal string"))
}

fn parse_u128(field: &str, value: &str) -> Result<u128, String> {
    value
        .parse()
        .map_err(|_| format!("{field} must be an unsigned 128-bit decimal string"))
}

fn pubkey_from_hex(value: &str) -> Result<Pubkey, String> {
    Ok(Pubkey::new_from_array(bytes32_from_hex(value)?))
}

fn bytes32_from_hex(value: &str) -> Result<[u8; 32], String> {
    if value.len() != 64 {
        return Err("public keys and hashes must contain 64 hexadecimal characters".to_owned());
    }
    let mut output = [0u8; 32];
    for (index, byte) in output.iter_mut().enumerate() {
        let start = index * 2;
        *byte = u8::from_str_radix(&value[start..start + 2], 16)
            .map_err(|_| "invalid hexadecimal input".to_owned())?;
    }
    Ok(output)
}

fn bytes_to_hex(value: &[u8]) -> String {
    value.iter().map(|byte| format!("{byte:02x}")).collect()
}
