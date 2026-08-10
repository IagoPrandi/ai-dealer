use anchor_lang::{
    prelude::{Clock, Pubkey},
    AccountDeserialize, AccountSerialize, InstructionData, ToAccountMetas,
};
use anchor_spl::{
    metadata::mpl_token_metadata,
    token::{spl_token, TokenAccount},
};
use tyche::{
    accounts, instruction, DrawStatus, GlobalConfig, TycheError, InitializeGlobalConfigArgs,
    PlayerGuess, PrecompilationStatus, PrecompileRuleArgs, PrizeVault, ProposeRuleArgs,
    ResetStaleVrfRequestArgs, RuleProposal, RuleState, RuleVote, SetVrfConfigArgs, SubmitGuessArgs,
    TreasuryVault, TurnState, TurnStatus, VoteRuleArgs, VrfStage,
};
use orao_solana_vrf::state::{
    FulfilledRequest as OraoFulfilledRequest, PendingRequest as OraoPendingRequest,
    RandomnessV2 as OraoRandomnessV2, RequestAccount as OraoRequestAccount,
};
use solana_account_info::AccountInfo;
use solana_program_error::ProgramResult;
use solana_program_test::{processor, BanksClientError, ProgramTest, ProgramTestContext};
use solana_sdk::{
    account::{Account, AccountSharedData},
    instruction::{AccountMeta, Instruction},
    signature::{Keypair, Signer},
    transaction::Transaction,
};
use solana_sha256_hasher::hash;
use solana_system_interface::{instruction as system_instruction, program as system_program};
use tokenomics_core::{
    accounts as tokenomics_accounts, domain as tokenomics_domain,
    instruction as tokenomics_instruction, CampaignReserve, CampaignRewardReceipt,
    InitializeGenesisArgs,
};

const PLAYER_BALANCE: u64 = 2_000_000_000;

// Switchboard On-Demand devnet program id (`ON_DEMAND_DEVNET_PID`). The program
// is built with `sb-devnet`, so its trustless owner check accepts randomness
// accounts owned by this program. Tests inject accounts with this owner.
const SWITCHBOARD_DEVNET_PID: &str = "Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2";

// Anchor `Discriminator` for `RandomnessAccountData` in switchboard-on-demand.
const RANDOMNESS_DISCRIMINATOR: [u8; 8] = [10, 66, 229, 135, 220, 239, 217, 114];

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &tyche::ID).0
}

fn tokenomics_pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &tokenomics_core::ID).0
}

fn tyche_program_data() -> Pubkey {
    Pubkey::find_program_address(&[tyche::ID.as_ref()], &tyche::UPGRADEABLE_LOADER_ID).0
}

fn program_data_account(upgrade_authority: Pubkey) -> Account {
    let mut data = vec![0; 45];
    data[0..4].copy_from_slice(&3u32.to_le_bytes());
    data[12] = 1;
    data[13..45].copy_from_slice(upgrade_authority.as_ref());
    Account {
        lamports: 10_000_000,
        data,
        owner: tyche::UPGRADEABLE_LOADER_ID,
        executable: false,
        rent_epoch: 0,
    }
}

/// Assert a processed instruction failed with the given Anchor custom error
/// (error codes start at 6000). Anchor maps `#[error_code]` variants in order.
fn assert_custom_error(result: Result<(), BanksClientError>, expected_code: u32) {
    use solana_sdk::instruction::InstructionError;
    use solana_sdk::transaction::TransactionError;
    match result {
        Err(BanksClientError::TransactionError(TransactionError::InstructionError(
            _,
            InstructionError::Custom(code),
        ))) => assert_eq!(code, expected_code, "unexpected custom error code"),
        other => panic!("expected custom error {expected_code}, got {other:?}"),
    }
}

fn switchboard_program_id() -> Pubkey {
    SWITCHBOARD_DEVNET_PID.parse().unwrap()
}

// Deterministic VRF queue pubkeys used by the test config. Fixed (not random)
// so randomness accounts can be pre-registered at genesis with a matching queue.
fn draw_queue() -> Pubkey {
    Pubkey::new_from_array([7u8; 32])
}

fn election_queue() -> Pubkey {
    Pubkey::new_from_array([8u8; 32])
}

fn tyche_program_test() -> ProgramTest {
    ProgramTest::new(
        "tyche",
        tyche::ID,
        processor!(process_tyche_instruction),
    )
}

/// Pre-register a Switchboard randomness account at genesis (counted in the bank
/// capitalization) so later `warp_to_slot` calls do not trip the accounts-hash
/// verification. Owned by the Switchboard program so the owner check passes.
fn add_randomness_account(program_test: &mut ProgramTest, pubkey: Pubkey, data: Vec<u8>) {
    program_test.add_account(
        pubkey,
        solana_sdk::account::Account {
            lamports: 10_000_000,
            data,
            owner: switchboard_program_id(),
            executable: false,
            rent_epoch: 0,
        },
    );
}

fn orao_randomness_account_data(request: OraoRequestAccount) -> Vec<u8> {
    let size = match &request {
        OraoRequestAccount::Pending(_) => OraoRandomnessV2::PENDING_SIZE,
        OraoRequestAccount::Fulfilled(_) => OraoRandomnessV2::FULFILLED_SIZE,
    };
    let mut data = vec![0; 8 + size];
    let mut output: &mut [u8] = &mut data;
    OraoRandomnessV2 { request }
        .try_serialize(&mut output)
        .unwrap();
    data
}

fn orao_account(data: Vec<u8>) -> Account {
    Account {
        lamports: 10_000_000,
        data,
        owner: orao_solana_vrf::ID,
        executable: false,
        rent_epoch: 0,
    }
}

/// Build raw account bytes for a Switchboard On-Demand `RandomnessAccountData`
/// in the exact `#[repr(C)]`/bytemuck layout the program parses on-chain:
/// discriminator(8) ++ authority(32) ++ queue(32) ++ seed_slothash(32) ++
/// seed_slot(8) ++ oracle(32) ++ reveal_slot(8) ++ value(32) ++ pad(224).
fn randomness_account_data(
    queue: Pubkey,
    seed_slot: u64,
    reveal_slot: u64,
    value: [u8; 32],
) -> Vec<u8> {
    let mut data = vec![0u8; 8 + 400];
    data[0..8].copy_from_slice(&RANDOMNESS_DISCRIMINATOR);
    data[8 + 32..8 + 64].copy_from_slice(queue.as_ref());
    data[8 + 96..8 + 104].copy_from_slice(&seed_slot.to_le_bytes());
    data[8 + 136..8 + 144].copy_from_slice(&reveal_slot.to_le_bytes());
    data[8 + 144..8 + 176].copy_from_slice(&value);
    data
}

/// Warp to a real bank slot (so `RandomnessAccountData::get_value` succeeds, as
/// it requires the current slot to equal the account's reveal slot) while
/// overriding the clock's unix timestamp (so turn-window gates still pass). The
/// warp fixes the slot; the follow-up `set_sysvar` only adjusts the timestamp.
async fn warp_with_timestamp(context: &mut ProgramTestContext, slot: u64, unix_timestamp: i64) {
    context.warp_to_slot(slot).unwrap();
    let mut clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    clock.unix_timestamp = unix_timestamp;
    context.set_sysvar(&clock);
}

fn process_tyche_instruction<'a, 'b, 'c, 'info>(
    program_id: &'a Pubkey,
    accounts: &'b [AccountInfo<'info>],
    instruction_data: &'c [u8],
) -> ProgramResult {
    // SAFETY: ProgramTest owns every AccountInfo for the full instruction invocation.
    // Anchor 0.32's generated entrypoint unnecessarily ties the slice borrow to the
    // AccountInfo lifetime, so this test-only adapter narrows the API mismatch.
    let anchor_accounts: &'info [AccountInfo<'info>] = unsafe { std::mem::transmute(accounts) };
    tyche::entry(program_id, anchor_accounts, instruction_data)
}

fn process_metadata_stub(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo<'_>],
    _instruction_data: &[u8],
) -> ProgramResult {
    Ok(())
}

