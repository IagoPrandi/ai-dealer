use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;

use crate::TokenomicsError;

pub const TOKEN_DECIMALS: u8 = 9;
pub const TOKEN_ATOMS_PER_TOKEN: u64 = 1_000_000_000;
pub const FIXED_SUPPLY_ATOMS: u64 = 1_000_000_000 * TOKEN_ATOMS_PER_TOKEN;
pub const INITIAL_CAMPAIGN_ATOMS: u64 = 200_000_000 * TOKEN_ATOMS_PER_TOKEN;
pub const CREATOR_TREASURY_ATOMS: u64 = 800_000_000 * TOKEN_ATOMS_PER_TOKEN;
pub const TURNS_PER_EPOCH: u64 = 7;
pub const REVIEW_WINDOW_SECONDS: i64 = 24 * 60 * 60;
pub const CHALLENGE_RESOLUTION_SECONDS: i64 = 48 * 60 * 60;
pub const DEFAULT_CHALLENGE_BOND_LAMPORTS: u64 = 20_000_000;
// Treasury outbound operations still require the configured 2-of-3 multisig,
// but the owner-approved execution delay is zero.
pub const TREASURY_OPERATION_DELAY_SECONDS: i64 = 0;
pub const UNPAUSE_NOTICE_SECONDS: i64 = 24 * 60 * 60;
pub const PROPOSAL_REWARD_ATOMS: u64 = 400_000_000;
pub const SUPPORTER_REWARD_ATOMS: u64 = 60_000_000;
pub const REFERRAL_INVITER_REWARD_ATOMS: u64 = 200_000_000;
pub const REFERRAL_INVITEE_REWARD_ATOMS: u64 = 30_000_000;
pub const ACTIVE_RULE_REWARD_CAP_ATOMS: u64 = 250_000_000;
pub const REWARD_RATE_BPS: u128 = 1_500;
pub const BPS_DENOMINATOR: u128 = 10_000;
pub const MAX_MERKLE_PROOF_DEPTH: usize = 32;

