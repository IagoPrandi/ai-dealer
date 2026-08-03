use anchor_lang::{
    prelude::{Clock, Pubkey},
    AccountDeserialize, InstructionData, ToAccountMetas,
};
use anchor_spl::metadata::mpl_token_metadata;
use anchor_spl::token::{spl_token, Mint, TokenAccount};
use solana_account_info::AccountInfo;
use solana_program_error::ProgramResult;
use solana_program_test::{processor, BanksClientError, ProgramTest, ProgramTestContext};
use solana_sdk::{
    account::AccountSharedData,
    instruction::Instruction,
    signature::{Keypair, Signer},
    sysvar,
    transaction::Transaction,
};
use solana_system_interface::program as system_program;
use tokenomics_core::{
    accounts, domain, instruction, CampaignReserve, DistributionEpoch, EpochStatus,
    InitializeGenesisArgs, LockPosition, PublishProvisionalRootArgs, TokenConfig,
    TreasurySolVaultRecord,
};

fn pda(seeds: &[&[u8]]) -> Pubkey {
    Pubkey::find_program_address(seeds, &tokenomics_core::ID).0
}

#[cfg(feature = "devnet-campaign-v2-migration")]
#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn governed_initial_campaign_migration_changes_only_the_economic_hash_once() {
    let mut context = tokenomics_program_test().start_with_context().await;
    let authority = context.payer.pubkey();
    let fixture = GenesisFixture::new(authority);
    initialize_genesis(&mut context, &fixture, Pubkey::new_unique()).await;

    let campaign_account = context
        .banks_client
        .get_account(fixture.campaign)
        .await
        .unwrap()
        .unwrap();
    let mut legacy_data = campaign_account.data.clone();
    legacy_data[105..137].copy_from_slice(&domain::INITIAL_CAMPAIGN_V1_ECONOMIC_CONFIG_HASH);
    let mut legacy_account = AccountSharedData::from(campaign_account);
    legacy_account.set_data_from_slice(&legacy_data);
    context.set_account(&fixture.campaign, &legacy_account);

    let legacy_campaign: CampaignReserve =
        read_anchor_account(&mut context, fixture.campaign).await;
    let vault_before = read_token_account(&mut context, fixture.campaign_vault).await;
    assert_eq!(
        legacy_campaign.economic_config_hash,
        domain::INITIAL_CAMPAIGN_V1_ECONOMIC_CONFIG_HASH
    );

    let migration = Instruction {
        program_id: tokenomics_core::ID,
        accounts: accounts::MigrateInitialCampaignToV2 {
            governance: authority,
            token_config: fixture.token_config,
            campaign: fixture.campaign,
            campaign_vault: fixture.campaign_vault,
        }
        .to_account_metas(None),
        data: instruction::MigrateInitialCampaignToV2 {}.data(),
    };
    process(&mut context, migration.clone(), &[]).await.unwrap();

    let migrated_campaign: CampaignReserve =
        read_anchor_account(&mut context, fixture.campaign).await;
    let vault_after = read_token_account(&mut context, fixture.campaign_vault).await;
    assert_eq!(
        migrated_campaign.economic_config_hash,
        domain::CAMPAIGN_V2_ECONOMIC_CONFIG_HASH
    );
    assert_eq!(
        migrated_campaign.original_allocation_atoms,
        legacy_campaign.original_allocation_atoms
    );
    assert_eq!(
        migrated_campaign.cumulative_distributed_atoms,
        legacy_campaign.cumulative_distributed_atoms
    );
    assert_eq!(
        migrated_campaign.remaining_atoms,
        legacy_campaign.remaining_atoms
    );
    assert_eq!(vault_after.amount, vault_before.amount);
    let clock = context.banks_client.get_sysvar::<Clock>().await.unwrap();
    context.warp_to_slot(clock.slot + 1).unwrap();
    assert!(process(&mut context, migration, &[]).await.is_err());
}

fn process_tokenomics_instruction<'a, 'b, 'c, 'info>(
    program_id: &'a Pubkey,
    accounts: &'b [AccountInfo<'info>],
    instruction_data: &'c [u8],
) -> ProgramResult {
    // SAFETY: ProgramTest owns every AccountInfo for the full invocation. Anchor
    // 0.32's entrypoint unnecessarily ties the slice borrow to that lifetime.
    let anchor_accounts: &'info [AccountInfo<'info>] = unsafe { std::mem::transmute(accounts) };
    tokenomics_core::entry(program_id, anchor_accounts, instruction_data)
}