fn test_config_args() -> InitializeGlobalConfigArgs {
    InitializeGlobalConfigArgs {
        treasury_address: Pubkey::new_unique(),
        draw_vrf_config: draw_queue(),
        election_vrf_config: election_queue(),
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
        max_rule_proposals_per_wallet_per_turn: 0,
        max_votes_per_wallet_per_turn: 0,
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

async fn initialize_global_config(context: &mut ProgramTestContext) {
    let global_config = pda(&[b"global_config"]);
    let treasury_vault = pda(&[b"treasury_vault"]);
    process(
        context,
        Instruction {
            program_id: tyche::ID,
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
}

async fn open_turn(context: &mut ProgramTestContext, turn_id: u64) {
    let global_config = pda(&[b"global_config"]);
    let turn_state = pda(&[b"turn", &turn_id.to_le_bytes()]);
    let prize_vault = pda(&[b"prize_vault", &turn_id.to_le_bytes()]);
    process(
        context,
        Instruction {
            program_id: tyche::ID,
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

async fn initialize_and_open_turn(context: &mut ProgramTestContext, turn_id: u64) {
    initialize_global_config(context).await;
    open_turn(context, turn_id).await;
}

#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn set_vrf_config_is_authority_gated_and_updates_global_config() {
    let governance_authority = Keypair::new();
    let unauthorized = Keypair::new();
    let wrong_program_data = Pubkey::new_unique();
    let mut test = ProgramTest::new(
        "tyche",
        tyche::ID,
        processor!(process_tyche_instruction),
    );
    test.add_account(
        tyche_program_data(),
        program_data_account(governance_authority.pubkey()),
    );
    test.add_account(
        wrong_program_data,
        program_data_account(governance_authority.pubkey()),
    );
    let mut context = test.start_with_context().await;
    initialize_global_config(&mut context).await;
    fund(&mut context, &governance_authority.pubkey()).await;
    fund(&mut context, &unauthorized.pubkey()).await;

    let global_config = pda(&[b"global_config"]);
    let old_config: GlobalConfig = read_anchor_account(&mut context, global_config).await;
    let new_draw_vrf_config = Pubkey::new_unique();
    let new_election_vrf_config = Pubkey::new_unique();

    process(
        &mut context,
        Instruction {
            program_id: tyche::ID,
            accounts: accounts::SetVrfConfig {
                governance_authority: governance_authority.pubkey(),
                global_config,
                program_data: tyche_program_data(),
            }
            .to_account_metas(None),
            data: instruction::SetVrfConfig {
                args: SetVrfConfigArgs {
                    draw_vrf_config: new_draw_vrf_config,
                    election_vrf_config: new_election_vrf_config,
                },
            }
            .data(),
        },
        &[&governance_authority],
    )
    .await
    .unwrap();

    let updated: GlobalConfig = read_anchor_account(&mut context, global_config).await;
    assert_eq!(updated.draw_vrf_config, new_draw_vrf_config);
    assert_eq!(updated.election_vrf_config, new_election_vrf_config);
    assert_ne!(updated.draw_vrf_config, old_config.draw_vrf_config);
    assert_ne!(updated.election_vrf_config, old_config.election_vrf_config);

    assert!(process(
        &mut context,
        Instruction {
            program_id: tyche::ID,
            accounts: accounts::SetVrfConfig {
                governance_authority: governance_authority.pubkey(),
                global_config,
                program_data: tyche_program_data(),
            }
            .to_account_metas(None),
            data: instruction::SetVrfConfig {
                args: SetVrfConfigArgs {
                    draw_vrf_config: Pubkey::default(),
                    election_vrf_config: new_election_vrf_config,
                },
            }
            .data(),
        },
        &[&governance_authority],
    )
    .await
    .is_err());

    assert!(process(
        &mut context,
        Instruction {
            program_id: tyche::ID,
            accounts: accounts::SetVrfConfig {
                governance_authority: unauthorized.pubkey(),
                global_config,
                program_data: tyche_program_data(),
            }
            .to_account_metas(None),
            data: instruction::SetVrfConfig {
                args: SetVrfConfigArgs {
                    draw_vrf_config: Pubkey::new_unique(),
                    election_vrf_config: Pubkey::new_unique(),
                },
            }
            .data(),
        },
        &[&unauthorized],
    )
    .await
    .is_err());

    assert!(process(
        &mut context,
        Instruction {
            program_id: tyche::ID,
            accounts: accounts::SetVrfConfig {
                governance_authority: governance_authority.pubkey(),
                global_config,
                program_data: wrong_program_data,
            }
            .to_account_metas(None),
            data: instruction::SetVrfConfig {
                args: SetVrfConfigArgs {
                    draw_vrf_config: Pubkey::new_unique(),
                    election_vrf_config: Pubkey::new_unique(),
                },
            }
            .data(),
        },
        &[&governance_authority],
    )
    .await
    .is_err());

    open_turn(&mut context, 1).await;
    assert!(process(
        &mut context,
        Instruction {
            program_id: tyche::ID,
            accounts: accounts::SetVrfConfig {
                governance_authority: governance_authority.pubkey(),
                global_config,
                program_data: tyche_program_data(),
            }
            .to_account_metas(None),
            data: instruction::SetVrfConfig {
                args: SetVrfConfigArgs {
                    draw_vrf_config: Pubkey::new_unique(),
                    election_vrf_config: Pubkey::new_unique(),
                },
            }
            .data(),
        },
        &[&governance_authority],
    )
    .await
    .is_err());
}

async fn submit_guess(
    context: &mut ProgramTestContext,
    player: &Keypair,
    turn_id: u64,
    numbers: [u8; 6],
) -> Result<(), BanksClientError> {
    submit_guess_with_sequence(context, player, turn_id, numbers, 1).await
}

async fn submit_guess_with_sequence(
    context: &mut ProgramTestContext,
    player: &Keypair,
    turn_id: u64,
    numbers: [u8; 6],
    sequence: u64,
) -> Result<(), BanksClientError> {
    if sequence > 1 {
        return process(
            context,
            Instruction {
                program_id: tyche::ID,
                accounts: accounts::SubmitAdditionalGuess {
                    player: player.pubkey(),
                    global_config: pda(&[b"global_config"]),
                    turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
                    player_guess: pda(&[
                        b"guess",
                        &turn_id.to_le_bytes(),
                        player.pubkey().as_ref(),
                        &sequence.to_le_bytes(),
                    ]),
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
                data: instruction::SubmitAdditionalGuess {
                    args: SubmitGuessArgs { numbers, sequence },
                }
                .data(),
            },
            &[player],
        )
        .await;
    }

    process(
        context,
        Instruction {
            program_id: tyche::ID,
            accounts: accounts::SubmitGuess {
                player: player.pubkey(),
                global_config: pda(&[b"global_config"]),
                turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
                player_guess: pda(&[
                    b"guess",
                    &turn_id.to_le_bytes(),
                    player.pubkey().as_ref(),
                    &sequence.to_le_bytes(),
                ]),
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
            data: instruction::SubmitGuess {
                args: SubmitGuessArgs { numbers, sequence },
            }
            .data(),
        },
        &[player],
    )
    .await
}

#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn core_instructions_execute_and_persist_state() {
    let mut context = ProgramTest::new(
        "tyche",
        tyche::ID,
        processor!(process_tyche_instruction),
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

    let guess_address = pda(&[
        b"guess",
        &turn_id.to_le_bytes(),
        player.pubkey().as_ref(),
        &1_u64.to_le_bytes(),
    ]);
    let guess: PlayerGuess = read_anchor_account(&mut context, guess_address).await;
    assert_eq!(guess.turn_id, turn_id);
    assert_eq!(guess.player, player.pubkey());
    assert_eq!(guess.sequence, 1);
    assert_eq!(guess.numbers, [1, 2, 3, 4, 5, 6]);

    let rule_id = 9_u64;
    let text = "Win if at least four numbers match.".to_string();
    let rule_address = pda(&[b"rule", &turn_id.to_le_bytes(), &rule_id.to_le_bytes()]);
    process(
        &mut context,
        Instruction {
            program_id: tyche::ID,
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
        &1_u64.to_le_bytes(),
    ]);
    let vote_instruction = Instruction {
        program_id: tyche::ID,
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
            treasury_vault: pda(&[b"treasury_vault"]),
            prize_vault: pda(&[b"prize_vault", &turn_id.to_le_bytes()]),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::VoteRule {
            args: VoteRuleArgs { sequence: 1 },
        }
        .data(),
    };
    process(&mut context, vote_instruction.clone(), &[&player])
        .await
        .unwrap();
    let vote: RuleVote = read_anchor_account(&mut context, vote_address).await;
    assert_eq!(vote.voter, player.pubkey());
    assert_eq!(vote.sequence, 1);
    assert_eq!(vote.fee_lamports, 0);
    let proposal: RuleProposal = read_anchor_account(&mut context, rule_address).await;
    assert_eq!(proposal.vote_count, 1);

    let second_vote_address = pda(&[
        b"vote",
        &turn_id.to_le_bytes(),
        &rule_id.to_le_bytes(),
        player.pubkey().as_ref(),
        &2_u64.to_le_bytes(),
    ]);
    let second_vote_instruction = Instruction {
        program_id: tyche::ID,
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
            rule_vote: second_vote_address,
            treasury_vault: pda(&[b"treasury_vault"]),
            prize_vault: pda(&[b"prize_vault", &turn_id.to_le_bytes()]),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::VoteRule {
            args: VoteRuleArgs { sequence: 2 },
        }
        .data(),
    };
    process(&mut context, second_vote_instruction.clone(), &[&player])
        .await
        .unwrap();
    let second_vote: RuleVote = read_anchor_account(&mut context, second_vote_address).await;
    assert_eq!(second_vote.sequence, 2);
    assert_eq!(second_vote.fee_lamports, 10_000_000);
    let proposal: RuleProposal = read_anchor_account(&mut context, rule_address).await;
    assert_eq!(proposal.vote_count, 2);
    let turn: TurnState =
        read_anchor_account(&mut context, pda(&[b"turn", &turn_id.to_le_bytes()])).await;
    let treasury: TreasuryVault =
        read_anchor_account(&mut context, pda(&[b"treasury_vault"])).await;
    let prize: PrizeVault =
        read_anchor_account(&mut context, pda(&[b"prize_vault", &turn_id.to_le_bytes()])).await;
    assert_eq!(turn.treasury_fee_amount_lamports, 500_000);
    assert_eq!(treasury.total_collected_lamports, 500_000);
    assert_eq!(turn.prize_pool_amount_lamports, 9_500_000);
    assert_eq!(prize.total_collected_lamports, 9_500_000);

    // Reusing the same sequence is idempotently rejected because that PDA is
    // already initialized; the next repeat must use sequence 3.
    // Warp to a new slot first so the retry is a distinct transaction; otherwise
    // the identical instruction reuses the same blockhash and banks returns the
    // cached success of the first vote instead of re-executing on-chain.
    let warp_clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    context.warp_to_slot(warp_clock.slot + 1).unwrap();
    assert!(process(&mut context, second_vote_instruction, &[&player])
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
            program_id: tyche::ID,
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
            program_id: tyche::ID,
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
        program_id: tyche::ID,
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
        "tyche",
        tyche::ID,
        processor!(process_tyche_instruction),
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

    // A third party cannot remove the creator's still-live rule.
    let rule_id = 5_u64;
    propose_rule(&mut context, &creator, turn_id, rule_id, "Win if odds win.")
        .await
        .unwrap();
    assert!(process(
        &mut context,
        remove_rule_instruction(turn_id, rule_id, third_party.pubkey()),
        &[&third_party],
    )
    .await
    .is_err());

    // The creator can remove their own still-live rule. Fee -> prize pool.
    let prize_vault = pda(&[b"prize_vault", &turn_id.to_le_bytes()]);
    let prize_before = read_anchor_account::<tyche::PrizeVault>(&mut context, prize_vault)
        .await
        .total_collected_lamports;

    process(
        &mut context,
        remove_rule_instruction(turn_id, rule_id, creator.pubkey()),
        &[&creator],
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
        creator.pubkey().as_ref(),
    ]);
    let removal: tyche::RuleRemoval = read_anchor_account(&mut context, removal_address).await;
    assert_eq!(removal.removal_kind, tyche::RuleRemovalKind::CreatorSelf);
    let prize_after = read_anchor_account::<tyche::PrizeVault>(&mut context, prize_vault)
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
    let cutoff_elapsed = i64::from(turn.turn_duration_seconds) * 7_500 / 10_000;
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
        program_id: tyche::ID,
        accounts: accounts::RequestDraw {
            authority,
            global_config: pda(&[b"global_config"]),
            turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
            randomness: randomness_account,
        }
        .to_account_metas(None),
        data: instruction::RequestDraw {}.data(),
    }
}

#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn rule_election_locks_requests_and_settles_active_rule() {
    let turn_id = 1_u64;
    // Pre-register the finalist-election and active-election Switchboard accounts
    // at genesis, each revealed at its settle slot, so warps do not trip the
    // accounts-hash verification.
    let election_randomness_account = Pubkey::new_unique();
    let election_seed_slot = 60u64;
    let election_reveal_slot = 100u64;
    let active_randomness_account = Pubkey::new_unique();
    let active_seed_slot = 70u64;
    let active_reveal_slot = 200u64;
    let mut program_test = tyche_program_test();
    add_randomness_account(
        &mut program_test,
        election_randomness_account,
        randomness_account_data(
            election_queue(),
            election_seed_slot,
            election_reveal_slot,
            [9; 32],
        ),
    );
    add_randomness_account(
        &mut program_test,
        active_randomness_account,
        randomness_account_data(
            election_queue(),
            active_seed_slot,
            active_reveal_slot,
            [11; 32],
        ),
    );
    let mut context = program_test.start_with_context().await;
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
            program_id: tyche::ID,
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
            program_id: tyche::ID,
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

    let authority = context.payer.pubkey();
    let turn_address = pda(&[b"turn", &turn_id.to_le_bytes()]);

    advance_clock_to_election_cutoff(&mut context, turn_id).await;
    let election_cutoff_ts = context
        .banks_client
        .get_sysvar::<Clock>()
        .await
        .unwrap()
        .unix_timestamp;

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
            program_id: tyche::ID,
            accounts: lock_accounts,
            data: instruction::LockRuleElectionPool {}.data(),
        },
        &[],
    )
    .await
    .unwrap();
    let turn: TurnState = read_anchor_account(&mut context, turn_address).await;
    assert_ne!(turn.eligible_rule_pool_hash, [0; 32]);
    assert_eq!(turn.election_vrf_request, Pubkey::default());
    let original_end_timestamp = turn.end_timestamp;

    // The shortlist VRF starts only after phase 1 closes and the eligible pool
    // is locked. Phase 2 starts later, when the finalist set is settled.
    process(
        &mut context,
        Instruction {
            program_id: tyche::ID,
            accounts: accounts::RequestRuleElectionVrf {
                authority,
                global_config: pda(&[b"global_config"]),
                turn_state: turn_address,
                randomness: election_randomness_account,
            }
            .to_account_metas(None),
            data: instruction::RequestRuleElectionVrf {}.data(),
        },
        &[],
    )
    .await
    .unwrap();
    let turn: TurnState = read_anchor_account(&mut context, turn_address).await;
    assert_eq!(turn.election_vrf_request, election_randomness_account);

    // Warp to the reveal slot with a small post-cutoff delay and settle the
    // finalist election from the verified Switchboard value. That delay should
    // shift the turn end so phase 2 keeps its full planned duration.
    let election_settle_ts = election_cutoff_ts + 2;
    warp_with_timestamp(&mut context, election_reveal_slot, election_settle_ts).await;
    let mut settle_accounts = accounts::SettleRuleElection {
        authority,
        global_config: pda(&[b"global_config"]),
        turn_state: turn_address,
        randomness: election_randomness_account,
    }
    .to_account_metas(None);
    settle_accounts.push(AccountMeta::new_readonly(rule_address, false));
    process(
        &mut context,
        Instruction {
            program_id: tyche::ID,
            accounts: settle_accounts,
            data: instruction::SettleRuleElection {}.data(),
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
    assert!(turn.end_timestamp > original_end_timestamp);
    // The elimination window now spans the whole of phase 2, so it closes at the
    // turn end rather than after a fixed sub-window.
    assert_eq!(turn.elimination_window_end_timestamp, turn.end_timestamp);
    assert_eq!(turn.finalist_approval_vote_counts[0], 0);

    // Shortlist finalists remain open to approval-side votes during phase 2.
    // Those votes update the frozen finalist approval tally used by
    // close_elimination_window, so players can defend a finalist as well as
    // vote it out.
    let shortlist_vote_address = pda(&[
        b"vote",
        &turn_id.to_le_bytes(),
        &rule_id.to_le_bytes(),
        player.pubkey().as_ref(),
        &1_u64.to_le_bytes(),
    ]);
    process(
        &mut context,
        Instruction {
            program_id: tyche::ID,
            accounts: accounts::VoteRule {
                voter: player.pubkey(),
                global_config: pda(&[b"global_config"]),
                turn_state: turn_address,
                game_token: pda(&[
                    b"game_token",
                    &turn_id.to_le_bytes(),
                    player.pubkey().as_ref(),
                ]),
                rule_proposal: rule_address,
                rule_vote: shortlist_vote_address,
                treasury_vault: pda(&[b"treasury_vault"]),
                prize_vault: pda(&[b"prize_vault", &turn_id.to_le_bytes()]),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::VoteRule {
                args: VoteRuleArgs { sequence: 1 },
            }
            .data(),
        },
        &[&player],
    )
    .await
    .unwrap();
    let turn: TurnState = read_anchor_account(&mut context, turn_address).await;
    assert_eq!(turn.finalist_approval_vote_counts[0], 1);

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
            program_id: tyche::ID,
            accounts: close_accounts,
            data: instruction::CloseEliminationWindow {}.data(),
        },
        &[],
    )
    .await
    .unwrap();
    let proposal: RuleProposal = read_anchor_account(&mut context, rule_address).await;
    assert_eq!(proposal.state, RuleState::SurvivedElimination);

    // Request the active-rule election over the surviving finalist using the
    // genesis-registered Switchboard account from the configured election queue.
    process(
        &mut context,
        Instruction {
            program_id: tyche::ID,
            accounts: accounts::RequestActiveElectionVrf {
                authority,
                global_config: pda(&[b"global_config"]),
                turn_state: turn_address,
                randomness: active_randomness_account,
            }
            .to_account_metas(None),
            data: instruction::RequestActiveElectionVrf {}.data(),
        },
        &[],
    )
    .await
    .unwrap();

    // Warp to the reveal slot and settle the active election from the verified
    // randomness. The turn is still Open, so live-turn validation passes.
    context.warp_to_slot(active_reveal_slot).unwrap();
    let mut active_settle_accounts = accounts::SettleActiveElection {
        authority,
        global_config: pda(&[b"global_config"]),
        turn_state: turn_address,
        randomness: active_randomness_account,
    }
    .to_account_metas(None);
    active_settle_accounts.push(AccountMeta::new_readonly(rule_address, false));
    process(
        &mut context,
        Instruction {
            program_id: tyche::ID,
            accounts: active_settle_accounts,
            data: instruction::SettleActiveElection {}.data(),
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

/// The settlement recovery escape hatch (`reset_stale_vrf_request`) must never
/// discard a still-live randomness request: if the recorded account still
/// exists on-chain, the reset is rejected. It also rejects a mismatched
/// randomness account. (The happy path — recorded account genuinely gone — is
/// exercised by the worker settlement unit test, since ProgramTest cannot
/// delete a genesis account mid-run.)
#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn reset_stale_vrf_request_refuses_a_live_or_mismatched_account() {
    let turn_id = 1_u64;
    let election_randomness_account = Pubkey::new_unique();
    let mut program_test = tyche_program_test();
    add_randomness_account(
        &mut program_test,
        election_randomness_account,
        randomness_account_data(election_queue(), 60, 100, [9; 32]),
    );
    let mut context = program_test.start_with_context().await;
    initialize_and_open_turn(&mut context, turn_id).await;

    let player = Keypair::new();
    fund(&mut context, &player.pubkey()).await;
    submit_guess(&mut context, &player, turn_id, [1, 2, 3, 4, 5, 6])
        .await
        .unwrap();

    // Propose + precompile a single eligible rule, then lock the pool.
    let rule_id = 70_u64;
    let text = "Win if at least four numbers match.".to_string();
    let rule_address = pda(&[b"rule", &turn_id.to_le_bytes(), &rule_id.to_le_bytes()]);
    process(
        &mut context,
        Instruction {
            program_id: tyche::ID,
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

    let authority = context.payer.pubkey();
    process(
        &mut context,
        Instruction {
            program_id: tyche::ID,
            accounts: accounts::PrecompileRule {
                authority,
                global_config: pda(&[b"global_config"]),
                turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
                rule_proposal: rule_address,
            }
            .to_account_metas(None),
            data: instruction::PrecompileRule {
                args: PrecompileRuleArgs {
                    compiled_artifact_hash: [8; 32],
                    passed: true,
                },
            }
            .data(),
        },
        &[],
    )
    .await
    .unwrap();

    let turn_address = pda(&[b"turn", &turn_id.to_le_bytes()]);
    advance_clock_to_election_cutoff(&mut context, turn_id).await;

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
            program_id: tyche::ID,
            accounts: lock_accounts,
            data: instruction::LockRuleElectionPool {}.data(),
        },
        &[],
    )
    .await
    .unwrap();

    // Reset before any request exists is rejected: nothing to clear.
    let reset_before_request = process(
        &mut context,
        reset_stale_vrf_instruction(
            turn_id,
            authority,
            election_randomness_account,
            VrfStage::FinalistElection,
        ),
        &[],
    )
    .await;
    assert_custom_error(
        reset_before_request,
        u32::from(TycheError::ElectionVrfNotRequested),
    );

    // Record the finalist VRF request pointing at the real, still-present account.
    process(
        &mut context,
        Instruction {
            program_id: tyche::ID,
            accounts: accounts::RequestRuleElectionVrf {
                authority,
                global_config: pda(&[b"global_config"]),
                turn_state: turn_address,
                randomness: election_randomness_account,
            }
            .to_account_metas(None),
            data: instruction::RequestRuleElectionVrf {}.data(),
        },
        &[],
    )
    .await
    .unwrap();

    // Passing a different account than the recorded one is rejected.
    let mismatched = process(
        &mut context,
        reset_stale_vrf_instruction(
            turn_id,
            authority,
            Pubkey::new_unique(),
            VrfStage::FinalistElection,
        ),
        &[],
    )
    .await;
    assert_custom_error(
        mismatched,
        u32::from(TycheError::RandomnessSourceMismatch),
    );

    // Passing the recorded account, which STILL EXISTS on-chain, is rejected:
    // the reset must never discard a live randomness request.
    let still_exists = process(
        &mut context,
        reset_stale_vrf_instruction(
            turn_id,
            authority,
            election_randomness_account,
            VrfStage::FinalistElection,
        ),
        &[],
    )
    .await;
    assert_custom_error(
        still_exists,
        u32::from(TycheError::RandomnessAccountStillExists),
    );

    // The recorded request slot is untouched by the rejected resets.
    let turn: TurnState = read_anchor_account(&mut context, turn_address).await;
    assert_eq!(turn.election_vrf_request, election_randomness_account);
}

fn reset_stale_vrf_instruction(
    turn_id: u64,
    authority: Pubkey,
    randomness_account: Pubkey,
    stage: VrfStage,
) -> Instruction {
    Instruction {
        program_id: tyche::ID,
        accounts: accounts::ResetStaleVrfRequest {
            authority,
            global_config: pda(&[b"global_config"]),
            turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
            randomness: randomness_account,
        }
        .to_account_metas(None),
        data: instruction::ResetStaleVrfRequest {
            args: ResetStaleVrfRequestArgs { stage },
        }
        .data(),
    }
}

fn settle_draw_instruction(
    turn_id: u64,
    authority: Pubkey,
    randomness_source: Pubkey,
) -> Instruction {
    Instruction {
        program_id: tyche::ID,
        accounts: accounts::SettleDraw {
            authority,
            global_config: pda(&[b"global_config"]),
            turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
            randomness: randomness_source,
        }
        .to_account_metas(None),
        data: instruction::SettleDraw {}.data(),
    }
}

#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn draw_request_settle_and_failure_flow_persist_state() {
    let turn_id = 1_u64;
    // Pre-register the Switchboard randomness accounts at genesis so the later
    // `warp_to_slot` does not trip the accounts-hash verification. The retry
    // account is revealed at the settle slot (100); the initial and wrong-queue
    // accounts are only used at request time.
    let randomness_account = Pubkey::new_unique();
    let first_seed_slot = 40u64;
    let wrong_queue_account = Pubkey::new_unique();
    let retry_account = Pubkey::new_unique();
    let retry_seed_slot = 50u64;
    let reveal_slot = 100u64;
    let reveal_value = [3u8; 32];
    let mut program_test = tyche_program_test();
    add_randomness_account(
        &mut program_test,
        randomness_account,
        randomness_account_data(draw_queue(), first_seed_slot, 0, [0; 32]),
    );
    add_randomness_account(
        &mut program_test,
        wrong_queue_account,
        randomness_account_data(Pubkey::new_unique(), 41, 0, [0; 32]),
    );
    add_randomness_account(
        &mut program_test,
        retry_account,
        randomness_account_data(draw_queue(), retry_seed_slot, reveal_slot, reveal_value),
    );
    let mut context = program_test.start_with_context().await;
    initialize_and_open_turn(&mut context, turn_id).await;
    let authority = context.payer.pubkey();
    let turn_address = pda(&[b"turn", &turn_id.to_le_bytes()]);
    let global_config = pda(&[b"global_config"]);

    advance_clock_to_turn_end(&mut context, turn_id).await;

    // Request the draw (Switchboard commit step). The randomness account is a
    // genuine-format Switchboard account from the configured draw queue; its
    // committed `seed_slot` is recorded for the trustless settle. It stays in
    // `Requested` until the revealed value is settled.
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
    assert_eq!(turn.draw_commit_slot, first_seed_slot);
    assert_eq!(turn.draw_result, [0; 6]);

    // A randomness account from a different queue is rejected at request time.
    assert!(process(
        &mut context,
        request_draw_instruction(turn_id, authority, wrong_queue_account),
        &[],
    )
    .await
    .is_err());

    // Failure path: a requested draw can fail without corrupting turn state,
    // then be retried with a fresh randomness account.
    process(
        &mut context,
        Instruction {
            program_id: tyche::ID,
            accounts: accounts::FailDraw {
                authority,
                global_config,
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
    assert_eq!(turn.draw_commit_slot, retry_seed_slot);

    // A source mismatch (an account that is not the one recorded at request) is
    // rejected before any value is read.
    assert!(process(
        &mut context,
        settle_draw_instruction(turn_id, authority, Pubkey::new_unique()),
        &[],
    )
    .await
    .is_err());

    // Warp to the reveal slot and settle. The program reads the value directly
    // from the Switchboard account (no authority-supplied value); `get_value`
    // only succeeds because the reveal slot equals the slot the settle executes
    // in.
    context.warp_to_slot(reveal_slot).unwrap();
    process(
        &mut context,
        settle_draw_instruction(turn_id, authority, retry_account),
        &[],
    )
    .await
    .unwrap();
    let turn: TurnState = read_anchor_account(&mut context, turn_address).await;
    assert_eq!(turn.draw_status, DrawStatus::Fulfilled);
    assert_eq!(turn.draw_randomness, reveal_value);
    assert_eq!(turn.draw_vrf_fulfillment, retry_account);
    let mut seen = std::collections::HashSet::new();
    for number in turn.draw_result {
        assert!((1..=100).contains(&number));
        assert!(seen.insert(number));
    }

    // Re-settling an already fulfilled draw is rejected. Warp to a fresh slot so
    // the retry is a distinct transaction rather than a cached one.
    context.warp_to_slot(reveal_slot + 1).unwrap();
    assert!(process(
        &mut context,
        settle_draw_instruction(turn_id, authority, retry_account),
        &[],
    )
    .await
    .is_err());
}

#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn orao_draw_request_is_persistent_and_settles_fulfilled_v2_randomness() {
    let turn_id = 1_u64;
    let governance_authority = Keypair::new();
    let mut test = tyche_program_test();
    test.add_account(
        tyche_program_data(),
        program_data_account(governance_authority.pubkey()),
    );
    let mut context = test.start_with_context().await;
    initialize_global_config(&mut context).await;
    fund(&mut context, &governance_authority.pubkey()).await;
    let authority = context.payer.pubkey();
    let global_config = pda(&[b"global_config"]);
    let turn_address = pda(&[b"turn", &turn_id.to_le_bytes()]);
    let network_state = tyche::expected_orao_network_state();

    process(
        &mut context,
        Instruction {
            program_id: tyche::ID,
            accounts: accounts::SetVrfConfig {
                governance_authority: governance_authority.pubkey(),
                global_config,
                program_data: tyche_program_data(),
            }
            .to_account_metas(None),
            data: instruction::SetVrfConfig {
                args: SetVrfConfigArgs {
                    draw_vrf_config: network_state,
                    election_vrf_config: network_state,
                },
            }
            .data(),
        },
        &[&governance_authority],
    )
    .await
    .unwrap();
    open_turn(&mut context, turn_id).await;

    let seed = [17; 32];
    let raw_randomness = [23; 64];
    let randomness_account =
        orao_solana_vrf::randomness_account_address(&orao_solana_vrf::ID, &seed);
    let pending = AccountSharedData::from(orao_account(orao_randomness_account_data(
        OraoRequestAccount::Pending(OraoPendingRequest {
            client: authority,
            seed,
            responses: vec![],
        }),
    )));
    context.set_account(&randomness_account, &pending);
    advance_clock_to_turn_end(&mut context, turn_id).await;

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
    assert_eq!(turn.draw_commit_slot, tyche::ORAO_COMMIT_MARKER);

    let failed = process(
        &mut context,
        Instruction {
            program_id: tyche::ID,
            accounts: accounts::FailDraw {
                authority,
                global_config,
                turn_state: turn_address,
            }
            .to_account_metas(None),
            data: instruction::FailDraw { failure_code: 1 }.data(),
        },
        &[],
    )
    .await;
    assert_custom_error(
        failed,
        u32::from(TycheError::PersistentRandomnessCannotBeReset),
    );

    let reset = process(
        &mut context,
        reset_stale_vrf_instruction(turn_id, authority, randomness_account, VrfStage::Draw),
        &[],
    )
    .await;
    assert_custom_error(
        reset,
        u32::from(TycheError::PersistentRandomnessCannotBeReset),
    );

    let fulfilled = AccountSharedData::from(orao_account(orao_randomness_account_data(
        OraoRequestAccount::Fulfilled(OraoFulfilledRequest {
            client: authority,
            seed,
            randomness: raw_randomness,
        }),
    )));
    context.set_account(&randomness_account, &fulfilled);
    process(
        &mut context,
        settle_draw_instruction(turn_id, authority, randomness_account),
        &[],
    )
    .await
    .unwrap();

    let turn: TurnState = read_anchor_account(&mut context, turn_address).await;
    assert_eq!(turn.draw_status, DrawStatus::Fulfilled);
    assert_eq!(turn.draw_randomness, hash(&raw_randomness).to_bytes());
    assert_eq!(turn.draw_vrf_fulfillment, randomness_account);
}

#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn invalid_guess_and_rule_proposal_are_rejected() {
    let mut context = ProgramTest::new(
        "tyche",
        tyche::ID,
        processor!(process_tyche_instruction),
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
        program_id: tyche::ID,
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
    kind: tyche::ClaimKind,
    amount_lamports: u64,
) -> Instruction {
    Instruction {
        program_id: tyche::ID,
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
            prize_vault: pda(&[b"prize_vault", &turn_id.to_le_bytes()]),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::RecordClaim {
            args: tyche::RecordClaimArgs {
                turn_id,
                claimant,
                kind,
                amount_lamports,
            },
        }
        .data(),
    }
}

fn expire_claim_instruction(turn_id: u64, authority: Pubkey, claimant: Pubkey) -> Instruction {
    Instruction {
        program_id: tyche::ID,
        accounts: accounts::ExpireClaim {
            authority,
            global_config: pda(&[b"global_config"]),
            claim: pda(&[
                b"claim",
                &turn_id.to_le_bytes(),
                claimant.as_ref(),
                &[tyche::ClaimKind::WinnerPayout as u8],
            ]),
            prize_vault: pda(&[b"prize_vault", &turn_id.to_le_bytes()]),
        }
        .to_account_metas(None),
        data: instruction::ExpireClaim {
            args: tyche::ExpireClaimArgs { turn_id, claimant },
        }
        .data(),
    }
}

fn claim_prize_instruction(turn_id: u64, claimant: Pubkey) -> Instruction {
    Instruction {
        program_id: tyche::ID,
        accounts: accounts::ClaimPrize {
            claimant,
            global_config: pda(&[b"global_config"]),
            claim: pda(&[
                b"claim",
                &turn_id.to_le_bytes(),
                claimant.as_ref(),
                &[tyche::ClaimKind::WinnerPayout as u8],
            ]),
            prize_vault: pda(&[b"prize_vault", &turn_id.to_le_bytes()]),
        }
        .to_account_metas(None),
        data: instruction::ClaimPrize { turn_id }.data(),
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
async fn claim_flow_pays_winner_and_rejects_legacy_sol_rewards() {
    let turn_id = 1_u64;
    // Pre-register the draw randomness account at genesis, revealed at the settle
    // slot, so the warp does not trip the accounts-hash verification.
    let randomness_account = Pubkey::new_unique();
    let draw_seed_slot = 40u64;
    let draw_reveal_slot = 100u64;
    let mut program_test = tyche_program_test();
    add_randomness_account(
        &mut program_test,
        randomness_account,
        randomness_account_data(draw_queue(), draw_seed_slot, draw_reveal_slot, [3u8; 32]),
    );
    let mut context = program_test.start_with_context().await;
    initialize_and_open_turn(&mut context, turn_id).await;
    let authority = context.payer.pubkey();

    // The first pre-turn-100 guess is free; a second sequenced guess funds the
    // prize vault before the draw is settled so claims can be recorded.
    let player = Keypair::new();
    fund(&mut context, &player.pubkey()).await;
    submit_guess(&mut context, &player, turn_id, [1, 2, 3, 4, 5, 6])
        .await
        .unwrap();
    submit_guess_with_sequence(&mut context, &player, turn_id, [7, 8, 9, 10, 11, 12], 2)
        .await
        .unwrap();
    advance_clock_to_turn_end(&mut context, turn_id).await;
    process(
        &mut context,
        request_draw_instruction(turn_id, authority, randomness_account),
        &[],
    )
    .await
    .unwrap();
    context.warp_to_slot(draw_reveal_slot).unwrap();
    process(
        &mut context,
        settle_draw_instruction(turn_id, authority, randomness_account),
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
            tyche::ClaimKind::WinnerPayout,
            1_000_000,
        ),
        &[],
    )
    .await
    .is_err());

    // A payout larger than the vault can back is rejected at record time
    // instead of stranding the winner behind a failing `claim_prize`.
    let prize_vault_address = pda(&[b"prize_vault", &turn_id.to_le_bytes()]);
    let unreserved = read_anchor_account::<tyche::PrizeVault>(&mut context, prize_vault_address)
        .await
        .total_collected_lamports;
    assert!(unreserved > 0);
    assert_custom_error(
        process(
            &mut context,
            record_claim_instruction(
                turn_id,
                authority,
                player.pubkey(),
                tyche::ClaimKind::WinnerPayout,
                unreserved + 1,
            ),
            &[],
        )
        .await,
        u32::from(TycheError::ClaimExceedsPrizeVault),
    );

    // The authority records a valid winner payout.
    let payout = 6_000_000_u64;
    process(
        &mut context,
        record_claim_instruction(
            turn_id,
            authority,
            player.pubkey(),
            tyche::ClaimKind::WinnerPayout,
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
        &[tyche::ClaimKind::WinnerPayout as u8],
    ]);
    let claim: tyche::Claim = read_anchor_account(&mut context, claim_address).await;
    assert_eq!(claim.status, tyche::ClaimState::Available);
    assert_eq!(claim.amount_lamports, payout);

    // Recording reserves the payout, so a second winner can only be recorded
    // against what is left: the vault cannot be over-committed by summing two
    // individually affordable claims.
    let remaining = unreserved - payout;
    let reserved_vault: tyche::PrizeVault =
        read_anchor_account(&mut context, prize_vault_address).await;
    assert_eq!(reserved_vault.total_collected_lamports, remaining);
    let second_winner = Keypair::new();
    fund(&mut context, &second_winner.pubkey()).await;
    assert_custom_error(
        process(
            &mut context,
            record_claim_instruction(
                turn_id,
                authority,
                second_winner.pubkey(),
                tyche::ClaimKind::WinnerPayout,
                remaining + 1,
            ),
            &[],
        )
        .await,
        u32::from(TycheError::ClaimExceedsPrizeVault),
    );

    // Re-recording the same (turn, wallet, kind) tuple fails (idempotent init).
    let clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    context.warp_to_slot(clock.slot + 1).unwrap();
    assert!(process(
        &mut context,
        record_claim_instruction(
            turn_id,
            authority,
            player.pubkey(),
            tyche::ClaimKind::WinnerPayout,
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
    let claim: tyche::Claim = read_anchor_account(&mut context, claim_address).await;
    assert_eq!(claim.status, tyche::ClaimState::Claimed);

    // Double-claim is blocked by the Claimed flag.
    let clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    context.warp_to_slot(clock.slot + 1).unwrap();
    assert!(process(
        &mut context,
        claim_prize_instruction(turn_id, player.pubkey()),
        &[&player],
    )
    .await
    .is_err());

    // Creator/voter rewards now belong exclusively to Tokenomics Core. The
    // legacy SOL claim recorder must reject them so the game treasury cannot
    // accrue a competing liability.
    let reward = 5_000_000_u64;
    let creator_reward = process(
        &mut context,
        record_claim_instruction(
            turn_id,
            authority,
            player.pubkey(),
            tyche::ClaimKind::CreatorReward,
            reward,
        ),
        &[],
    )
    .await;
    assert_custom_error(creator_reward, u32::from(TycheError::ClaimKindMismatch));

    // An abandoned payout must be releasable, otherwise its reservation pins the
    // lamports in a closed turn's vault forever and blocks every later rollover.
    let abandoned = read_anchor_account::<tyche::PrizeVault>(&mut context, prize_vault_address)
        .await
        .total_collected_lamports;
    assert!(abandoned > 0);
    process(
        &mut context,
        record_claim_instruction(
            turn_id,
            authority,
            second_winner.pubkey(),
            tyche::ClaimKind::WinnerPayout,
            abandoned,
        ),
        &[],
    )
    .await
    .unwrap();
    assert_eq!(
        read_anchor_account::<tyche::PrizeVault>(&mut context, prize_vault_address)
            .await
            .total_collected_lamports,
        0
    );

    // Inside the window the payout still belongs to its winner.
    assert_custom_error(
        process(
            &mut context,
            expire_claim_instruction(turn_id, authority, second_winner.pubkey()),
            &[],
        )
        .await,
        u32::from(TycheError::ClaimWindowStillOpen),
    );

    // Past the seven-day bound the reservation is released back to the vault.
    let mut clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    clock.unix_timestamp += tyche::CLAIM_WINDOW_SECONDS;
    context.set_sysvar(&clock);
    context.warp_to_slot(clock.slot + 1).unwrap();
    process(
        &mut context,
        expire_claim_instruction(turn_id, authority, second_winner.pubkey()),
        &[],
    )
    .await
    .unwrap();
    let expired_claim_address = pda(&[
        b"claim",
        &turn_id.to_le_bytes(),
        second_winner.pubkey().as_ref(),
        &[tyche::ClaimKind::WinnerPayout as u8],
    ]);
    let expired: tyche::Claim = read_anchor_account(&mut context, expired_claim_address).await;
    assert_eq!(expired.status, tyche::ClaimState::Expired);
    let released = read_anchor_account::<tyche::PrizeVault>(&mut context, prize_vault_address)
        .await
        .total_collected_lamports;
    assert_eq!(released, abandoned);
    // The vault now owes nothing, so its whole balance can roll forward.
    assert_eq!(
        lamports_of(&mut context, prize_vault_address).await - released,
        context.banks_client.get_rent().await.unwrap().minimum_balance(
            context
                .banks_client
                .get_account(prize_vault_address)
                .await
                .unwrap()
                .unwrap()
                .data
                .len()
        )
    );

    // Expiry is terminal: the payout cannot be pulled and cannot be released twice.
    let clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    context.warp_to_slot(clock.slot + 1).unwrap();
    assert_custom_error(
        process(
            &mut context,
            claim_prize_instruction(turn_id, second_winner.pubkey()),
            &[&second_winner],
        )
        .await,
        u32::from(TycheError::ClaimNotAvailable),
    );
    let clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    context.warp_to_slot(clock.slot + 1).unwrap();
    assert_custom_error(
        process(
            &mut context,
            expire_claim_instruction(turn_id, authority, second_winner.pubkey()),
            &[],
        )
        .await,
        u32::from(TycheError::ClaimNotAvailable),
    );

    // Only the authority may release an abandoned payout.
    let clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    context.warp_to_slot(clock.slot + 1).unwrap();
    assert!(process(
        &mut context,
        expire_claim_instruction(turn_id, stranger.pubkey(), player.pubkey()),
        &[&stranger],
    )
    .await
    .is_err());
}

fn close_turn_instruction(turn_id: u64, authority: Pubkey) -> Instruction {
    Instruction {
        program_id: tyche::ID,
        accounts: accounts::CloseTurn {
            authority,
            global_config: pda(&[b"global_config"]),
            turn_state: pda(&[b"turn", &turn_id.to_le_bytes()]),
        }
        .to_account_metas(None),
        data: instruction::CloseTurn {}.data(),
    }
}

fn sweep_prize_rollover_instruction(
    authority: Pubkey,
    source_turn_id: u64,
    destination_turn_id: u64,
    original_lamports: u64,
    alternative_lamports: u64,
) -> Instruction {
    Instruction {
        program_id: tyche::ID,
        accounts: accounts::SweepPrizeRollover {
            authority,
            global_config: pda(&[b"global_config"]),
            source_turn_state: pda(&[b"turn", &source_turn_id.to_le_bytes()]),
            source_prize_vault: pda(&[b"prize_vault", &source_turn_id.to_le_bytes()]),
            destination_turn_state: pda(&[b"turn", &destination_turn_id.to_le_bytes()]),
            destination_prize_vault: pda(&[b"prize_vault", &destination_turn_id.to_le_bytes()]),
        }
        .to_account_metas(None),
        data: instruction::SweepPrizeRollover {
            args: tyche::SweepPrizeRolloverArgs {
                source_turn_id,
                destination_turn_id,
                original_lamports,
                alternative_lamports,
            },
        }
        .data(),
    }
}

#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn sweep_prize_rollover_moves_lamports_into_the_open_turn_vault() {
    let mut context = tyche_program_test().start_with_context().await;
    let authority = context.payer.pubkey();
    let source_turn_id = 1_u64;
    let destination_turn_id = 2_u64;
    initialize_and_open_turn(&mut context, source_turn_id).await;

    // Fund the source vault: guess fees route their post-treasury share into
    // the turn-1 prize vault.
    let player = Keypair::new();
    fund(&mut context, &player.pubkey()).await;
    submit_guess(&mut context, &player, source_turn_id, [1, 2, 3, 4, 5, 6])
        .await
        .unwrap();
    submit_guess_with_sequence(
        &mut context,
        &player,
        source_turn_id,
        [7, 8, 9, 10, 11, 12],
        2,
    )
    .await
    .unwrap();

    let source_vault_address = pda(&[b"prize_vault", &source_turn_id.to_le_bytes()]);
    let destination_vault_address = pda(&[b"prize_vault", &destination_turn_id.to_le_bytes()]);
    let carried = read_anchor_account::<tyche::PrizeVault>(&mut context, source_vault_address)
        .await
        .total_collected_lamports;
    assert!(carried > 0);

    // The source-still-open and destination-not-open guards stay in the program
    // as defence in depth, but they are not exercised here: only one turn exists
    // at a time, so the destination's accounts do not exist until the source has
    // closed, and the account constraints reject the call first.
    advance_clock_to_turn_end(&mut context, source_turn_id).await;
    process(
        &mut context,
        close_turn_instruction(source_turn_id, authority),
        &[],
    )
    .await
    .unwrap();
    open_turn(&mut context, destination_turn_id).await;

    // The declared split must equal the whole unreserved source balance, so
    // off-chain accounting that disagrees with the chain fails loudly rather
    // than half-funding the destination pool.
    assert_custom_error(
        process(
            &mut context,
            sweep_prize_rollover_instruction(
                authority,
                source_turn_id,
                destination_turn_id,
                carried - 1,
                0,
            ),
            &[],
        )
        .await,
        u32::from(TycheError::RolloverAmountMismatch),
    );

    // Rollover only ever moves forward.
    assert_custom_error(
        process(
            &mut context,
            sweep_prize_rollover_instruction(
                authority,
                destination_turn_id,
                source_turn_id,
                0,
                0,
            ),
            &[],
        )
        .await,
        u32::from(TycheError::InvalidRolloverDirection),
    );

    // A vault that still owes a recorded payout cannot be swept: the reserved
    // lamports are physically present but are not the next turn's money, and
    // moving them would strand the winner behind an unpayable `claim_prize`.
    // (`record_claim` needs a fulfilled draw, so simulate the same condition by
    // adding bare lamports the vault's unreserved counter does not account for.)
    let stray_lamports = 1_234_567_u64;
    let mut stray_vault = context
        .banks_client
        .get_account(source_vault_address)
        .await
        .unwrap()
        .unwrap();
    stray_vault.lamports += stray_lamports;
    context.set_account(&source_vault_address, &stray_vault.into());
    assert_custom_error(
        process(
            &mut context,
            sweep_prize_rollover_instruction(
                authority,
                source_turn_id,
                destination_turn_id,
                carried,
                0,
            ),
            &[],
        )
        .await,
        u32::from(TycheError::PrizeVaultHasOutstandingClaims),
    );
    let mut healed_vault = context
        .banks_client
        .get_account(source_vault_address)
        .await
        .unwrap()
        .unwrap();
    healed_vault.lamports -= stray_lamports;
    context.set_account(&source_vault_address, &healed_vault.into());

    let source_lamports_before = lamports_of(&mut context, source_vault_address).await;
    let destination_lamports_before = lamports_of(&mut context, destination_vault_address).await;
    let original = carried / 2;
    let alternative = carried - original;
    process(
        &mut context,
        sweep_prize_rollover_instruction(
            authority,
            source_turn_id,
            destination_turn_id,
            original,
            alternative,
        ),
        &[],
    )
    .await
    .unwrap();

    // Lamports really moved, and the source keeps exactly its rent exemption.
    assert_eq!(
        source_lamports_before - lamports_of(&mut context, source_vault_address).await,
        carried
    );
    assert_eq!(
        lamports_of(&mut context, destination_vault_address).await - destination_lamports_before,
        carried
    );
    let source_vault: tyche::PrizeVault =
        read_anchor_account(&mut context, source_vault_address).await;
    assert_eq!(source_vault.total_collected_lamports, 0);
    let destination_vault: tyche::PrizeVault =
        read_anchor_account(&mut context, destination_vault_address).await;
    assert_eq!(destination_vault.total_collected_lamports, carried);
    let destination_turn: TurnState = read_anchor_account(
        &mut context,
        pda(&[b"turn", &destination_turn_id.to_le_bytes()]),
    )
    .await;
    assert_eq!(destination_turn.original_pool_rollover_lamports, original);
    assert_eq!(
        destination_turn.alternative_pool_rollover_lamports,
        alternative
    );

    // Replay: the drained source only accepts a 0/0 no-op, and that no-op moves
    // nothing, so a retrying operator cannot double-fund the destination.
    let clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    context.warp_to_slot(clock.slot + 1).unwrap();
    assert_custom_error(
        process(
            &mut context,
            sweep_prize_rollover_instruction(
                authority,
                source_turn_id,
                destination_turn_id,
                original,
                alternative,
            ),
            &[],
        )
        .await,
        u32::from(TycheError::RolloverAmountMismatch),
    );
    let clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    context.warp_to_slot(clock.slot + 1).unwrap();
    process(
        &mut context,
        sweep_prize_rollover_instruction(authority, source_turn_id, destination_turn_id, 0, 0),
        &[],
    )
    .await
    .unwrap();
    let destination_vault: tyche::PrizeVault =
        read_anchor_account(&mut context, destination_vault_address).await;
    assert_eq!(destination_vault.total_collected_lamports, carried);

    // A non-authority signer cannot move prize lamports between vaults.
    let stranger = Keypair::new();
    fund(&mut context, &stranger.pubkey()).await;
    assert!(process(
        &mut context,
        sweep_prize_rollover_instruction(
            stranger.pubkey(),
            source_turn_id,
            destination_turn_id,
            0,
            0,
        ),
        &[&stranger],
    )
    .await
    .is_err());
}

#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn proposal_reward_cpi_debits_campaign_and_creates_one_receipt() {
    let mut test = ProgramTest::new(
        "tyche",
        tyche::ID,
        processor!(process_tyche_instruction),
    );
    test.add_program("tokenomics_core", tokenomics_core::ID, None);
    test.prefer_bpf(false);
    test.add_program(
        "spl_token",
        spl_token::ID,
        processor!(spl_token::processor::Processor::process),
    );
    test.add_program(
        "mpl_token_metadata",
        mpl_token_metadata::ID,
        processor!(process_metadata_stub),
    );
    let mut context = test.start_with_context().await;

    let turn_id = 1_u64;
    initialize_and_open_turn(&mut context, turn_id).await;
    let global_config = pda(&[b"global_config"]);

    let mint = Keypair::new();
    let governance = context.payer.pubkey();
    let token_config = tokenomics_pda(&[b"token_config"]);
    let executor = tokenomics_pda(&[b"treasury_policy_executor"]);
    let treasury_reserve = tokenomics_pda(&[b"creator_treasury_reserve_vault"]);
    let treasury_escrow = tokenomics_pda(&[b"treasury_lock_escrow"]);
    let campaign_vault = tokenomics_pda(&[b"campaign_vault", &0u64.to_le_bytes()]);
    let campaign = tokenomics_pda(&[b"campaign", &0u64.to_le_bytes()]);
    let treasury_position = tokenomics_pda(&[b"lock_position", governance.as_ref()]);
    let distribution_vault = tokenomics_pda(&[b"distribution_vault"]);
    let treasury_sol_vault = tokenomics_pda(&[b"treasury_sol_vault"]);
    let correction_reserve = tokenomics_pda(&[b"correction_reserve_vault"]);
    let metadata = mpl_token_metadata::accounts::Metadata::find_pda(&mint.pubkey()).0;

    process(
        &mut context,
        Instruction {
            program_id: tokenomics_core::ID,
            accounts: tokenomics_accounts::InitializeGenesis {
                payer: governance,
                token_config,
                treasury_policy_executor: executor,
                mint: mint.pubkey(),
                metadata,
                governance,
                creator_treasury_reserve_vault: treasury_reserve,
                treasury_lock_escrow: treasury_escrow,
                initial_campaign_vault: campaign_vault,
                initial_campaign: campaign,
                treasury_lock_position: treasury_position,
                distribution_vault,
                treasury_sol_vault,
                correction_reserve_vault: correction_reserve,
                metadata_program: mpl_token_metadata::ID,
                token_program: spl_token::ID,
                system_program: system_program::ID,
                rent: solana_sdk::sysvar::rent::ID,
            }
            .to_account_metas(None),
            data: tokenomics_instruction::InitializeGenesis {
                args: InitializeGenesisArgs {
                    governance,
                    guardian: governance,
                    game_authority: global_config,
                    epoch_root_publisher: governance,
                    network: "devnet".to_owned(),
                    metadata_uri: "https://tyche.example/metadata/jdr.json".to_owned(),
                    initial_campaign_config_hash:
                        tokenomics_domain::CAMPAIGN_V2_ECONOMIC_CONFIG_HASH,
                    initial_unused_balance_policy_hash:
                        tokenomics_domain::CAMPAIGN_UNUSED_BALANCE_POLICY_HASH,
                },
            }
            .data(),
        },
        &[&mint],
    )
    .await
    .unwrap();

    let proposer = Keypair::new();
    fund(&mut context, &proposer.pubkey()).await;
    submit_guess(&mut context, &proposer, turn_id, [1, 2, 3, 4, 5, 6])
        .await
        .unwrap();
    let rule_id = 7_u64;
    propose_rule(
        &mut context,
        &proposer,
        turn_id,
        rule_id,
        "Win if the draw includes one.",
    )
    .await
    .unwrap();
    let rule_proposal = pda(&[b"rule", &turn_id.to_le_bytes(), &rule_id.to_le_bytes()]);

    let beneficiary_token_account = Keypair::new();
    let token_account_rent = context
        .banks_client
        .get_rent()
        .await
        .unwrap()
        .minimum_balance(TokenAccount::LEN);
    process(
        &mut context,
        system_instruction::create_account(
            &governance,
            &beneficiary_token_account.pubkey(),
            token_account_rent,
            TokenAccount::LEN as u64,
            &spl_token::ID,
        ),
        &[&beneficiary_token_account],
    )
    .await
    .unwrap();
    process(
        &mut context,
        spl_token::instruction::initialize_account3(
            &spl_token::ID,
            &beneficiary_token_account.pubkey(),
            &mint.pubkey(),
            &proposer.pubkey(),
        )
        .unwrap(),
        &[],
    )
    .await
    .unwrap();

    let reward_receipt = tokenomics_pda(&[
        b"campaign_reward",
        campaign.as_ref(),
        rule_proposal.as_ref(),
    ]);
    let settle_reward = Instruction {
        program_id: tyche::ID,
        accounts: accounts::SettleProposalTokenReward {
            payer: governance,
            global_config,
            rule_proposal,
            tokenomics_program: tokenomics_core::ID,
            token_config,
            mint: mint.pubkey(),
            campaign,
            campaign_vault,
            beneficiary_token_account: beneficiary_token_account.pubkey(),
            reward_receipt,
            token_program: spl_token::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::SettleProposalTokenReward {}.data(),
    };
    process(&mut context, settle_reward.clone(), &[])
        .await
        .unwrap();

    let beneficiary: TokenAccount =
        read_anchor_account(&mut context, beneficiary_token_account.pubkey()).await;
    assert_eq!(beneficiary.amount, tokenomics_domain::PROPOSAL_REWARD_ATOMS);
    assert_eq!(beneficiary.owner, proposer.pubkey());

    let receipt: CampaignRewardReceipt = read_anchor_account(&mut context, reward_receipt).await;
    assert_eq!(receipt.action_id, rule_proposal.to_bytes());
    assert_eq!(receipt.beneficiary, proposer.pubkey());
    assert_eq!(receipt.paid_atoms, tokenomics_domain::PROPOSAL_REWARD_ATOMS);
    assert!(!receipt.final_partial);

    let campaign_state: CampaignReserve = read_anchor_account(&mut context, campaign).await;
    assert_eq!(
        campaign_state.remaining_atoms,
        tokenomics_domain::INITIAL_CAMPAIGN_ATOMS - tokenomics_domain::PROPOSAL_REWARD_ATOMS
    );
    assert_eq!(
        campaign_state.cumulative_distributed_atoms,
        tokenomics_domain::PROPOSAL_REWARD_ATOMS
    );

    // The receipt PDA uses `init`, so replay is rejected before another debit.
    assert!(process(&mut context, settle_reward, &[]).await.is_err());
    let campaign_after_replay: CampaignReserve = read_anchor_account(&mut context, campaign).await;
    assert_eq!(
        campaign_after_replay.cumulative_distributed_atoms,
        tokenomics_domain::PROPOSAL_REWARD_ATOMS
    );
}