const LEAF_DOMAIN: &[u8] = b"idealer:treasury-distribution-leaf:v1";
const NODE_DOMAIN: &[u8] = b"idealer:treasury-distribution-node:v1";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct EpochAccounting {
    pub gross_distributable_lamports: u64,
    pub sum_of_merkle_claims_lamports: u64,
    pub rounding_dust_lamports: u64,
    pub zero_weight_rollover_out_lamports: u64,
    pub rollover_out_lamports: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ActiveRuleRewardAmounts {
    pub individual_alternative_payout_lamports: u64,
    pub calculated_creator_atoms: u64,
    pub calculated_voter_pool_atoms: u64,
    pub creator_paid_atoms: u64,
    pub voter_pool_paid_atoms: u64,
    pub remaining_campaign_atoms: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CampaignDebit {
    pub paid_atoms: u64,
    pub remaining_atoms: u64,
    pub final_partial: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WeightedPosition {
    pub position: Pubkey,
    pub beneficiary: Pubkey,
    pub weight: u128,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ProportionalClaim {
    pub position: Pubkey,
    pub beneficiary: Pubkey,
    pub weight: u128,
    pub amount_lamports: u64,
}

pub fn epoch_accounting(
    finalised_fees_lamports: u64,
    rollover_in_lamports: u64,
    total_weight: u128,
    declared_claims_lamports: u64,
) -> Result<EpochAccounting> {
    let gross = finalised_fees_lamports
        .checked_add(rollover_in_lamports)
        .ok_or(TokenomicsError::ArithmeticOverflow)?;
    if total_weight == 0 {
        require!(
            declared_claims_lamports == 0,
            TokenomicsError::InvalidDeclaredClaims
        );
        return Ok(EpochAccounting {
            gross_distributable_lamports: gross,
            sum_of_merkle_claims_lamports: 0,
            rounding_dust_lamports: 0,
            zero_weight_rollover_out_lamports: gross,
            rollover_out_lamports: gross,
        });
    }
    require!(
        declared_claims_lamports <= gross,
        TokenomicsError::InvalidDeclaredClaims
    );
    let dust = gross
        .checked_sub(declared_claims_lamports)
        .ok_or(TokenomicsError::ArithmeticOverflow)?;
    Ok(EpochAccounting {
        gross_distributable_lamports: gross,
        sum_of_merkle_claims_lamports: declared_claims_lamports,
        rounding_dust_lamports: dust,
        zero_weight_rollover_out_lamports: 0,
        rollover_out_lamports: dust,
    })
}

pub fn debit_campaign(remaining_atoms: u64, nominal_atoms: u64) -> CampaignDebit {
    let paid_atoms = remaining_atoms.min(nominal_atoms);
    CampaignDebit {
        paid_atoms,
        remaining_atoms: remaining_atoms - paid_atoms,
        final_partial: paid_atoms > 0 && paid_atoms < nominal_atoms,
    }
}

pub fn calculate_proportional_claims(
    gross_distributable_lamports: u64,
    positions: &[WeightedPosition],
) -> Result<Vec<ProportionalClaim>> {
    let mut ordered = positions.to_vec();
    ordered.sort_by_key(|position| position.position.to_bytes());
    for pair in ordered.windows(2) {
        require!(
            pair[0].position != pair[1].position,
            TokenomicsError::DuplicatePosition
        );
    }
    let total_weight = ordered.iter().try_fold(0u128, |sum, position| {
        sum.checked_add(position.weight)
            .ok_or(TokenomicsError::ArithmeticOverflow)
    })?;
    if total_weight == 0 {
        return Ok(Vec::new());
    }
    ordered
        .into_iter()
        .filter(|position| position.weight > 0)
        .map(|position| {
            let numerator = u128::from(gross_distributable_lamports)
                .checked_mul(position.weight)
                .ok_or(TokenomicsError::ArithmeticOverflow)?;
            let amount = numerator / total_weight;
            Ok(ProportionalClaim {
                position: position.position,
                beneficiary: position.beneficiary,
                weight: position.weight,
                amount_lamports: u64::try_from(amount)
                    .map_err(|_| TokenomicsError::ArithmeticOverflow)?,
            })
        })
        .collect()
}

pub fn active_rule_rewards(
    alternative_prize_pool_lamports: u64,
    winner_count: u64,
    available_campaign_atoms: u64,
    has_eligible_voters: bool,
) -> Result<ActiveRuleRewardAmounts> {
    require!(winner_count > 0, TokenomicsError::InvalidWinnerCount);
    let individual_payout = alternative_prize_pool_lamports / winner_count;
    let calculated = u128::from(individual_payout)
        .checked_mul(REWARD_RATE_BPS)
        .ok_or(TokenomicsError::ArithmeticOverflow)?
        / BPS_DENOMINATOR;
    let calculated = u64::try_from(calculated).map_err(|_| TokenomicsError::ArithmeticOverflow)?;
    let creator_paid = calculated
        .min(ACTIVE_RULE_REWARD_CAP_ATOMS)
        .min(available_campaign_atoms);
    let after_creator = available_campaign_atoms
        .checked_sub(creator_paid)
        .ok_or(TokenomicsError::ArithmeticOverflow)?;
    let voter_paid = if has_eligible_voters {
        calculated
            .min(ACTIVE_RULE_REWARD_CAP_ATOMS)
            .min(after_creator)
    } else {
        0
    };
    Ok(ActiveRuleRewardAmounts {
        individual_alternative_payout_lamports: individual_payout,
        calculated_creator_atoms: calculated,
        calculated_voter_pool_atoms: calculated,
        creator_paid_atoms: creator_paid,
        voter_pool_paid_atoms: voter_paid,
        remaining_campaign_atoms: after_creator
            .checked_sub(voter_paid)
            .ok_or(TokenomicsError::ArithmeticOverflow)?,
    })
}

pub fn voter_payment(pool_atoms: u64, voter_count: u64, sorted_index: u64) -> Result<u64> {
    require!(voter_count > 0, TokenomicsError::NoEligibleVoters);
    require!(
        sorted_index < voter_count,
        TokenomicsError::InvalidVoterOrder
    );
    let base = pool_atoms / voter_count;
    let remainder = pool_atoms % voter_count;
    Ok(base + u64::from(sorted_index < remainder))
}

pub fn referral_bonus(actually_paid_invitee_atoms: u64) -> Result<u64> {
    let bonus = u128::from(actually_paid_invitee_atoms)
        .checked_mul(REWARD_RATE_BPS)
        .ok_or(TokenomicsError::ArithmeticOverflow)?
        / BPS_DENOMINATOR;
    u64::try_from(bonus).map_err(|_| error!(TokenomicsError::ArithmeticOverflow))
}

pub fn distribution_leaf_hash(
    program_id: &Pubkey,
    network: &[u8],
    epoch_id: u64,
    position: &Pubkey,
    beneficiary: &Pubkey,
    amount_lamports: u64,
) -> Result<[u8; 32]> {
    require!(
        !network.is_empty() && network.len() <= 32,
        TokenomicsError::InvalidNetwork
    );
    let network_len = u32::try_from(network.len()).map_err(|_| TokenomicsError::InvalidNetwork)?;
    Ok(hashv(&[
        LEAF_DOMAIN,
        program_id.as_ref(),
        &network_len.to_le_bytes(),
        network,
        &epoch_id.to_le_bytes(),
        position.as_ref(),
        beneficiary.as_ref(),
        &[0],
        &amount_lamports.to_le_bytes(),
    ])
    .to_bytes())
}

pub fn verify_merkle_proof(root: &[u8; 32], leaf: &[u8; 32], proof: &[[u8; 32]]) -> Result<bool> {
    require!(
        proof.len() <= MAX_MERKLE_PROOF_DEPTH,
        TokenomicsError::MerkleProofTooDeep
    );
    let mut cursor = *leaf;
    for sibling in proof {
        let (left, right) = if cursor <= *sibling {
            (&cursor, sibling)
        } else {
            (sibling, &cursor)
        };
        cursor = hashv(&[NODE_DOMAIN, left, right]).to_bytes();
    }
    Ok(cursor == *root)
}

pub fn merkle_root_from_leaf_hashes(leaf_hashes: &[[u8; 32]]) -> Result<[u8; 32]> {
    require!(!leaf_hashes.is_empty(), TokenomicsError::EmptyMerkleTree);
    let mut level = leaf_hashes.to_vec();
    level.sort_unstable();
    while level.len() > 1 {
        let mut next = Vec::with_capacity(level.len().div_ceil(2));
        for pair in level.chunks(2) {
            let left = pair[0];
            let right = *pair.get(1).unwrap_or(&left);
            let (first, second) = if left <= right {
                (left, right)
            } else {
                (right, left)
            };
            next.push(hashv(&[NODE_DOMAIN, &first, &second]).to_bytes());
        }
        level = next;
    }
    Ok(level[0])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supply_allocations_sum_exactly() {
        assert_eq!(
            INITIAL_CAMPAIGN_ATOMS + CREATOR_TREASURY_ATOMS,
            FIXED_SUPPLY_ATOMS
        );
    }

    #[test]
    fn zero_weight_rolls_every_lamport() {
        let result = epoch_accounting(9, 2, 0, 0).expect("accounting");
        assert_eq!(result.gross_distributable_lamports, 11);
        assert_eq!(result.sum_of_merkle_claims_lamports, 0);
        assert_eq!(result.zero_weight_rollover_out_lamports, 11);
        assert_eq!(result.rollover_out_lamports, 11);
    }

    #[test]
    fn positive_weight_rolls_only_rounding_dust() {
        let result = epoch_accounting(10, 1, 3, 10).expect("accounting");
        assert_eq!(result.rounding_dust_lamports, 1);
        assert_eq!(result.rollover_out_lamports, 1);
    }

    #[test]
    fn weighted_claims_are_canonical_and_floor_to_lamports() {
        let claims = calculate_proportional_claims(
            11,
            &[
                WeightedPosition {
                    position: Pubkey::new_from_array([2; 32]),
                    beneficiary: Pubkey::new_from_array([2; 32]),
                    weight: 1,
                },
                WeightedPosition {
                    position: Pubkey::new_from_array([1; 32]),
                    beneficiary: Pubkey::new_from_array([1; 32]),
                    weight: 2,
                },
            ],
        )
        .expect("claims");
        assert_eq!(claims[0].amount_lamports, 7);
        assert_eq!(claims[1].amount_lamports, 3);
    }

    #[test]
    fn terminal_campaign_debit_consumes_residual() {
        let result = debit_campaign(50, 60);
        assert_eq!(result.paid_atoms, 50);
        assert_eq!(result.remaining_atoms, 0);
        assert!(result.final_partial);
    }

    #[test]
    fn creator_is_debited_before_voter_pool() {
        let result = active_rule_rewards(10_000_000_000, 1, 400_000_000, true).expect("reward");
        assert_eq!(result.calculated_creator_atoms, 1_500_000_000);
        assert_eq!(result.creator_paid_atoms, 250_000_000);
        assert_eq!(result.voter_pool_paid_atoms, 150_000_000);
        assert_eq!(result.remaining_campaign_atoms, 0);
    }

    #[test]
    fn voter_remainder_is_assigned_to_first_sorted_indices() {
        assert_eq!(voter_payment(5, 3, 0).expect("payment"), 2);
        assert_eq!(voter_payment(5, 3, 1).expect("payment"), 2);
        assert_eq!(voter_payment(5, 3, 2).expect("payment"), 1);
    }

    #[test]
    fn leaf_hash_matches_shared_typescript_vector() {
        let hash = distribution_leaf_hash(
            &Pubkey::new_from_array([9; 32]),
            b"devnet",
            7,
            &Pubkey::new_from_array([11; 32]),
            &Pubkey::new_from_array([1; 32]),
            10,
        )
        .expect("leaf hash");
        assert_eq!(
            hash,
            [
                0xa4, 0xd6, 0xc7, 0x62, 0x06, 0x6f, 0xd5, 0xe3, 0xeb, 0x46, 0xde, 0x10, 0x80, 0x0d,
                0xa4, 0x24, 0x45, 0x43, 0xb5, 0x39, 0x5d, 0x8c, 0x04, 0x99, 0x23, 0x57, 0xdd, 0x57,
                0xf6, 0xa1, 0xb5, 0xb9,
            ]
        );
    }

    #[test]
    fn merkle_root_matches_shared_typescript_vector() {
        let hashes: Vec<[u8; 32]> = (1u8..=3)
            .map(|value| {
                distribution_leaf_hash(
                    &Pubkey::new_from_array([9; 32]),
                    b"devnet",
                    7,
                    &Pubkey::new_from_array([value + 10; 32]),
                    &Pubkey::new_from_array([value; 32]),
                    u64::from(value) * 10,
                )
                .expect("leaf hash")
            })
            .collect();
        assert_eq!(
            merkle_root_from_leaf_hashes(&hashes).expect("root"),
            [
                0xd6, 0x27, 0x27, 0x43, 0x58, 0x23, 0x0d, 0xcc, 0x6b, 0x33, 0xd2, 0xae, 0xf9, 0xb9,
                0xbc, 0x79, 0x07, 0x54, 0x98, 0x07, 0x34, 0x25, 0xc2, 0xcd, 0x5f, 0x0e, 0x99, 0x1f,
                0x63, 0x36, 0x6d, 0x5b,
            ]
        );
    }
}
