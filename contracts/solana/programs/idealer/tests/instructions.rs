use anchor_lang::{
    prelude::{Clock, Pubkey},
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use idealer::{
    accounts, instruction, InitializeGlobalConfigArgs, PlayerGuess, ProposeRuleArgs, RuleProposal,
    RuleVote, TurnState, TurnStatus,
};
use solana_account_info::AccountInfo;
use solana_program_error::ProgramResult;
use solana_program_test::{processor, BanksClientError, ProgramTest, ProgramTestContext};
use solana_sdk::{
    instruction::Instruction,
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
