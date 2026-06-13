use std::{
    env,
    error::Error,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use idealer::{
    accounts, instruction, GlobalConfig, InitializeGlobalConfigArgs, PlayerGuess, ProposeRuleArgs,
    RuleProposal, RuleVote, TurnState, TurnStatus,
};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    instruction::Instruction,
    signature::{read_keypair_file, Keypair, Signer},
    transaction::Transaction,
};
use solana_sha256_hasher::hash;
use solana_system_interface::program as system_program;

const PLAYER_BALANCE_LAMPORTS: u64 = 1_000_000_000;

fn pda(seeds: &[&[u8]]) -> solana_sdk::pubkey::Pubkey {
    solana_sdk::pubkey::Pubkey::find_program_address(seeds, &idealer::ID).0
}

fn read_account<T: AccountDeserialize>(
    rpc: &RpcClient,
    address: &solana_sdk::pubkey::Pubkey,
) -> Result<Option<T>, Box<dyn Error>> {
    match rpc.get_account(address) {
        Ok(account) => Ok(Some(T::try_deserialize(&mut account.data.as_slice())?)),
        Err(error) if error.to_string().contains("AccountNotFound") => Ok(None),
        Err(error) => Err(Box::new(error)),
    }
}

fn send(
    rpc: &RpcClient,
    payer: &Keypair,
    instruction: Instruction,
) -> Result<solana_sdk::signature::Signature, Box<dyn Error>> {
    let blockhash = rpc.get_latest_blockhash()?;
    let transaction = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&payer.pubkey()),
        &[payer],
        blockhash,
    );
    Ok(rpc.send_and_confirm_transaction(&transaction)?)
}

