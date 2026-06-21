use anchor_lang::{
    prelude::{Clock, Pubkey},
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use idealer::{
    accounts, instruction, DrawStatus, InitializeGlobalConfigArgs, PlayerGuess,
    PrecompilationStatus, PrecompileRuleArgs, ProposeRuleArgs, RuleProposal, RuleState, RuleVote,
    SettleDrawArgs, SettleRuleElectionArgs, TurnState, TurnStatus,
};
use solana_account_info::AccountInfo;
use solana_program_error::ProgramResult;
use solana_program_test::{processor, BanksClientError, ProgramTest, ProgramTestContext};
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use solana_sha256_hasher::hash;
use solana_system_interface::{instruction as system_instruction, program as system_program};

const PLAYER_BALANCE: u64 = 2_000_000_000;

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &idealer::ID).0
}

fn process_idealer_instruction<'a, 'b, 'c, 'info>(
    program_id: &'a Pubkey,
    accounts: &'b [AccountInfo<'info>],
    instruction_data: &'c [u8],
) -> ProgramResult {
    // SAFETY: ProgramTest owns every AccountInfo for the full instruction invocation.
    // Anchor 0.32's generated entrypoint unnecessarily ties the slice borrow to the
    // AccountInfo lifetime, so this test-only adapter narrows the API mismatch.
    let anchor_accounts: &'info [AccountInfo<'info>] = unsafe { std::mem::transmute(accounts) };
    idealer::entry(program_id, anchor_accounts, instruction_data)
}

fn test_config_args() -> InitializeGlobalConfigArgs {
    InitializeGlobalConfigArgs {
        treasury_address: Pubkey::new_unique(),
        draw_vrf_config: Pubkey::new_unique(),
        election_vrf_config: Pubkey::new_unique(),
        guess_submission_fee_lamports: 10_000_000,
        rule_proposal_fee_lamports: 20_000_000,
        rule_removal_fee_lamports: 50_000_000,
        vote_fee_lamports: 5_000_000,
        treasury_fee_bps: 500,
        turn_duration_cycle: [7_200, 7_200, 28_800, 28_800],
        rule_election_cutoff_bps: 7_500,
        guess_cutoff_bps: 9_670,
        max_rule_tokens: 80,
        top_voted_finalist_count: 3,
        random_finalist_count: 7,
        max_rule_proposals_per_wallet_per_turn: 5,
        max_votes_per_wallet_per_turn: 100,
        minimum_claim_threshold_lamports: 5_000_000,
        claim_window_turns: 12,
        claim_window_days: 7,
        creator_reward_cap_lamports: 250_000_000,
        min_votes_creator_self_remove: 10,
        min_votes_third_party_remove: 25,
    }
}

async fn process(
    context: &mut ProgramTestContext,
    instruction: Instruction,
    additional_signers: &[&Keypair],
) -> Result<(), BanksClientError> {
    let blockhash = context.banks_client.get_latest_blockhash().await.unwrap();
    let mut signers = vec![&context.payer];
    signers.extend_from_slice(additional_signers);
    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&context.payer.pubkey()),
        &signers,
        blockhash,
    );
    context.banks_client.process_transaction(transaction).await
}

async fn fund(context: &mut ProgramTestContext, recipient: &Pubkey) {
    process(
        context,
        system_instruction::transfer(&context.payer.pubkey(), recipient, PLAYER_BALANCE),
        &[],
    )
    .await
    .unwrap();
}

async fn read_anchor_account<T: AccountDeserialize>(
    context: &mut ProgramTestContext,
    address: Pubkey,
) -> T {
    let account = context
        .banks_client
        .get_account(address)
        .await
        .unwrap()
        .unwrap();
    T::try_deserialize(&mut account.data.as_slice()).unwrap()
}

