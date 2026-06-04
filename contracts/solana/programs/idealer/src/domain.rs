use anchor_lang::prelude::*;
use solana_sha256_hasher::hash;

use crate::{IdealerError, MAX_RULE_TEXT_BYTES, TURN_DURATION_CYCLE_LEN};

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
