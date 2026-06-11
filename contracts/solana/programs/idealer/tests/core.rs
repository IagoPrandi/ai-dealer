use anchor_lang::prelude::Pubkey;
use idealer::domain::{
    derive_draw_numbers, next_cycle_index, run_rule_election, split_fee, validate_action_window,
    validate_config, validate_guess, validate_rule, ConfigValidation, ElectionCandidate,
};
use solana_sha256_hasher::hash;

fn valid_config(cycle: &[u32; 4]) -> ConfigValidation<'_> {
    ConfigValidation {
        treasury_fee_bps: 500,
        turn_duration_cycle: cycle,
        rule_election_cutoff_bps: 7_500,
        guess_cutoff_bps: 9_670,
        max_rule_tokens: 80,
        top_voted_finalist_count: 3,
        random_finalist_count: 7,
        max_rule_proposals_per_wallet_per_turn: 5,
        max_votes_per_wallet_per_turn: 100,
    }
}

#[test]
fn account_constraints_use_isolated_canonical_pdas() {
    let program_id = idealer::ID;
    let player = Pubkey::new_unique();
    let other_player = Pubkey::new_unique();
    let turn_id = 7_u64;
    let rule_id = 11_u64;

    let (guess, _) = Pubkey::find_program_address(
        &[b"guess", &turn_id.to_le_bytes(), player.as_ref()],
        &program_id,
    );
    let (game_token, _) = Pubkey::find_program_address(
        &[b"game_token", &turn_id.to_le_bytes(), player.as_ref()],
        &program_id,
    );
    let (rule, _) = Pubkey::find_program_address(
        &[b"rule", &turn_id.to_le_bytes(), &rule_id.to_le_bytes()],
        &program_id,
    );
    let (vote, _) = Pubkey::find_program_address(
        &[
            b"vote",
            &turn_id.to_le_bytes(),
            &rule_id.to_le_bytes(),
            player.as_ref(),
        ],
        &program_id,
    );
    let (other_vote, _) = Pubkey::find_program_address(
        &[
            b"vote",
            &turn_id.to_le_bytes(),
            &rule_id.to_le_bytes(),
            other_player.as_ref(),
        ],
        &program_id,
    );

    assert_ne!(guess, game_token);
    assert_ne!(game_token, rule);
    assert_ne!(vote, other_vote);
}

#[test]
fn turn_lifecycle_uses_required_cycle_and_cutoffs() {
    let cycle = [7_200, 7_200, 28_800, 28_800];
    validate_config(&valid_config(&cycle)).unwrap();
    assert_eq!(next_cycle_index(0).unwrap(), 1);
    assert_eq!(next_cycle_index(1).unwrap(), 2);
    assert_eq!(next_cycle_index(2).unwrap(), 3);
    assert_eq!(next_cycle_index(3).unwrap(), 0);

    validate_action_window(7_499, 0, 10_000, 7_500).unwrap();
    assert!(validate_action_window(7_500, 0, 10_000, 7_500).is_err());
    assert!(validate_action_window(10_000, 0, 10_000, 9_670).is_err());
}

#[test]
fn fee_split_preserves_total_lamports() {
    let fee = 10_000_000;
    let (treasury, prize) = split_fee(fee, 500).unwrap();
    assert_eq!(treasury, 500_000);
    assert_eq!(prize, 9_500_000);
    assert_eq!(treasury.checked_add(prize), Some(fee));
}

#[test]
fn invalid_guesses_are_rejected() {
    validate_guess(&[1, 2, 3, 4, 5, 100]).unwrap();
    assert!(validate_guess(&[1, 2, 3, 4, 5, 5]).is_err());
    assert!(validate_guess(&[0, 2, 3, 4, 5, 6]).is_err());
    assert!(validate_guess(&[1, 2, 3, 4, 5, 101]).is_err());
}

#[test]
fn invalid_rule_proposals_are_rejected() {
    let text = "Win if at least four numbers match.";
    let text_hash = hash(text.as_bytes()).to_bytes();
    validate_rule(text, &text_hash, &[1; 32], 8, 80).unwrap();

    assert!(validate_rule("", &hash(b"").to_bytes(), &[1; 32], 1, 80).is_err());
    assert!(validate_rule(text, &[9; 32], &[1; 32], 8, 80).is_err());
    assert!(validate_rule(text, &text_hash, &[0; 32], 8, 80).is_err());
    assert!(validate_rule(text, &text_hash, &[1; 32], 81, 80).is_err());
}

#[test]
fn draw_derivation_produces_valid_unique_numbers() {
    let randomness = [7u8; 32];
    let numbers = derive_draw_numbers(&randomness, 1);

    // 6 numbers, all within range, all unique, deterministically reproducible.
    assert_eq!(numbers.len(), 6);
    assert!(numbers.iter().all(|number| (1..=100).contains(number)));
    validate_guess(&numbers).unwrap();
    assert_eq!(numbers, derive_draw_numbers(&randomness, 1));
}