fn main() -> Result<(), Box<dyn Error>> {
    let rpc_url = env::var("IDEALER_DEVNET_RPC_URL")
        .unwrap_or_else(|_| "https://api.devnet.solana.com".to_string());
    let keypair_path = env::var_os("IDEALER_DEVNET_KEYPAIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from("/root/.config/idealer/devnet/idealer-deployer-keypair.json")
        });
    let payer = read_keypair_file(&keypair_path)
        .map_err(|error| format!("failed to read deployer keypair: {error}"))?;
    let rpc = RpcClient::new_with_commitment(rpc_url, CommitmentConfig::confirmed());

    let global_config = pda(&[b"global_config"]);
    let treasury_vault = pda(&[b"treasury_vault"]);

    if read_account::<GlobalConfig>(&rpc, &global_config)?.is_none() {
        let init_ix = Instruction {
            accounts: accounts::InitializeGlobalConfig {
                authority: payer.pubkey(),
                global_config,
                treasury_vault,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::InitializeGlobalConfig {
                args: InitializeGlobalConfigArgs {
                    treasury_address: payer.pubkey(),
                    draw_vrf_config: solana_sdk::pubkey::Pubkey::new_unique(),
                    election_vrf_config: solana_sdk::pubkey::Pubkey::new_unique(),
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
                    minimum_claim_threshold_lamports: 5_000,
                    claim_window_turns: 4,
                    claim_window_days: 7,
                    creator_reward_cap_lamports: 250_000_000,
                    min_votes_creator_self_remove: 100,
                    min_votes_third_party_remove: 250,
                },
            }
            .data(),
            program_id: idealer::ID,
        };
        println!("initialize_global_config {}", send(&rpc, &payer, init_ix)?);
    } else {
        println!("initialize_global_config skipped");
    }

    let mut config = read_account::<GlobalConfig>(&rpc, &global_config)?
        .ok_or("global config should exist after initialization")?;

    if config.has_active_turn {
        let active_turn_state = pda(&[b"turn", &config.active_turn_id.to_le_bytes()]);
        let active_turn = read_account::<TurnState>(&rpc, &active_turn_state)?
            .ok_or("active turn account is missing")?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| format!("system clock is before unix epoch: {error}"))?
            .as_secs() as i64;

        if active_turn.status == TurnStatus::Open && now >= active_turn.end_timestamp {
            let close_ix = Instruction {
                accounts: accounts::CloseTurn {
                    authority: payer.pubkey(),
                    global_config,
                    turn_state: active_turn_state,
                }
                .to_account_metas(None),
                data: instruction::CloseTurn {}.data(),
                program_id: idealer::ID,
            };
            println!("close_turn {}", send(&rpc, &payer, close_ix)?);
            config = read_account::<GlobalConfig>(&rpc, &global_config)?
                .ok_or("global config should exist after close_turn")?;
        }
    }

    let turn_id = if config.has_active_turn {
        config.active_turn_id
    } else {
        config.next_turn_id
    };
    let turn_state = pda(&[b"turn", &turn_id.to_le_bytes()]);
    let prize_vault = pda(&[b"prize_vault", &turn_id.to_le_bytes()]);

    if !config.has_active_turn {
        let open_ix = Instruction {
            accounts: accounts::OpenTurn {
                authority: payer.pubkey(),
                global_config,
                turn_state,
                prize_vault,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::OpenTurn { turn_id }.data(),
            program_id: idealer::ID,
        };
        println!("open_turn {}", send(&rpc, &payer, open_ix)?);
    } else {
        println!("open_turn skipped");
    }

    let player_guess = pda(&[b"guess", &turn_id.to_le_bytes(), payer.pubkey().as_ref()]);
    let game_token = pda(&[
        b"game_token",
        &turn_id.to_le_bytes(),
        payer.pubkey().as_ref(),
    ]);
    if read_account::<PlayerGuess>(&rpc, &player_guess)?.is_none() {
        let balance = rpc.get_balance(&payer.pubkey())?;
        if balance < PLAYER_BALANCE_LAMPORTS / 10 {
            return Err(format!("deployer balance is too low for smoke guess: {balance}").into());
        }
        let submit_ix = Instruction {
            accounts: accounts::SubmitGuess {
                player: payer.pubkey(),
                global_config,
                turn_state,
                player_guess,
                game_token,
                treasury_vault,
                prize_vault,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::SubmitGuess {
                numbers: [1, 2, 3, 4, 5, 6],
            }
            .data(),
            program_id: idealer::ID,
        };
        println!("submit_guess {}", send(&rpc, &payer, submit_ix)?);
    } else {
        println!("submit_guess skipped");
    }

    let rule_id = 1_u64;
    let rule_proposal = pda(&[b"rule", &turn_id.to_le_bytes(), &rule_id.to_le_bytes()]);
    if read_account::<RuleProposal>(&rpc, &rule_proposal)?.is_none() {
        let text = "Win if the submitted guess contains all six drawn numbers.";
        let propose_ix = Instruction {
            accounts: accounts::ProposeRule {
                proposer: payer.pubkey(),
                global_config,
                turn_state,
                game_token,
                rule_proposal,
                treasury_vault,
                prize_vault,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::ProposeRule {
                args: ProposeRuleArgs {
                    rule_id,
                    sanitized_text: text.to_string(),
                    sanitized_text_hash: hash(text.as_bytes()).to_bytes(),
                    normalized_text_hash: hash(text.to_lowercase().as_bytes()).to_bytes(),
                    official_interpretation_hash: [7; 32],
                    preflight_result_hash: [9; 32],
                    token_count: 11,
                },
            }
            .data(),
            program_id: idealer::ID,
        };
        println!("propose_rule {}", send(&rpc, &payer, propose_ix)?);
    } else {
        println!("propose_rule skipped");
    }

    let rule_vote = pda(&[
        b"vote",
        &turn_id.to_le_bytes(),
        &rule_id.to_le_bytes(),
        payer.pubkey().as_ref(),
    ]);
    if read_account::<RuleVote>(&rpc, &rule_vote)?.is_none() {
        let vote_ix = Instruction {
            accounts: accounts::VoteRule {
                voter: payer.pubkey(),
                global_config,
                turn_state,
                game_token,
                rule_proposal,
                rule_vote,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::VoteRule {}.data(),
            program_id: idealer::ID,
        };
        println!("vote_rule {}", send(&rpc, &payer, vote_ix)?);
    } else {
        println!("vote_rule skipped");
    }

    Ok(())
}
