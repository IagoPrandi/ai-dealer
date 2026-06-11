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

pub struct ConfigValidation<'a> {
    pub treasury_fee_bps: u16,
    pub turn_duration_cycle: &'a [u32; TURN_DURATION_CYCLE_LEN],
    pub rule_election_cutoff_bps: u16,
    pub guess_cutoff_bps: u16,
    pub max_rule_tokens: u16,
    pub top_voted_finalist_count: u8,
    pub random_finalist_count: u8,
    pub max_rule_proposals_per_wallet_per_turn: u16,
    pub max_votes_per_wallet_per_turn: u16,
}

pub fn validate_config(config: &ConfigValidation<'_>) -> Result<()> {
    require!(
        config.treasury_fee_bps <= 10_000,
        IdealerError::InvalidBasisPoints
    );
    require!(
        config.rule_election_cutoff_bps < config.guess_cutoff_bps
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
        config.max_rule_proposals_per_wallet_per_turn > 0
            && config.max_votes_per_wallet_per_turn > 0,
        IdealerError::InvalidRateLimit
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
    for index in 0..start_index.min(upper_bound) {
        seen[index] = true;
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
                return usize::try_from(value % upper_bound_u64)
                    .map_err(|_| IdealerError::ArithmeticOverflow);
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