#[test]
fn draw_derivation_matches_cross_language_vectors() {
    // These vectors are asserted identically in the worker's TypeScript mirror
    // (`apps/worker/src/draw.test.ts`) so the off-chain worker always publishes
    // exactly what the on-chain program derives.
    assert_eq!(derive_draw_numbers(&[7u8; 32], 1), [20, 18, 99, 69, 90, 37]);
    assert_eq!(derive_draw_numbers(&[3u8; 32], 5), [65, 11, 13, 10, 69, 17]);
}

#[test]
fn draw_derivation_varies_with_seed_and_turn() {
    let base = derive_draw_numbers(&[1u8; 32], 1);
    let different_seed = derive_draw_numbers(&[2u8; 32], 1);
    let different_turn = derive_draw_numbers(&[1u8; 32], 2);

    // Distinct verifiable inputs must not collapse to the same published draw.
    assert_ne!(base, different_seed);
    assert_ne!(base, different_turn);

    // Every derived draw remains a valid 6-unique-number result.
    for numbers in [base, different_seed, different_turn] {
        validate_guess(&numbers).unwrap();
    }
}

#[test]
fn invalid_config_and_vote_windows_are_rejected() {
    let cycle = [7_200, 7_200, 28_800, 28_800];
    let invalid_duration_cycle = [0, 7_200, 28_800, 28_800];

    let mut invalid_bps = valid_config(&cycle);
    invalid_bps.treasury_fee_bps = 10_001;
    assert!(validate_config(&invalid_bps).is_err());

    let mut invalid_cutoff = valid_config(&cycle);
    invalid_cutoff.rule_election_cutoff_bps = 9_700;
    assert!(validate_config(&invalid_cutoff).is_err());

    assert!(validate_config(&valid_config(&invalid_duration_cycle)).is_err());

    let mut invalid_rate_limit = valid_config(&cycle);
    invalid_rate_limit.max_rule_proposals_per_wallet_per_turn = 0;
    assert!(validate_config(&invalid_rate_limit).is_err());
    assert!(validate_action_window(7_500, 0, 10_000, 7_500).is_err());
}

fn candidate(rule_id: u64, vote_count: u32, created_at: i64) -> ElectionCandidate {
    ElectionCandidate {
        rule_id,
        sanitized_text_hash: [rule_id as u8; 32],
        compiled_artifact_hash: [200_u8.saturating_sub(rule_id as u8); 32],
        vote_count,
        report_count: 0,
        created_at,
        is_eligible_state: true,
        is_precompiled_valid: true,
    }
}

#[test]
fn rule_election_uses_top_votes_random_finalists_and_active_vrf_selection() {
    let candidates = vec![
        candidate(1, 20, 30),
        candidate(2, 21, 10),
        candidate(3, 21, 9),
        candidate(4, 12, 4),
        candidate(5, 11, 5),
        candidate(6, 10, 6),
        candidate(7, 9, 7),
        candidate(8, 8, 8),
        candidate(9, 7, 9),
        candidate(10, 6, 10),
        candidate(11, 5, 11),
        candidate(12, 4, 12),
    ];

    let result = run_rule_election(&candidates, &[9; 32], 1, 3, 7).unwrap();

    assert_eq!(result.top_voted_rule_ids, vec![3, 2, 1]);
    assert_eq!(result.finalist_rule_ids.len(), 10);
    assert_eq!(result.random_rule_ids.len(), 7);
    assert!(result
        .random_rule_ids
        .iter()
        .all(|rule_id| ![1, 2, 3].contains(rule_id)));
    assert!(result.active_rule_id.is_some());
    assert!(usize::from(result.elected_finalist_index) < result.finalist_rule_ids.len());
    assert_ne!(result.eligible_rule_pool_hash, [0; 32]);
    assert_ne!(result.finalist_set_hash, [0; 32]);
}

#[test]
fn rule_election_uses_all_eligible_rules_when_pool_is_smaller_than_finalist_target() {
    let candidates = vec![
        candidate(1, 2, 1),
        candidate(2, 1, 2),
        ElectionCandidate {
            report_count: 1,
            ..candidate(3, 99, 3)
        },
        ElectionCandidate {
            is_precompiled_valid: false,
            ..candidate(4, 98, 4)
        },
    ];

    let result = run_rule_election(&candidates, &[4; 32], 7, 3, 7).unwrap();

    assert_eq!(result.eligible_rule_ids, vec![1, 2]);
    assert_eq!(result.finalist_rule_ids, vec![1, 2]);
    assert!(matches!(result.active_rule_id, Some(1 | 2)));
}

#[test]
fn rule_election_handles_empty_and_duplicate_pools_fail_closed() {
    let empty = run_rule_election(&[], &[5; 32], 1, 3, 7).unwrap();
    assert!(empty.active_rule_id.is_none());
    assert_eq!(empty.finalist_rule_ids, Vec::<u64>::new());

    let duplicate = vec![candidate(1, 1, 1), candidate(1, 2, 2)];
    assert!(run_rule_election(&duplicate, &[5; 32], 1, 3, 7).is_err());
    assert!(run_rule_election(&[candidate(1, 1, 1)], &[0; 32], 1, 3, 7).is_err());
}