async fn initialize_and_open_turn(context: &mut ProgramTestContext, turn_id: u64) {
    let global_config = pda(&[b"global_config"]);
    let treasury_vault = pda(&[b"treasury_vault"]);
    process(
        context,
        Instruction {
            program_id: idealer::ID,
            accounts: accounts::InitializeGlobalConfig {
                authority: context.payer.pubkey(),
                global_config,
                treasury_vault,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::InitializeGlobalConfig {
                args: test_config_args(),
            }
            .data(),
        },
        &[],
    )
    .await
    .unwrap();

    let turn_state = pda(&[b"turn", &turn_id.to_le_bytes()]);
    let prize_vault = pda(&[b"prize_vault", &turn_id.to_le_bytes()]);
    process(
        context,
        Instruction {
            program_id: idealer::ID,
            accounts: accounts::OpenTurn {
                authority: context.payer.pubkey(),
                global_config,
                turn_state,
                prize_vault,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::OpenTurn { turn_id }.data(),
        },
        &[],
    )
    .await
    .unwrap();
}

async fn submit_guess(
    context: &mut ProgramTestContext,
    player: &Keypair,
    turn_id: u64,
    numbers: [u8; 6],
) -> Result<(), BanksClientError> {
    process(
        context,
        Instruction {
            program_id: idealer::ID,
            accounts: accounts::SubmitGuess {
                player: player.pubkey(),
                global_config: pda(&[b"global_config"]),
                turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
                player_guess: pda(&[b"guess", &turn_id.to_le_bytes(), player.pubkey().as_ref()]),
                game_token: pda(&[
                    b"game_token",
                    &turn_id.to_le_bytes(),
                    player.pubkey().as_ref(),
                ]),
                treasury_vault: pda(&[b"treasury_vault"]),
                prize_vault: pda(&[b"prize_vault", &turn_id.to_le_bytes()]),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::SubmitGuess { numbers }.data(),
        },
        &[player],
    )
    .await
}

#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn core_instructions_execute_and_persist_state() {
    let mut context = ProgramTest::new(
        "idealer",
        idealer::ID,
        processor!(process_idealer_instruction),
    )
    .start_with_context()
    .await;
    let turn_id = 1_u64;
    initialize_and_open_turn(&mut context, turn_id).await;

    let player = Keypair::new();
    fund(&mut context, &player.pubkey()).await;
    submit_guess(&mut context, &player, turn_id, [1, 2, 3, 4, 5, 6])
        .await
        .unwrap();

    let guess_address = pda(&[b"guess", &turn_id.to_le_bytes(), player.pubkey().as_ref()]);
    let guess: PlayerGuess = read_anchor_account(&mut context, guess_address).await;
    assert_eq!(guess.turn_id, turn_id);
    assert_eq!(guess.player, player.pubkey());
    assert_eq!(guess.numbers, [1, 2, 3, 4, 5, 6]);

    let rule_id = 9_u64;
    let text = "Win if at least four numbers match.".to_string();
    let rule_address = pda(&[b"rule", &turn_id.to_le_bytes(), &rule_id.to_le_bytes()]);
    process(
        &mut context,
        Instruction {
            program_id: idealer::ID,
            accounts: accounts::ProposeRule {
                proposer: player.pubkey(),
                global_config: pda(&[b"global_config"]),
                turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
                game_token: pda(&[
                    b"game_token",
                    &turn_id.to_le_bytes(),
                    player.pubkey().as_ref(),
                ]),
                rule_proposal: rule_address,
                treasury_vault: pda(&[b"treasury_vault"]),
                prize_vault: pda(&[b"prize_vault", &turn_id.to_le_bytes()]),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::ProposeRule {
                args: ProposeRuleArgs {
                    rule_id,
                    sanitized_text_hash: hash(text.as_bytes()).to_bytes(),
                    sanitized_text: text.clone(),
                    normalized_text_hash: [2; 32],
                    official_interpretation_hash: [3; 32],
                    preflight_result_hash: [4; 32],
                    token_count: 8,
                },
            }
            .data(),
        },
        &[&player],
    )
    .await
    .unwrap();

    let proposal: RuleProposal = read_anchor_account(&mut context, rule_address).await;
    assert_eq!(proposal.sanitized_text, text);
    assert_eq!(proposal.vote_count, 0);

    let vote_address = pda(&[
        b"vote",
        &turn_id.to_le_bytes(),
        &rule_id.to_le_bytes(),
        player.pubkey().as_ref(),
    ]);
    let vote_instruction = Instruction {
        program_id: idealer::ID,
        accounts: accounts::VoteRule {
            voter: player.pubkey(),
            global_config: pda(&[b"global_config"]),
            turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
            game_token: pda(&[
                b"game_token",
                &turn_id.to_le_bytes(),
                player.pubkey().as_ref(),
            ]),
            rule_proposal: rule_address,
            rule_vote: vote_address,
            prize_vault: pda(&[b"prize_vault", &turn_id.to_le_bytes()]),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::VoteRule {}.data(),
    };
    process(&mut context, vote_instruction.clone(), &[&player])
        .await
        .unwrap();
    let vote: RuleVote = read_anchor_account(&mut context, vote_address).await;
    assert_eq!(vote.voter, player.pubkey());
    let proposal: RuleProposal = read_anchor_account(&mut context, rule_address).await;
    assert_eq!(proposal.vote_count, 1);

    // A repeat vote from the same wallet on the same proposal must fail: the
    // `rule_vote` PDA is seeded by (turn, rule, voter), so re-`init` is rejected.
    // Warp to a new slot first so the retry is a distinct transaction; otherwise
    // the identical instruction reuses the same blockhash and banks returns the
    // cached success of the first vote instead of re-executing on-chain.
    let warp_clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    context.warp_to_slot(warp_clock.slot + 1).unwrap();
    assert!(process(&mut context, vote_instruction, &[&player])
        .await
        .is_err());

    let turn_address = pda(&[b"turn", &turn_id.to_le_bytes()]);
    let turn: TurnState = read_anchor_account(&mut context, turn_address).await;
    let mut clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    clock.unix_timestamp = turn.end_timestamp;
    context.set_sysvar(&clock);
    let authority = context.payer.pubkey();
    process(
        &mut context,
        Instruction {
            program_id: idealer::ID,
            accounts: accounts::CloseTurn {
                authority,
                global_config: pda(&[b"global_config"]),
                turn_state: turn_address,
            }
            .to_account_metas(None),
            data: instruction::CloseTurn {}.data(),
        },
        &[],
    )
    .await
    .unwrap();
    let turn: TurnState = read_anchor_account(&mut context, turn_address).await;
    assert_eq!(turn.status, TurnStatus::Closed);
}

#[allow(clippy::too_many_arguments)]
async fn propose_rule(
    context: &mut ProgramTestContext,
    proposer: &Keypair,
    turn_id: u64,
    rule_id: u64,
    text: &str,
) -> Result<(), BanksClientError> {
    let rule_address = pda(&[b"rule", &turn_id.to_le_bytes(), &rule_id.to_le_bytes()]);
    process(
        context,
        Instruction {
            program_id: idealer::ID,
            accounts: accounts::ProposeRule {
                proposer: proposer.pubkey(),
                global_config: pda(&[b"global_config"]),
                turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
                game_token: pda(&[
                    b"game_token",
                    &turn_id.to_le_bytes(),
                    proposer.pubkey().as_ref(),
                ]),
                rule_proposal: rule_address,
                treasury_vault: pda(&[b"treasury_vault"]),
                prize_vault: pda(&[b"prize_vault", &turn_id.to_le_bytes()]),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::ProposeRule {
                args: ProposeRuleArgs {
                    rule_id,
                    sanitized_text_hash: hash(text.as_bytes()).to_bytes(),
                    sanitized_text: text.to_string(),
                    normalized_text_hash: [2; 32],
                    official_interpretation_hash: [3; 32],
                    preflight_result_hash: [4; 32],
                    token_count: 8,
                },
            }
            .data(),
        },
        &[proposer],
    )
    .await
}

fn remove_rule_instruction(turn_id: u64, rule_id: u64, remover: Pubkey) -> Instruction {
    Instruction {
        program_id: idealer::ID,
        accounts: accounts::RemoveRule {
            remover,
            global_config: pda(&[b"global_config"]),
            turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
            game_token: pda(&[b"game_token", &turn_id.to_le_bytes(), remover.as_ref()]),
            rule_proposal: pda(&[b"rule", &turn_id.to_le_bytes(), &rule_id.to_le_bytes()]),
            rule_removal: pda(&[
                b"rule_removal",
                &turn_id.to_le_bytes(),
                &rule_id.to_le_bytes(),
                remover.as_ref(),
            ]),
            treasury_vault: pda(&[b"treasury_vault"]),
            prize_vault: pda(&[b"prize_vault", &turn_id.to_le_bytes()]),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::RemoveRule {}.data(),
    }
}

#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn remove_rule_enforces_protection_and_routes_fee_to_prize_pool() {
    let mut context = ProgramTest::new(
        "idealer",
        idealer::ID,
        processor!(process_idealer_instruction),
    )
    .start_with_context()
    .await;
    let turn_id = 1_u64;
    initialize_and_open_turn(&mut context, turn_id).await;

    // Two players, each with a Game Token for this turn.
    let creator = Keypair::new();
    fund(&mut context, &creator.pubkey()).await;
    submit_guess(&mut context, &creator, turn_id, [1, 2, 3, 4, 5, 6])
        .await
        .unwrap();
    let third_party = Keypair::new();
    fund(&mut context, &third_party.pubkey()).await;
    submit_guess(&mut context, &third_party, turn_id, [7, 8, 9, 10, 11, 12])
        .await
        .unwrap();

    // Third party removes the creator's still-live rule. Fee → prize pool.
    let rule_id = 5_u64;
    propose_rule(&mut context, &creator, turn_id, rule_id, "Win if odds win.")
        .await
        .unwrap();
    let prize_vault = pda(&[b"prize_vault", &turn_id.to_le_bytes()]);
    let prize_before = read_anchor_account::<idealer::PrizeVault>(&mut context, prize_vault)
        .await
        .total_collected_lamports;

    process(
        &mut context,
        remove_rule_instruction(turn_id, rule_id, third_party.pubkey()),
        &[&third_party],
    )
    .await
    .unwrap();

    let rule_address = pda(&[b"rule", &turn_id.to_le_bytes(), &rule_id.to_le_bytes()]);
    let proposal: RuleProposal = read_anchor_account(&mut context, rule_address).await;
    assert_eq!(proposal.state, RuleState::RemovedPaid);
    let removal_address = pda(&[
        b"rule_removal",
        &turn_id.to_le_bytes(),
        &rule_id.to_le_bytes(),
        third_party.pubkey().as_ref(),
    ]);
    let removal: idealer::RuleRemoval = read_anchor_account(&mut context, removal_address).await;
    assert_eq!(removal.removal_kind, idealer::RuleRemovalKind::ThirdParty);
    let prize_after = read_anchor_account::<idealer::PrizeVault>(&mut context, prize_vault)
        .await
        .total_collected_lamports;
    // 50_000_000 fee, 5% treasury → 47_500_000 to the prize pool.
    assert_eq!(prize_after - prize_before, 47_500_000);

    // A second removal of the same rule is rejected (already RemovedPaid).
    assert!(process(
        &mut context,
        remove_rule_instruction(turn_id, rule_id, creator.pubkey()),
        &[&creator],
    )
    .await
    .is_err());
}

async fn advance_clock_to_turn_end(context: &mut ProgramTestContext, turn_id: u64) {
    let turn_address = pda(&[b"turn", &turn_id.to_le_bytes()]);
    let turn: TurnState = read_anchor_account(context, turn_address).await;
    let mut clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    clock.unix_timestamp = turn.end_timestamp;
    context.set_sysvar(&clock);
}

async fn advance_clock_to_election_cutoff(context: &mut ProgramTestContext, turn_id: u64) {
    let turn_address = pda(&[b"turn", &turn_id.to_le_bytes()]);
    let turn: TurnState = read_anchor_account(context, turn_address).await;
    let cutoff_elapsed = (turn.end_timestamp - turn.start_timestamp) * 7_500 / 10_000;
    let mut clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    clock.unix_timestamp = turn.start_timestamp + cutoff_elapsed;
    context.set_sysvar(&clock);
}

fn request_draw_instruction(
    turn_id: u64,
    authority: Pubkey,
    randomness_account: Pubkey,
) -> Instruction {
    Instruction {
        program_id: idealer::ID,
        accounts: accounts::RequestDraw {
            authority,
            global_config: pda(&[b"global_config"]),
            turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
        }
        .to_account_metas(None),
        data: instruction::RequestDraw { randomness_account }.data(),
    }
}

#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn rule_election_locks_requests_and_settles_active_rule() {
    let mut context = ProgramTest::new(
        "idealer",
        idealer::ID,
        processor!(process_idealer_instruction),
    )
    .start_with_context()
    .await;
    let turn_id = 1_u64;
    initialize_and_open_turn(&mut context, turn_id).await;

    let player = Keypair::new();
    fund(&mut context, &player.pubkey()).await;
    submit_guess(&mut context, &player, turn_id, [1, 2, 3, 4, 5, 6])
        .await
        .unwrap();

    let rule_id = 70_u64;
    let text = "Win if at least four numbers match.".to_string();
    let rule_address = pda(&[b"rule", &turn_id.to_le_bytes(), &rule_id.to_le_bytes()]);
    process(
        &mut context,
        Instruction {
            program_id: idealer::ID,
            accounts: accounts::ProposeRule {
                proposer: player.pubkey(),
                global_config: pda(&[b"global_config"]),
                turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
                game_token: pda(&[
                    b"game_token",
                    &turn_id.to_le_bytes(),
                    player.pubkey().as_ref(),
                ]),
                rule_proposal: rule_address,
                treasury_vault: pda(&[b"treasury_vault"]),
                prize_vault: pda(&[b"prize_vault", &turn_id.to_le_bytes()]),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::ProposeRule {
                args: ProposeRuleArgs {
                    rule_id,
                    sanitized_text_hash: hash(text.as_bytes()).to_bytes(),
                    sanitized_text: text,
                    normalized_text_hash: [2; 32],
                    official_interpretation_hash: [3; 32],
                    preflight_result_hash: [4; 32],
                    token_count: 8,
                },
            }
            .data(),
        },
        &[&player],
    )
    .await
    .unwrap();

    let compiled_artifact_hash = [8; 32];
    let authority = context.payer.pubkey();
    process(
        &mut context,
        Instruction {
            program_id: idealer::ID,
            accounts: accounts::PrecompileRule {
                authority,
                global_config: pda(&[b"global_config"]),
                turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
                rule_proposal: rule_address,
            }
            .to_account_metas(None),
            data: instruction::PrecompileRule {
                args: PrecompileRuleArgs {
                    compiled_artifact_hash,
                    passed: true,
                },
            }
            .data(),
        },
        &[],
    )
    .await
    .unwrap();
    let proposal: RuleProposal = read_anchor_account(&mut context, rule_address).await;
    assert_eq!(proposal.state, RuleState::Eligible);
    assert_eq!(proposal.precompilation_status, PrecompilationStatus::Passed);

    advance_clock_to_election_cutoff(&mut context, turn_id).await;
    let authority = context.payer.pubkey();
    let turn_address = pda(&[b"turn", &turn_id.to_le_bytes()]);

    let mut lock_accounts = accounts::LockRuleElectionPool {
        authority,
        global_config: pda(&[b"global_config"]),
        turn_state: turn_address,
    }
    .to_account_metas(None);
    lock_accounts.push(AccountMeta::new_readonly(rule_address, false));
    process(
        &mut context,
        Instruction {
            program_id: idealer::ID,
            accounts: lock_accounts,
            data: instruction::LockRuleElectionPool {}.data(),
        },
        &[],
    )
    .await
    .unwrap();
    let turn: TurnState = read_anchor_account(&mut context, turn_address).await;
    assert_ne!(turn.eligible_rule_pool_hash, [0; 32]);

    let election_randomness_account = Pubkey::new_unique();
    process(
        &mut context,
        Instruction {
            program_id: idealer::ID,
            accounts: accounts::RequestRuleElectionVrf {
                authority,
                global_config: pda(&[b"global_config"]),
                turn_state: turn_address,
            }
            .to_account_metas(None),
            data: instruction::RequestRuleElectionVrf {
                randomness_account: election_randomness_account,
            }
            .data(),
        },
        &[],
    )
    .await
    .unwrap();

    let mut settle_accounts = accounts::SettleRuleElection {
        authority,
        global_config: pda(&[b"global_config"]),
        turn_state: turn_address,
    }
    .to_account_metas(None);
    settle_accounts.push(AccountMeta::new_readonly(rule_address, false));
    process(
        &mut context,
        Instruction {
            program_id: idealer::ID,
            accounts: settle_accounts,
            data: instruction::SettleRuleElection {
                args: SettleRuleElectionArgs {
                    randomness: [9; 32],
                    randomness_source: election_randomness_account,
                },
            }
            .data(),
        },
        &[],
    )
    .await
    .unwrap();

    // SettleRuleElection now only selects finalists and opens the elimination
    // window; the active rule is chosen later by `settle_active_election`.
    let turn: TurnState = read_anchor_account(&mut context, turn_address).await;
    assert_eq!(turn.election_vrf_request, election_randomness_account);
    assert_eq!(turn.election_vrf_fulfillment, election_randomness_account);
    assert_ne!(turn.finalist_set_hash, [0; 32]);
    assert_eq!(turn.finalist_count, 1);
    assert_eq!(turn.finalist_rule_ids[0], rule_id);
    assert_eq!(turn.active_rule_id, 0);
    assert!(turn.elimination_window_end_timestamp > turn.elimination_window_start_timestamp);

    // No elimination votes are cast, so the sole finalist survives. Advance past
    // the elimination window and close it. The turn is still Open, so live-turn
    // validation passes even though the clock is beyond the turn cutoff.
    let mut clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    clock.unix_timestamp = turn.elimination_window_end_timestamp;
    context.set_sysvar(&clock);
    let mut close_accounts = accounts::CloseEliminationWindow {
        authority,
        global_config: pda(&[b"global_config"]),
        turn_state: turn_address,
    }
    .to_account_metas(None);
    close_accounts.push(AccountMeta::new(rule_address, false));
    process(
        &mut context,
        Instruction {
            program_id: idealer::ID,
            accounts: close_accounts,
            data: instruction::CloseEliminationWindow {}.data(),
        },
        &[],
    )
    .await
    .unwrap();
    let proposal: RuleProposal = read_anchor_account(&mut context, rule_address).await;
    assert_eq!(proposal.state, RuleState::SurvivedElimination);

    // Request and settle the active-rule election over the surviving finalist.
    let active_randomness_account = Pubkey::new_unique();
    process(
        &mut context,
        Instruction {
            program_id: idealer::ID,
            accounts: accounts::RequestActiveElectionVrf {
                authority,
                global_config: pda(&[b"global_config"]),
                turn_state: turn_address,
            }
            .to_account_metas(None),
            data: instruction::RequestActiveElectionVrf {
                randomness_account: active_randomness_account,
            }
            .data(),
        },
        &[],
    )
    .await
    .unwrap();

    let mut active_settle_accounts = accounts::SettleActiveElection {
        authority,
        global_config: pda(&[b"global_config"]),
        turn_state: turn_address,
    }
    .to_account_metas(None);
    active_settle_accounts.push(AccountMeta::new_readonly(rule_address, false));
    process(
        &mut context,
        Instruction {
            program_id: idealer::ID,
            accounts: active_settle_accounts,
            data: instruction::SettleActiveElection {
                args: SettleRuleElectionArgs {
                    randomness: [11; 32],
                    randomness_source: active_randomness_account,
                },
            }
            .data(),
        },
        &[],
    )
    .await
    .unwrap();

    let turn: TurnState = read_anchor_account(&mut context, turn_address).await;
    assert_eq!(turn.active_rule_id, rule_id);
    assert_eq!(
        turn.active_rule_hash,
        hash(b"Win if at least four numbers match.").to_bytes()
    );
    assert_eq!(turn.frozen_rule_artifact_hash, compiled_artifact_hash);
    assert_ne!(turn.finalist_set_hash, [0; 32]);
}

fn settle_draw_instruction(
    turn_id: u64,
    authority: Pubkey,
    randomness: [u8; 32],
    randomness_source: Pubkey,
) -> Instruction {
    Instruction {
        program_id: idealer::ID,
        accounts: accounts::SettleDraw {
            authority,
            global_config: pda(&[b"global_config"]),
            turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
        }
        .to_account_metas(None),
        data: instruction::SettleDraw {
            args: SettleDrawArgs {
                randomness,
                randomness_source,
            },
        }
        .data(),
    }
}

#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn draw_request_settle_and_failure_flow_persist_state() {
    let mut context = ProgramTest::new(
        "idealer",
        idealer::ID,
        processor!(process_idealer_instruction),
    )
    .start_with_context()
    .await;
    let turn_id = 1_u64;
    initialize_and_open_turn(&mut context, turn_id).await;
    let authority = context.payer.pubkey();
    let turn_address = pda(&[b"turn", &turn_id.to_le_bytes()]);
    let randomness_account = Pubkey::new_unique();

    advance_clock_to_turn_end(&mut context, turn_id).await;

    // Request the draw; it stays in `Requested` (delayed VRF) until settled.
    process(
        &mut context,
        request_draw_instruction(turn_id, authority, randomness_account),
        &[],
    )
    .await
    .unwrap();
    let turn: TurnState = read_anchor_account(&mut context, turn_address).await;
    assert_eq!(turn.draw_status, DrawStatus::Requested);
    assert_eq!(turn.draw_vrf_request, randomness_account);
    assert_eq!(turn.draw_result, [0; 6]);

    // Failure path: a requested draw can fail without corrupting turn state,
    // then be retried with a fresh randomness account.
    process(
        &mut context,
        Instruction {
            program_id: idealer::ID,
            accounts: accounts::FailDraw {
                authority,
                global_config: pda(&[b"global_config"]),
                turn_state: turn_address,
            }
            .to_account_metas(None),
            data: instruction::FailDraw { failure_code: 1 }.data(),
        },
        &[],
    )
    .await
    .unwrap();
    let turn: TurnState = read_anchor_account(&mut context, turn_address).await;
    assert_eq!(turn.draw_status, DrawStatus::Failed);
    assert_eq!(turn.draw_failure_code, 1);

    // Retry the draw with a new randomness account.
    let retry_account = Pubkey::new_unique();
    process(
        &mut context,
        request_draw_instruction(turn_id, authority, retry_account),
        &[],
    )
    .await
    .unwrap();
    let turn: TurnState = read_anchor_account(&mut context, turn_address).await;
    assert_eq!(turn.draw_status, DrawStatus::Requested);
    assert_eq!(turn.draw_vrf_request, retry_account);

    // A source mismatch is rejected.
    assert!(process(
        &mut context,
        settle_draw_instruction(turn_id, authority, [3u8; 32], Pubkey::new_unique()),
        &[],
    )
    .await
    .is_err());

    // Settle with the matching source and a revealed randomness value.
    process(
        &mut context,
        settle_draw_instruction(turn_id, authority, [3u8; 32], retry_account),
        &[],
    )
    .await
    .unwrap();
    let turn: TurnState = read_anchor_account(&mut context, turn_address).await;
    assert_eq!(turn.draw_status, DrawStatus::Fulfilled);
    assert_eq!(turn.draw_randomness, [3u8; 32]);
    assert_eq!(turn.draw_vrf_fulfillment, retry_account);
    let mut seen = std::collections::HashSet::new();
    for number in turn.draw_result {
        assert!((1..=100).contains(&number));
        assert!(seen.insert(number));
    }

    // Re-settling an already fulfilled draw is rejected.
    assert!(process(
        &mut context,
        settle_draw_instruction(turn_id, authority, [4u8; 32], retry_account),
        &[],
    )
    .await
    .is_err());
}

#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn invalid_guess_and_rule_proposal_are_rejected() {
    let mut context = ProgramTest::new(
        "idealer",
        idealer::ID,
        processor!(process_idealer_instruction),
    )
    .start_with_context()
    .await;
    let turn_id = 1_u64;
    initialize_and_open_turn(&mut context, turn_id).await;

    let player = Keypair::new();
    fund(&mut context, &player.pubkey()).await;
    assert!(
        submit_guess(&mut context, &player, turn_id, [1, 2, 3, 4, 5, 5])
            .await
            .is_err()
    );
    submit_guess(&mut context, &player, turn_id, [1, 2, 3, 4, 5, 6])
        .await
        .unwrap();

    let rule_id = 55_u64;
    let text = "Win with a mismatched commitment.".to_string();
    let invalid_proposal = Instruction {
        program_id: idealer::ID,
        accounts: accounts::ProposeRule {
            proposer: player.pubkey(),
            global_config: pda(&[b"global_config"]),
            turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
            game_token: pda(&[
                b"game_token",
                &turn_id.to_le_bytes(),
                player.pubkey().as_ref(),
            ]),
            rule_proposal: pda(&[b"rule", &turn_id.to_le_bytes(), &rule_id.to_le_bytes()]),
            treasury_vault: pda(&[b"treasury_vault"]),
            prize_vault: pda(&[b"prize_vault", &turn_id.to_le_bytes()]),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::ProposeRule {
            args: ProposeRuleArgs {
                rule_id,
                sanitized_text: text,
                sanitized_text_hash: [9; 32],
                normalized_text_hash: [2; 32],
                official_interpretation_hash: [3; 32],
                preflight_result_hash: [4; 32],
                token_count: 8,
            },
        }
        .data(),
    };
    assert!(process(&mut context, invalid_proposal, &[&player])
        .await
        .is_err());
}

fn record_claim_instruction(
    turn_id: u64,
    authority: Pubkey,
    claimant: Pubkey,
    kind: idealer::ClaimKind,
    amount_lamports: u64,
) -> Instruction {
    Instruction {
        program_id: idealer::ID,
        accounts: accounts::RecordClaim {
            authority,
            global_config: pda(&[b"global_config"]),
            turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
            claim: pda(&[
                b"claim",
                &turn_id.to_le_bytes(),
                claimant.as_ref(),
                &[kind as u8],
            ]),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::RecordClaim {
            args: idealer::RecordClaimArgs {
                turn_id,
                claimant,
                kind,
                amount_lamports,
            },
        }
        .data(),
    }
}

fn claim_prize_instruction(turn_id: u64, claimant: Pubkey) -> Instruction {
    Instruction {
        program_id: idealer::ID,
        accounts: accounts::ClaimPrize {
            claimant,
            global_config: pda(&[b"global_config"]),
            claim: pda(&[
                b"claim",
                &turn_id.to_le_bytes(),
                claimant.as_ref(),
                &[idealer::ClaimKind::WinnerPayout as u8],
            ]),
            prize_vault: pda(&[b"prize_vault", &turn_id.to_le_bytes()]),
        }
        .to_account_metas(None),
        data: instruction::ClaimPrize { turn_id }.data(),
    }
}

fn claim_reward_instruction(
    turn_id: u64,
    claimant: Pubkey,
    kind: idealer::ClaimKind,
) -> Instruction {
    Instruction {
        program_id: idealer::ID,
        accounts: accounts::ClaimReward {
            claimant,
            global_config: pda(&[b"global_config"]),
            claim: pda(&[
                b"claim",
                &turn_id.to_le_bytes(),
                claimant.as_ref(),
                &[kind as u8],
            ]),
            treasury_vault: pda(&[b"treasury_vault"]),
        }
        .to_account_metas(None),
        data: instruction::ClaimReward { turn_id, kind }.data(),
    }
}

async fn lamports_of(context: &mut ProgramTestContext, address: Pubkey) -> u64 {
    context
        .banks_client
        .get_account(address)
        .await
        .unwrap()
        .unwrap()
        .lamports
}

#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn claim_flow_records_and_pays_winner_and_reward() {
    let mut context = ProgramTest::new(
        "idealer",
        idealer::ID,
        processor!(process_idealer_instruction),
    )
    .start_with_context()
    .await;
    let turn_id = 1_u64;
    initialize_and_open_turn(&mut context, turn_id).await;
    let authority = context.payer.pubkey();

    // A guess funds the prize vault, then the draw is settled so claims can be
    // recorded.
    let player = Keypair::new();
    fund(&mut context, &player.pubkey()).await;
    submit_guess(&mut context, &player, turn_id, [1, 2, 3, 4, 5, 6])
        .await
        .unwrap();
    advance_clock_to_turn_end(&mut context, turn_id).await;
    let randomness_account = Pubkey::new_unique();
    process(
        &mut context,
        request_draw_instruction(turn_id, authority, randomness_account),
        &[],
    )
    .await
    .unwrap();
    process(
        &mut context,
        settle_draw_instruction(turn_id, authority, [3u8; 32], randomness_account),
        &[],
    )
    .await
    .unwrap();

    // A winner payout below the minimum claim threshold is rejected.
    assert!(process(
        &mut context,
        record_claim_instruction(
            turn_id,
            authority,
            player.pubkey(),
            idealer::ClaimKind::WinnerPayout,
            1_000_000,
        ),
        &[],
    )
    .await
    .is_err());

    // The authority records a valid winner payout.
    let payout = 6_000_000_u64;
    process(
        &mut context,
        record_claim_instruction(
            turn_id,
            authority,
            player.pubkey(),
            idealer::ClaimKind::WinnerPayout,
            payout,
        ),
        &[],
    )
    .await
    .unwrap();
    let claim_address = pda(&[
        b"claim",
        &turn_id.to_le_bytes(),
        player.pubkey().as_ref(),
        &[idealer::ClaimKind::WinnerPayout as u8],
    ]);
    let claim: idealer::Claim = read_anchor_account(&mut context, claim_address).await;
    assert_eq!(claim.status, idealer::ClaimState::Available);
    assert_eq!(claim.amount_lamports, payout);

    // Re-recording the same (turn, wallet, kind) tuple fails (idempotent init).
    assert!(process(
        &mut context,
        record_claim_instruction(
            turn_id,
            authority,
            player.pubkey(),
            idealer::ClaimKind::WinnerPayout,
            payout,
        ),
        &[],
    )
    .await
    .is_err());

    // A non-claimant wallet cannot pull the payout (its claim PDA does not exist).
    let stranger = Keypair::new();
    fund(&mut context, &stranger.pubkey()).await;
    assert!(process(
        &mut context,
        claim_prize_instruction(turn_id, stranger.pubkey()),
        &[&stranger],
    )
    .await
    .is_err());

    // The claimant pulls the winner payout from the prize vault.
    let before = lamports_of(&mut context, player.pubkey()).await;
    process(
        &mut context,
        claim_prize_instruction(turn_id, player.pubkey()),
        &[&player],
    )
    .await
    .unwrap();
    let after = lamports_of(&mut context, player.pubkey()).await;
    assert_eq!(after - before, payout);
    let claim: idealer::Claim = read_anchor_account(&mut context, claim_address).await;
    assert_eq!(claim.status, idealer::ClaimState::Claimed);

    // Double-claim is blocked by the Claimed flag.
    assert!(process(
        &mut context,
        claim_prize_instruction(turn_id, player.pubkey()),
        &[&player],
    )
    .await
    .is_err());

    // Creator/voter rewards are paid from the treasury vault. Fund it, record a
    // creator reward, and verify the wallet pulls it.
    let treasury_vault = pda(&[b"treasury_vault"]);
    fund(&mut context, &treasury_vault).await;
    let reward = 5_000_000_u64;
    process(
        &mut context,
        record_claim_instruction(
            turn_id,
            authority,
            player.pubkey(),
            idealer::ClaimKind::CreatorReward,
            reward,
        ),
        &[],
    )
    .await
    .unwrap();

    // The reward instruction rejects a winner-payout kind (kind mismatch).
    assert!(process(
        &mut context,
        claim_reward_instruction(turn_id, player.pubkey(), idealer::ClaimKind::WinnerPayout),
        &[&player],
    )
    .await
    .is_err());

    let before = lamports_of(&mut context, player.pubkey()).await;
    process(
        &mut context,
        claim_reward_instruction(turn_id, player.pubkey(), idealer::ClaimKind::CreatorReward),
        &[&player],
    )
    .await
    .unwrap();
    let after = lamports_of(&mut context, player.pubkey()).await;
    assert_eq!(after - before, reward);
}