fn tokenomics_program_test() -> ProgramTest {
    let mut test = ProgramTest::new(
        "tokenomics_core",
        tokenomics_core::ID,
        processor!(process_tokenomics_instruction),
    );
    test.prefer_bpf(false);
    test.add_program(
        "spl_token",
        spl_token::ID,
        processor!(spl_token::processor::Processor::process),
    );
    // The production instruction CPIs to the audited Metaplex program. The SBF
    // harness uses a test-only success processor because ProgramTest does not
    // ship the external Metaplex executable; address/account constraints and
    // the finalized devnet rehearsal verify the real CPI.
    test.add_program(
        "mpl_token_metadata",
        mpl_token_metadata::ID,
        processor!(process_metadata_stub),
    );
    test.prefer_bpf(true);
    test
}

fn process_metadata_stub(
    _program_id: &Pubkey,
    _accounts: &[AccountInfo<'_>],
    _instruction_data: &[u8],
) -> ProgramResult {
    Ok(())
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

async fn read_mint(context: &mut ProgramTestContext, address: Pubkey) -> Mint {
    read_anchor_account(context, address).await
}

async fn read_token_account(context: &mut ProgramTestContext, address: Pubkey) -> TokenAccount {
    read_anchor_account(context, address).await
}

struct GenesisFixture {
    campaign: Pubkey,
    campaign_vault: Pubkey,
    correction_reserve: Pubkey,
    distribution_vault: Pubkey,
    executor: Pubkey,
    mint: Keypair,
    metadata: Pubkey,
    token_config: Pubkey,
    treasury_escrow: Pubkey,
    treasury_position: Pubkey,
    treasury_reserve: Pubkey,
    treasury_sol_vault: Pubkey,
}

impl GenesisFixture {
    fn new(governance: Pubkey) -> Self {
        let mint = Keypair::new();
        Self {
            campaign: pda(&[b"campaign", &0u64.to_le_bytes()]),
            campaign_vault: pda(&[b"campaign_vault", &0u64.to_le_bytes()]),
            correction_reserve: pda(&[b"correction_reserve_vault"]),
            distribution_vault: pda(&[b"distribution_vault"]),
            executor: pda(&[b"treasury_policy_executor"]),
            metadata: mpl_token_metadata::accounts::Metadata::find_pda(&mint.pubkey()).0,
            mint,
            token_config: pda(&[b"token_config"]),
            treasury_escrow: pda(&[b"treasury_lock_escrow"]),
            treasury_position: pda(&[b"lock_position", governance.as_ref()]),
            treasury_reserve: pda(&[b"creator_treasury_reserve_vault"]),
            treasury_sol_vault: pda(&[b"treasury_sol_vault"]),
        }
    }
}

async fn initialize_genesis(
    context: &mut ProgramTestContext,
    fixture: &GenesisFixture,
    guardian: Pubkey,
) {
    let authority = context.payer.pubkey();
    let metadata_uri = "https://metadata.example/jdr.json".to_owned();
    process(
        context,
        Instruction {
            program_id: tokenomics_core::ID,
            accounts: accounts::InitializeGenesis {
                payer: authority,
                token_config: fixture.token_config,
                treasury_policy_executor: fixture.executor,
                mint: fixture.mint.pubkey(),
                metadata: fixture.metadata,
                governance: authority,
                creator_treasury_reserve_vault: fixture.treasury_reserve,
                treasury_lock_escrow: fixture.treasury_escrow,
                initial_campaign_vault: fixture.campaign_vault,
                initial_campaign: fixture.campaign,
                treasury_lock_position: fixture.treasury_position,
                distribution_vault: fixture.distribution_vault,
                treasury_sol_vault: fixture.treasury_sol_vault,
                correction_reserve_vault: fixture.correction_reserve,
                metadata_program: mpl_token_metadata::ID,
                token_program: spl_token::ID,
                system_program: system_program::ID,
                rent: sysvar::rent::ID,
            }
            .to_account_metas(None),
            data: instruction::InitializeGenesis {
                args: InitializeGenesisArgs {
                    governance: authority,
                    guardian,
                    game_authority: authority,
                    epoch_root_publisher: authority,
                    network: "devnet".to_owned(),
                    metadata_uri,
                    initial_campaign_config_hash: domain::CAMPAIGN_V2_ECONOMIC_CONFIG_HASH,
                    initial_unused_balance_policy_hash: domain::CAMPAIGN_UNUSED_BALANCE_POLICY_HASH,
                },
            }
            .data(),
        },
        &[&fixture.mint],
    )
    .await
    .unwrap();
}

#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn genesis_revokes_authorities_and_pause_keeps_treasury_unlock_open() {
    let guardian = Keypair::new();
    let mut context = tokenomics_program_test().start_with_context().await;
    let authority = context.payer.pubkey();
    let fixture = GenesisFixture::new(authority);
    initialize_genesis(&mut context, &fixture, guardian.pubkey()).await;

    let mint = read_mint(&mut context, fixture.mint.pubkey()).await;
    assert_eq!(mint.supply, domain::FIXED_SUPPLY_ATOMS);
    assert!(mint.mint_authority.is_none());
    assert!(mint.freeze_authority.is_none());
    let config: TokenConfig = read_anchor_account(&mut context, fixture.token_config).await;
    assert_eq!(config.metadata, fixture.metadata);
    assert_eq!(config.metadata_update_authority, authority);
    assert_eq!(config.metadata_uri, "https://metadata.example/jdr.json");
    assert!(config.metadata_mutable);

    let campaign_vault = read_token_account(&mut context, fixture.campaign_vault).await;
    let treasury_escrow = read_token_account(&mut context, fixture.treasury_escrow).await;
    let treasury_reserve = read_token_account(&mut context, fixture.treasury_reserve).await;
    assert_eq!(campaign_vault.amount, domain::INITIAL_CAMPAIGN_ATOMS);
    assert_eq!(treasury_escrow.amount, domain::CREATOR_TREASURY_ATOMS);
    assert_eq!(treasury_reserve.amount, 0);
    assert_eq!(
        campaign_vault.amount + treasury_escrow.amount,
        domain::FIXED_SUPPLY_ATOMS
    );

    let campaign: CampaignReserve = read_anchor_account(&mut context, fixture.campaign).await;
    assert_eq!(campaign.remaining_atoms, domain::INITIAL_CAMPAIGN_ATOMS);
    let position: LockPosition = read_anchor_account(&mut context, fixture.treasury_position).await;
    assert!(position.is_treasury);
    assert_eq!(position.locked_atoms, domain::CREATOR_TREASURY_ATOMS);
    assert_eq!(position.return_token_account, fixture.treasury_reserve);
    assert_eq!(position.sol_claim_beneficiary, fixture.treasury_sol_vault);

    let second_mint = spl_token::instruction::mint_to(
        &spl_token::ID,
        &fixture.mint.pubkey(),
        &fixture.campaign_vault,
        &context.payer.pubkey(),
        &[],
        1,
    )
    .unwrap();
    assert!(process(&mut context, second_mint, &[]).await.is_err());

    process(
        &mut context,
        solana_system_interface::instruction::transfer(&authority, &guardian.pubkey(), 1_000_000),
        &[],
    )
    .await
    .unwrap();
    process(
        &mut context,
        Instruction {
            program_id: tokenomics_core::ID,
            accounts: accounts::Pause {
                guardian: guardian.pubkey(),
                token_config: fixture.token_config,
            }
            .to_account_metas(None),
            data: instruction::Pause {}.data(),
        },
        &[&guardian],
    )
    .await
    .unwrap();

    assert!(process(
        &mut context,
        Instruction {
            program_id: tokenomics_core::ID,
            accounts: accounts::AnnounceUnpause {
                governance: authority,
                token_config: fixture.token_config,
            }
            .to_account_metas(None),
            data: instruction::AnnounceUnpause {
                incident_record_hash: [0; 32],
            }
            .data(),
        },
        &[],
    )
    .await
    .is_err());

    let epoch = pda(&[b"epoch", &0u64.to_le_bytes()]);
    assert!(process(
        &mut context,
        Instruction {
            program_id: tokenomics_core::ID,
            accounts: accounts::OpenDistributionEpoch {
                publisher: authority,
                token_config: fixture.token_config,
                epoch,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::OpenDistributionEpoch {
                epoch_id: 0,
                first_turn_id: 1,
            }
            .data(),
        },
        &[],
    )
    .await
    .is_err());

    let unlock_atoms = domain::TOKEN_ATOMS_PER_TOKEN;
    process(
        &mut context,
        Instruction {
            program_id: tokenomics_core::ID,
            accounts: accounts::UnlockTokens {
                unlock_authority: authority,
                token_config: fixture.token_config,
                mint: fixture.mint.pubkey(),
                lock_position: fixture.treasury_position,
                treasury_lock_escrow: fixture.treasury_escrow,
                return_token_account: fixture.treasury_reserve,
                token_program: spl_token::ID,
            }
            .to_account_metas(None),
            data: instruction::UnlockTokens {
                amount_atoms: unlock_atoms,
            }
            .data(),
        },
        &[],
    )
    .await
    .unwrap();
    let position: LockPosition = read_anchor_account(&mut context, fixture.treasury_position).await;
    let treasury_reserve = read_token_account(&mut context, fixture.treasury_reserve).await;
    assert_eq!(
        position.locked_atoms,
        domain::CREATOR_TREASURY_ATOMS - unlock_atoms
    );
    assert_eq!(treasury_reserve.amount, unlock_atoms);

    process(
        &mut context,
        Instruction {
            program_id: tokenomics_core::ID,
            accounts: accounts::AnnounceUnpause {
                governance: authority,
                token_config: fixture.token_config,
            }
            .to_account_metas(None),
            data: instruction::AnnounceUnpause {
                incident_record_hash: [3; 32],
            }
            .data(),
        },
        &[],
    )
    .await
    .unwrap();
    assert!(process(
        &mut context,
        Instruction {
            program_id: tokenomics_core::ID,
            accounts: accounts::AnnounceUnpause {
                governance: authority,
                token_config: fixture.token_config,
            }
            .to_account_metas(None),
            data: instruction::Unpause {}.data(),
        },
        &[],
    )
    .await
    .is_err());
}

#[tokio::test]
#[ignore = "requires an SBF build and SBF_OUT_DIR; run the explicit SBF integration suite"]
async fn epoch_seals_and_treasury_claim_pays_only_the_fixed_vault_once() {
    let mut context = tokenomics_program_test().start_with_context().await;
    let fixture = GenesisFixture::new(context.payer.pubkey());
    initialize_genesis(&mut context, &fixture, Pubkey::new_unique()).await;
    let authority = context.payer.pubkey();
    let epoch_address = pda(&[b"epoch", &0u64.to_le_bytes()]);

    process(
        &mut context,
        Instruction {
            program_id: tokenomics_core::ID,
            accounts: accounts::OpenDistributionEpoch {
                publisher: authority,
                token_config: fixture.token_config,
                epoch: epoch_address,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::OpenDistributionEpoch {
                epoch_id: 0,
                first_turn_id: 1,
            }
            .data(),
        },
        &[],
    )
    .await
    .unwrap();

    let deposit = 10_000_000u64;
    process(
        &mut context,
        Instruction {
            program_id: tokenomics_core::ID,
            accounts: accounts::DepositTreasuryFee {
                fee_payer: authority,
                game_authority: authority,
                token_config: fixture.token_config,
                epoch: epoch_address,
                distribution_vault: fixture.distribution_vault,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::DepositTreasuryFee {
                turn_id: 1,
                amount_lamports: deposit,
            }
            .data(),
        },
        &[],
    )
    .await
    .unwrap();
    process(
        &mut context,
        Instruction {
            program_id: tokenomics_core::ID,
            accounts: accounts::CloseEpochCollection {
                game_authority: authority,
                token_config: fixture.token_config,
                epoch: epoch_address,
            }
            .to_account_metas(None),
            data: instruction::CloseEpochCollection {
                last_completed_turn_id: 7,
            }
            .data(),
        },
        &[],
    )
    .await
    .unwrap();

    let claim_amount = 9_000_000u64;
    let root = domain::distribution_leaf_hash(
        &tokenomics_core::ID,
        b"devnet",
        0,
        &fixture.treasury_position,
        &fixture.treasury_sol_vault,
        claim_amount,
    )
    .unwrap();
    process(
        &mut context,
        Instruction {
            program_id: tokenomics_core::ID,
            accounts: accounts::PublishProvisionalRoot {
                publisher: authority,
                token_config: fixture.token_config,
                epoch: epoch_address,
                distribution_vault: fixture.distribution_vault,
                correction_reserve_vault: fixture.correction_reserve,
            }
            .to_account_metas(None),
            data: instruction::PublishProvisionalRoot {
                args: PublishProvisionalRootArgs {
                    root_version: 1,
                    total_weight: u128::from(domain::CREATOR_TREASURY_ATOMS),
                    sum_of_merkle_claims_lamports: claim_amount,
                    merkle_root: root,
                    manifest_hash: [4; 32],
                    leaf_file_hash: [5; 32],
                    calculation_code_commit: [6; 32],
                    artifact_uri: "ipfs://m10-sbf-fixture".to_owned(),
                },
            }
            .data(),
        },
        &[],
    )
    .await
    .unwrap();

    let claim_address = pda(&[
        b"distribution_claim",
        &0u64.to_le_bytes(),
        fixture.treasury_position.as_ref(),
    ]);
    let claim_instruction = Instruction {
        program_id: tokenomics_core::ID,
        accounts: accounts::ClaimDistribution {
            caller: authority,
            token_config: fixture.token_config,
            epoch: epoch_address,
            claim: claim_address,
            distribution_vault: fixture.distribution_vault,
            correction_reserve_vault: fixture.correction_reserve,
            treasury_sol_vault: fixture.treasury_sol_vault,
            beneficiary: fixture.treasury_sol_vault,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::ClaimDistribution {
            args: tokenomics_core::ClaimDistributionArgs {
                epoch_id: 0,
                root_version: 1,
                position: fixture.treasury_position,
                beneficiary: fixture.treasury_sol_vault,
                amount_lamports: claim_amount,
                proof: vec![],
            },
        }
        .data(),
    };
    assert!(process(&mut context, claim_instruction.clone(), &[])
        .await
        .is_err());

    let mut clock: Clock = context.banks_client.get_sysvar().await.unwrap();
    clock.unix_timestamp += domain::REVIEW_WINDOW_SECONDS + 1;
    context.set_sysvar(&clock);
    process(
        &mut context,
        Instruction {
            program_id: tokenomics_core::ID,
            accounts: accounts::SealEpochRoot {
                token_config: fixture.token_config,
                epoch: epoch_address,
                distribution_vault: fixture.distribution_vault,
                correction_reserve_vault: fixture.correction_reserve,
            }
            .to_account_metas(None),
            data: instruction::SealEpochRoot {}.data(),
        },
        &[],
    )
    .await
    .unwrap();
    process(&mut context, claim_instruction.clone(), &[])
        .await
        .unwrap();
    // Use a distinct permissionless caller for the replay. Reusing the exact
    // payer, message, and ProgramTest blockhash would recreate the same
    // transaction signature, which BanksClient treats as an already-processed
    // transaction instead of executing the claim instruction again.
    let replay_caller = Keypair::new();
    process(
        &mut context,
        solana_system_interface::instruction::transfer(
            &authority,
            &replay_caller.pubkey(),
            1_000_000,
        ),
        &[],
    )
    .await
    .unwrap();
    let mut replay_instruction = claim_instruction;
    replay_instruction.accounts[0].pubkey = replay_caller.pubkey();
    assert!(process(&mut context, replay_instruction, &[&replay_caller])
        .await
        .is_err());

    let epoch: DistributionEpoch = read_anchor_account(&mut context, epoch_address).await;
    let config: TokenConfig = read_anchor_account(&mut context, fixture.token_config).await;
    let treasury_sol: TreasurySolVaultRecord =
        read_anchor_account(&mut context, fixture.treasury_sol_vault).await;
    assert_eq!(epoch.status, EpochStatus::Sealed);
    assert_eq!(epoch.remaining_claim_liability_lamports, 0);
    assert_eq!(config.total_sealed_liability_remaining, 0);
    assert_eq!(config.pending_rollover_lamports, deposit - claim_amount);
    assert_eq!(treasury_sol.total_received_lamports, claim_amount);

    let next_epoch_address = pda(&[b"epoch", &1u64.to_le_bytes()]);
    process(
        &mut context,
        Instruction {
            program_id: tokenomics_core::ID,
            accounts: accounts::OpenDistributionEpoch {
                publisher: authority,
                token_config: fixture.token_config,
                epoch: next_epoch_address,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
            data: instruction::OpenDistributionEpoch {
                epoch_id: 1,
                first_turn_id: 8,
            }
            .data(),
        },
        &[],
    )
    .await
    .unwrap();

    let correction_epoch_address = pda(&[b"epoch", &(1u64 << 63).to_le_bytes()]);
    let correction_instruction = |original_epoch_id, original_epoch| Instruction {
        program_id: tokenomics_core::ID,
        accounts: accounts::OpenCorrectionEpoch {
            governance: authority,
            token_config: fixture.token_config,
            epoch: correction_epoch_address,
            original_epoch,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
        data: instruction::OpenCorrectionEpoch {
            correction_epoch_id: 0,
            original_epoch_id,
            incident_record_hash: [7; 32],
            correction_reason_hash: [8; 32],
        }
        .data(),
    };
    assert!(process(
        &mut context,
        correction_instruction(1, next_epoch_address),
        &[]
    )
    .await
    .is_err());
    process(&mut context, correction_instruction(0, epoch_address), &[])
        .await
        .unwrap();
    let correction_epoch: DistributionEpoch =
        read_anchor_account(&mut context, correction_epoch_address).await;
    assert_eq!(correction_epoch.original_epoch_id, 0);
    assert_eq!(correction_epoch.status, EpochStatus::Calculating);
}
