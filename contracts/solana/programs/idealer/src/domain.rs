use anchor_lang::prelude::*;
use solana_sha256_hasher::hash;

use crate::{IdealerError, MAX_RULE_TEXT_BYTES, TURN_DURATION_CYCLE_LEN};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ElectionCandidate {
    pub rule_id: u64,
    pub sanitized_text_hash: [u8; 32],
    pub compiled_artifact_hash: [u8; 32],
    pub vote_count: u32,
    pub report_count: u32,
    pub created_at: i64,
    pub is_eligible_state: bool,
    pub is_precompiled_valid: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ElectionResult {
    pub eligible_rule_ids: Vec<u64>,
    pub top_voted_rule_ids: Vec<u64>,
    pub random_rule_ids: Vec<u64>,
    pub finalist_rule_ids: Vec<u64>,
    pub active_rule_id: Option<u64>,
    pub active_rule_hash: [u8; 32],
    pub active_rule_artifact_hash: [u8; 32],
    pub elected_finalist_index: u8,
    pub eligible_rule_pool_hash: [u8; 32],
    pub top_voted_finalist_hash: [u8; 32],
    pub random_finalist_hash: [u8; 32],
    pub finalist_set_hash: [u8; 32],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FeeSourceAccounting {
    pub count: u64,
    pub fee_lamports: u64,
    pub gross_lamports: u64,
    pub treasury_lamports: u64,
    pub prize_lamports: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PrizePoolAccountingInput {
    pub turn_id: u64,
    pub guess_submission_count: u64,
    pub rule_proposal_count: u64,
    pub paid_rule_removal_count: u64,
    pub vote_count: u64,
    pub guess_submission_fee_lamports: u64,
    pub rule_proposal_fee_lamports: u64,
    pub paid_rule_removal_fee_lamports: u64,
    pub vote_fee_lamports: u64,
    pub treasury_fee_bps: u16,
    pub original_rollover_lamports: u64,
    pub alternative_rollover_lamports: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PrizePoolBucketAccounting {
    pub current_turn_lamports: u64,
    pub rollover_lamports: u64,
    pub total_lamports: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PrizePoolAccounting {
    pub guess_submissions: FeeSourceAccounting,
    pub rule_proposals: FeeSourceAccounting,
    pub paid_rule_removals: FeeSourceAccounting,
    pub votes: FeeSourceAccounting,
    pub vote_fee_active: bool,
    pub gross_fees_lamports: u64,
    pub treasury_lamports: u64,
    pub current_turn_pool_lamports: u64,
    pub original_bucket: PrizePoolBucketAccounting,
    pub alternative_bucket: PrizePoolBucketAccounting,
    pub total_visible_prize_pool_lamports: u64,
    pub next_original_rollover_if_no_winners_lamports: u64,
    pub next_alternative_rollover_if_no_winners_lamports: u64,
}

pub const VOTE_FEE_START_TURN: u64 = 100;
const REPEATED_ACTION_FEE_MULTIPLIER: u64 = 2;

pub struct ConfigValidation<'a> {
    pub treasury_fee_bps: u16,
    pub turn_duration_cycle: &'a [u32; TURN_DURATION_CYCLE_LEN],
    pub rule_election_cutoff_bps: u16,
    pub guess_cutoff_bps: u16,
    pub max_rule_tokens: u16,
    pub top_voted_finalist_count: u8,
    pub random_finalist_count: u8,
}

pub fn validate_config(config: &ConfigValidation<'_>) -> Result<()> {
    require!(
        config.treasury_fee_bps <= 10_000,
        IdealerError::InvalidBasisPoints
    );
    // The rule-election cutoff marks the phase-1 → phase-2 boundary of the
    // turn (PRD §5.4). Guess submission must not outlive it: equal cutoffs
    // close rule creation and number picking together at the end of phase 1.
    require!(
        config.rule_election_cutoff_bps > 0
            && config.rule_election_cutoff_bps <= config.guess_cutoff_bps
            && config.guess_cutoff_bps <= 10_000,
        IdealerError::InvalidCutoff
    );
    require!(
        config.max_rule_tokens > 0,
        IdealerError::InvalidMaxRuleTokens
    );
    require!(
        config
            .top_voted_finalist_count
            .checked_add(config.random_finalist_count)
            .ok_or(IdealerError::ArithmeticOverflow)?
            > 0,
        IdealerError::InvalidFinalistCounts
    );
    require!(
        config
            .turn_duration_cycle
            .iter()
            .all(|duration| *duration > 0),
        IdealerError::InvalidTurnDuration
    );
    Ok(())
}

pub fn validate_guess(numbers: &[u8; 6]) -> Result<()> {
    let mut seen = [false; 101];
    for number in numbers {
        require!((1..=100).contains(number), IdealerError::InvalidGuessNumber);
        let index = usize::from(*number);
        require!(!seen[index], IdealerError::DuplicateGuessNumber);
        seen[index] = true;
    }
    Ok(())
}

pub fn validate_rule(
    text: &str,
    supplied_hash: &[u8; 32],
    preflight_result_hash: &[u8; 32],
    token_count: u16,
    max_rule_tokens: u16,
) -> Result<()> {
    let text_bytes = text.as_bytes();
    require!(!text.trim().is_empty(), IdealerError::EmptyRuleText);
    require!(
        text_bytes.len() <= MAX_RULE_TEXT_BYTES,
        IdealerError::RuleTextTooLong
    );
    require!(
        token_count > 0 && token_count <= max_rule_tokens,
        IdealerError::InvalidRuleTokenCount
    );
    require!(
        hash(text_bytes).to_bytes() == *supplied_hash,
        IdealerError::RuleTextHashMismatch
    );
    require!(
        *preflight_result_hash != [0; 32],
        IdealerError::InvalidPreflightCommitment
    );
    Ok(())
}

pub fn validate_action_window(
    now: i64,
    start_timestamp: i64,
    end_timestamp: i64,
    cutoff_bps: u16,
) -> Result<()> {
    require!(
        now >= start_timestamp && now < end_timestamp,
        IdealerError::TurnNotOpen
    );
    let duration = end_timestamp
        .checked_sub(start_timestamp)
        .ok_or(IdealerError::ArithmeticOverflow)?;
    let elapsed = now
        .checked_sub(start_timestamp)
        .ok_or(IdealerError::ArithmeticOverflow)?;
    let cutoff_elapsed = i128::from(duration)
        .checked_mul(i128::from(cutoff_bps))
        .ok_or(IdealerError::ArithmeticOverflow)?
        .checked_div(10_000)
        .ok_or(IdealerError::ArithmeticOverflow)?;
    require!(
        i128::from(elapsed) < cutoff_elapsed,
        IdealerError::ActionWindowClosed
    );
    Ok(())
}

pub fn split_fee(amount: u64, treasury_fee_bps: u16) -> Result<(u64, u64)> {
    let treasury_amount = amount
        .checked_mul(u64::from(treasury_fee_bps))
        .ok_or(IdealerError::ArithmeticOverflow)?
        .checked_div(10_000)
        .ok_or(IdealerError::ArithmeticOverflow)?;
    let prize_amount = amount
        .checked_sub(treasury_amount)
        .ok_or(IdealerError::ArithmeticOverflow)?;
    Ok((treasury_amount, prize_amount))
}

fn account_fee_source(
    count: u64,
    fee_lamports: u64,
    treasury_fee_bps: u16,
) -> Result<FeeSourceAccounting> {
    let gross_lamports = count
        .checked_mul(fee_lamports)
        .ok_or(IdealerError::ArithmeticOverflow)?;
    let (treasury_lamports, prize_lamports) = split_fee(gross_lamports, treasury_fee_bps)?;

    Ok(FeeSourceAccounting {
        count,
        fee_lamports,
        gross_lamports,
        treasury_lamports,
        prize_lamports,
    })
}

pub fn repeated_action_fee_lamports(
    turn_id: u64,
    sequence: u64,
    base_fee_lamports: u64,
) -> Result<u64> {
    require!(turn_id > 0 && sequence > 0, IdealerError::InvalidTurnId);
    if turn_id < VOTE_FEE_START_TURN && sequence == 1 {
        return Ok(0);
    }

    let paid_index = sequence
        .checked_sub(1)
        .ok_or(IdealerError::ArithmeticOverflow)?;
    let mut fee_lamports = base_fee_lamports;
    for _ in 0..paid_index {
        fee_lamports = fee_lamports
            .checked_mul(REPEATED_ACTION_FEE_MULTIPLIER)
            .ok_or(IdealerError::ArithmeticOverflow)?;
    }
    Ok(fee_lamports)
}

fn account_repeated_vote_fee_source(
    turn_id: u64,
    count: u64,
    base_fee_lamports: u64,
    treasury_fee_bps: u16,
) -> Result<FeeSourceAccounting> {
    let mut gross_lamports = 0u64;
    for sequence in 1..=count {
        gross_lamports = gross_lamports
            .checked_add(repeated_action_fee_lamports(
                turn_id,
                sequence,
                base_fee_lamports,
            )?)
            .ok_or(IdealerError::ArithmeticOverflow)?;
    }
    let (treasury_lamports, prize_lamports) = split_fee(gross_lamports, treasury_fee_bps)?;

    Ok(FeeSourceAccounting {
        count,
        fee_lamports: base_fee_lamports,
        gross_lamports,
        treasury_lamports,
        prize_lamports,
    })
}

pub fn calculate_prize_pool_accounting(
    input: &PrizePoolAccountingInput,
) -> Result<PrizePoolAccounting> {
    require!(input.turn_id > 0, IdealerError::InvalidTurnId);

    let guess_submissions = account_repeated_vote_fee_source(
        input.turn_id,
        input.guess_submission_count,
        input.guess_submission_fee_lamports,
        input.treasury_fee_bps,
    )?;
    let rule_proposals = account_repeated_vote_fee_source(
        input.turn_id,
        input.rule_proposal_count,
        input.rule_proposal_fee_lamports,
        input.treasury_fee_bps,
    )?;
    let paid_rule_removals = account_fee_source(
        input.paid_rule_removal_count,
        input.paid_rule_removal_fee_lamports,
        input.treasury_fee_bps,
    )?;
    let votes = account_repeated_vote_fee_source(
        input.turn_id,
        input.vote_count,
        input.vote_fee_lamports,
        input.treasury_fee_bps,
    )?;
    let vote_fee_active = votes.gross_lamports > 0;

    let gross_fees_lamports = guess_submissions
        .gross_lamports
        .checked_add(rule_proposals.gross_lamports)
        .and_then(|value| value.checked_add(paid_rule_removals.gross_lamports))
        .and_then(|value| value.checked_add(votes.gross_lamports))
        .ok_or(IdealerError::ArithmeticOverflow)?;
    let treasury_lamports = guess_submissions
        .treasury_lamports
        .checked_add(rule_proposals.treasury_lamports)
        .and_then(|value| value.checked_add(paid_rule_removals.treasury_lamports))
        .and_then(|value| value.checked_add(votes.treasury_lamports))
        .ok_or(IdealerError::ArithmeticOverflow)?;
    let current_turn_pool_lamports = guess_submissions
        .prize_lamports
        .checked_add(rule_proposals.prize_lamports)
        .and_then(|value| value.checked_add(paid_rule_removals.prize_lamports))
        .and_then(|value| value.checked_add(votes.prize_lamports))
        .ok_or(IdealerError::ArithmeticOverflow)?;

    let original_current_turn_lamports = current_turn_pool_lamports / 2;
    let alternative_current_turn_lamports = current_turn_pool_lamports
        .checked_sub(original_current_turn_lamports)
        .ok_or(IdealerError::ArithmeticOverflow)?;
    let original_total_lamports = original_current_turn_lamports
        .checked_add(input.original_rollover_lamports)
        .ok_or(IdealerError::ArithmeticOverflow)?;
    let alternative_total_lamports = alternative_current_turn_lamports
        .checked_add(input.alternative_rollover_lamports)
        .ok_or(IdealerError::ArithmeticOverflow)?;
    let total_visible_prize_pool_lamports = original_total_lamports
        .checked_add(alternative_total_lamports)
        .ok_or(IdealerError::ArithmeticOverflow)?;

    Ok(PrizePoolAccounting {
        guess_submissions,
        rule_proposals,
        paid_rule_removals,
        votes,
        vote_fee_active,
        gross_fees_lamports,
        treasury_lamports,
        current_turn_pool_lamports,
        original_bucket: PrizePoolBucketAccounting {
            current_turn_lamports: original_current_turn_lamports,
            rollover_lamports: input.original_rollover_lamports,
            total_lamports: original_total_lamports,
        },
        alternative_bucket: PrizePoolBucketAccounting {
            current_turn_lamports: alternative_current_turn_lamports,
            rollover_lamports: input.alternative_rollover_lamports,
            total_lamports: alternative_total_lamports,
        },
        total_visible_prize_pool_lamports,
        next_original_rollover_if_no_winners_lamports: original_total_lamports,
        next_alternative_rollover_if_no_winners_lamports: alternative_total_lamports,
    })
}

pub fn next_cycle_index(current: u8) -> Result<u8> {
    let next = current
        .checked_add(1)
        .ok_or(IdealerError::ArithmeticOverflow)?;
    Ok(next % TURN_DURATION_CYCLE_LEN as u8)
}

pub fn run_rule_election(
    candidates: &[ElectionCandidate],
    randomness: &[u8; 32],
    turn_id: u64,
    top_voted_count: u8,
    random_count: u8,
) -> Result<ElectionResult> {
    require!(*randomness != [0; 32], IdealerError::InvalidRandomnessValue);

    let mut eligible: Vec<ElectionCandidate> = candidates
        .iter()
        .copied()
        .filter(is_election_candidate_eligible)
        .collect();
    for left in 0..eligible.len() {
        for right in (left + 1)..eligible.len() {
            require!(
                eligible[left].rule_id != eligible[right].rule_id,
                IdealerError::DuplicateElectionCandidate
            );
        }
    }

    eligible.sort_by(|left, right| {
        right
            .vote_count
            .cmp(&left.vote_count)
            .then_with(|| left.created_at.cmp(&right.created_at))
            .then_with(|| left.rule_id.cmp(&right.rule_id))
    });

    let eligible_rule_ids = eligible.iter().map(|candidate| candidate.rule_id).collect();
    let eligible_rule_pool_hash = hash_candidates(b"eligible_pool_v1", &eligible);

    let finalist_target = usize::from(
        top_voted_count
            .checked_add(random_count)
            .ok_or(IdealerError::ArithmeticOverflow)?,
    );
    require!(finalist_target > 0, IdealerError::InvalidFinalistCounts);

    if eligible.is_empty() {
        return Ok(ElectionResult {
            eligible_rule_ids,
            top_voted_rule_ids: Vec::new(),
            random_rule_ids: Vec::new(),
            finalist_rule_ids: Vec::new(),
            active_rule_id: None,
            active_rule_hash: [0; 32],
            active_rule_artifact_hash: [0; 32],
            elected_finalist_index: 0,
            eligible_rule_pool_hash,
            top_voted_finalist_hash: hash_rule_ids(b"top_finalists_v1", &[]),
            random_finalist_hash: hash_rule_ids(b"random_finalists_v1", &[]),
            finalist_set_hash: hash_rule_ids(b"finalist_set_v1", &[]),
        });
    }

    let top_count = usize::from(top_voted_count).min(eligible.len());
    let mut finalists = eligible[..top_count].to_vec();
    let top_voted_rule_ids: Vec<u64> = finalists
        .iter()
        .map(|candidate| candidate.rule_id)
        .collect();

    let mut random_rule_ids = Vec::new();
    if eligible.len() > finalist_target {
        let needed_random =
            usize::from(random_count).min(finalist_target.saturating_sub(top_count));
        let random_indices = derive_unique_indices(
            randomness,
            turn_id,
            b"random_finalists_v1",
            top_count,
            eligible.len(),
            needed_random,
        )?;
        for index in random_indices {
            finalists.push(eligible[index]);
            random_rule_ids.push(eligible[index].rule_id);
        }
    } else {
        for candidate in eligible.iter().skip(top_count) {
            finalists.push(*candidate);
            random_rule_ids.push(candidate.rule_id);
        }
    }

    let finalist_rule_ids: Vec<u64> = finalists
        .iter()
        .map(|candidate| candidate.rule_id)
        .collect();
    let top_voted_finalist_hash = hash_rule_ids(b"top_finalists_v1", &top_voted_rule_ids);
    let random_finalist_hash = hash_rule_ids(b"random_finalists_v1", &random_rule_ids);
    let finalist_set_hash = hash_rule_ids(b"finalist_set_v1", &finalist_rule_ids);

    let elected_index = derive_index(randomness, turn_id, b"active_finalist_v1", finalists.len())?;
    let active = finalists[elected_index];

    Ok(ElectionResult {
        eligible_rule_ids,
        top_voted_rule_ids,
        random_rule_ids,
        finalist_rule_ids,
        active_rule_id: Some(active.rule_id),
        active_rule_hash: active.sanitized_text_hash,
        active_rule_artifact_hash: active.compiled_artifact_hash,
        elected_finalist_index: elected_index as u8,
        eligible_rule_pool_hash,
        top_voted_finalist_hash,
        random_finalist_hash,
        finalist_set_hash,
    })
}

fn is_election_candidate_eligible(candidate: &ElectionCandidate) -> bool {
    candidate.is_eligible_state
        && candidate.is_precompiled_valid
        && candidate.compiled_artifact_hash != [0; 32]
        && candidate.report_count == 0
}

fn hash_candidates(domain: &[u8], candidates: &[ElectionCandidate]) -> [u8; 32] {
    let mut input = Vec::with_capacity(domain.len() + candidates.len() * 84);
    input.extend_from_slice(domain);
    input.extend_from_slice(&(candidates.len() as u64).to_le_bytes());
    for candidate in candidates {
        input.extend_from_slice(&candidate.rule_id.to_le_bytes());
        input.extend_from_slice(&candidate.vote_count.to_le_bytes());
        input.extend_from_slice(&candidate.created_at.to_le_bytes());
        input.extend_from_slice(&candidate.sanitized_text_hash);
        input.extend_from_slice(&candidate.compiled_artifact_hash);
    }
    hash(&input).to_bytes()
}

fn hash_rule_ids(domain: &[u8], rule_ids: &[u64]) -> [u8; 32] {
    let mut input = Vec::with_capacity(domain.len() + 8 + rule_ids.len() * 8);
    input.extend_from_slice(domain);
    input.extend_from_slice(&(rule_ids.len() as u64).to_le_bytes());
    for rule_id in rule_ids {
        input.extend_from_slice(&rule_id.to_le_bytes());
    }
    hash(&input).to_bytes()
}

fn derive_unique_indices(
    randomness: &[u8; 32],
    turn_id: u64,
    domain: &[u8],
    start_index: usize,
    upper_bound: usize,
    count: usize,
) -> Result<Vec<usize>> {
    let mut selected = Vec::with_capacity(count);
    let mut seen = vec![false; upper_bound];
    for already_selected in seen.iter_mut().take(start_index.min(upper_bound)) {
        *already_selected = true;
    }

    let mut counter = 0u64;
    while selected.len() < count {
        let index = derive_index_with_counter(randomness, turn_id, domain, upper_bound, counter)?;
        if !seen[index] {
            seen[index] = true;
            selected.push(index);
        }
        counter = counter
            .checked_add(1)
            .ok_or(IdealerError::ArithmeticOverflow)?;
    }

    Ok(selected)
}

fn derive_index(
    randomness: &[u8; 32],
    turn_id: u64,
    domain: &[u8],
    upper_bound: usize,
) -> Result<usize> {
    derive_index_with_counter(randomness, turn_id, domain, upper_bound, 0)
}

fn derive_index_with_counter(
    randomness: &[u8; 32],
    turn_id: u64,
    domain: &[u8],
    upper_bound: usize,
    mut counter: u64,
) -> Result<usize> {
    require!(upper_bound > 0, IdealerError::InvalidFinalistCounts);
    let upper_bound_u64 =
        u64::try_from(upper_bound).map_err(|_| IdealerError::ArithmeticOverflow)?;
    let rejection_limit = u64::MAX - (u64::MAX % upper_bound_u64);

    loop {
        let mut input = Vec::with_capacity(32 + 8 + 8 + domain.len());
        input.extend_from_slice(randomness);
        input.extend_from_slice(&turn_id.to_le_bytes());
        input.extend_from_slice(&counter.to_le_bytes());
        input.extend_from_slice(domain);
        let digest = hash(&input).to_bytes();

        for chunk in digest.chunks_exact(8) {
            let mut bytes = [0u8; 8];
            bytes.copy_from_slice(chunk);
            let value = u64::from_le_bytes(bytes);
            if value < rejection_limit {
                return Ok(usize::try_from(value % upper_bound_u64)
                    .map_err(|_| IdealerError::ArithmeticOverflow)?);
            }
        }

        counter = counter
            .checked_add(1)
            .ok_or(IdealerError::ArithmeticOverflow)?;
    }
}

/// Deterministically derive the 6 unique draw numbers (1..=100) from a
/// verifiable randomness value and the turn id.
///
/// The randomness is sourced off-chain from a verifiable randomness provider
/// (Switchboard On-Demand) and consumed on-chain through `settle_draw`. The
/// derivation is fully deterministic so any auditor holding the stored
/// `draw_randomness` and `turn_id` can reproduce the published `draw_result`.
///
/// Numbers are sampled with rejection sampling (bytes `>= 200` are skipped) so
/// every value in `1..=100` is equally likely, avoiding modulo bias.
pub fn derive_draw_numbers(randomness: &[u8; 32], turn_id: u64) -> [u8; 6] {
    const DRAW_COUNT: usize = 6;
    const UPPER_BOUND: u8 = 100;
    // Largest multiple of UPPER_BOUND that fits in a u8 byte domain (0..=255).
    const REJECTION_LIMIT: u8 = (256 / UPPER_BOUND as u16 * UPPER_BOUND as u16) as u8; // 200

    let mut numbers = [0u8; DRAW_COUNT];
    let mut seen = [false; (UPPER_BOUND as usize) + 1];
    let mut filled = 0usize;
    let mut counter: u64 = 0;

    while filled < DRAW_COUNT {
        let mut input = [0u8; 48];
        input[..32].copy_from_slice(randomness);
        input[32..40].copy_from_slice(&turn_id.to_le_bytes());
        input[40..48].copy_from_slice(&counter.to_le_bytes());
        let digest = hash(&input).to_bytes();

        for byte in digest.iter() {
            if *byte >= REJECTION_LIMIT {
                continue;
            }
            let candidate = (*byte % UPPER_BOUND) + 1; // 1..=100
            let index = usize::from(candidate);
            if !seen[index] {
                seen[index] = true;
                numbers[filled] = candidate;
                filled += 1;
                if filled == DRAW_COUNT {
                    break;
                }
            }
        }

        counter = counter.wrapping_add(1);
    }

    numbers
}
