use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer as SystemTransfer};
#[cfg(feature = "idl-build")]
use anchor_lang::{Discriminator, IdlBuild};
use anchor_spl::metadata::{
    create_metadata_accounts_v3, mpl_token_metadata, CreateMetadataAccountsV3, Metadata,
};
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{self, Mint, MintTo, SetAuthority, Token, TokenAccount, TransferChecked};
use solana_sha256_hasher::hashv;

pub mod domain;

#[cfg(any(feature = "devnet-campaign-v2-migration", test))]
use domain::INITIAL_CAMPAIGN_V1_ECONOMIC_CONFIG_HASH;
use domain::{
    active_rule_rewards, debit_campaign, distribution_leaf_hash, epoch_accounting, referral_bonus,
    verify_merkle_proof, voter_payment, CAMPAIGN_UNUSED_BALANCE_POLICY_HASH,
    CAMPAIGN_V2_ECONOMIC_CONFIG_HASH, CHALLENGE_RESOLUTION_SECONDS, CREATOR_TREASURY_ATOMS,
    DEFAULT_CHALLENGE_BOND_LAMPORTS, FIXED_SUPPLY_ATOMS, INITIAL_CAMPAIGN_ATOMS,
    PROPOSAL_REWARD_ATOMS, REFERRAL_INVITEE_REWARD_ATOMS, REFERRAL_INVITER_REWARD_ATOMS,
    REVIEW_WINDOW_SECONDS, SUPPORTER_REWARD_ATOMS, TOKEN_DECIMALS,
    TREASURY_OPERATION_DELAY_SECONDS, TURNS_PER_EPOCH, UNPAUSE_NOTICE_SECONDS,
};

declare_id!("BRK6G8Sep66LFREp2nGMLiganfw2nbWe1f8zeAdoP1Fm");

const MAX_NETWORK_BYTES: usize = 32;
const MAX_ARTIFACT_URI_BYTES: usize = 200;
const MAX_REASON_URI_BYTES: usize = 200;
const MAX_METADATA_URI_BYTES: usize = 200;
#[cfg(feature = "devnet-campaign-v2-migration")]
const INITIAL_CAMPAIGN_ECONOMICS_MIGRATED_EVENT_DISCRIMINATOR: [u8; 8] =
    [63, 13, 24, 245, 206, 177, 36, 112];
const TOKEN_NAME: &str = "JUSDEALER";
const TOKEN_SYMBOL: &str = "JDR";
const DEVNET_TOKENOMICS_PROGRAM_ID: Pubkey =
    pubkey!("BRK6G8Sep66LFREp2nGMLiganfw2nbWe1f8zeAdoP1Fm");

fn metadata_uri_is_valid(metadata_uri: &str, program_id: &Pubkey) -> bool {
    if metadata_uri.len() > MAX_METADATA_URI_BYTES {
        return false;
    }
    if metadata_uri.is_empty() {
        return cfg!(feature = "devnet-empty-metadata-uri")
            && program_id == &DEVNET_TOKENOMICS_PROGRAM_ID;
    }
    metadata_uri.starts_with("https://")
}

#[program]
pub mod tokenomics_core {
    use super::*;

    pub fn initialize_genesis(
        ctx: Context<InitializeGenesis>,
        args: InitializeGenesisArgs,
    ) -> Result<()> {
        require!(
            args.initial_campaign_config_hash == CAMPAIGN_V2_ECONOMIC_CONFIG_HASH
                && args.initial_unused_balance_policy_hash == CAMPAIGN_UNUSED_BALANCE_POLICY_HASH,
            TokenomicsError::InvalidCampaignConfiguration
        );
        require!(
            args.governance != Pubkey::default()
                && args.guardian != Pubkey::default()
                && args.game_authority != Pubkey::default()
                && args.epoch_root_publisher != Pubkey::default(),
            TokenomicsError::InvalidAuthority
        );
        require!(
            !args.network.is_empty() && args.network.len() <= MAX_NETWORK_BYTES,
            TokenomicsError::InvalidNetwork
        );
        require!(
            metadata_uri_is_valid(&args.metadata_uri, &crate::ID),
            TokenomicsError::InvalidMetadata
        );

        let clock = Clock::get()?;
        let config = &mut ctx.accounts.token_config;
        config.governance = args.governance;
        config.guardian = args.guardian;
        config.game_authority = args.game_authority;
        config.epoch_root_publisher = args.epoch_root_publisher;
        config.mint = ctx.accounts.mint.key();
        config.metadata = ctx.accounts.metadata.key();
        config.metadata_update_authority = args.governance;
        config.metadata_uri = args.metadata_uri.clone();
        config.metadata_mutable = true;
        config.creator_treasury_reserve_vault = ctx.accounts.creator_treasury_reserve_vault.key();
        config.treasury_lock_escrow = ctx.accounts.treasury_lock_escrow.key();
        config.initial_campaign_vault = ctx.accounts.initial_campaign_vault.key();
        config.distribution_vault = ctx.accounts.distribution_vault.key();
        config.treasury_sol_vault = ctx.accounts.treasury_sol_vault.key();
        config.correction_reserve_vault = ctx.accounts.correction_reserve_vault.key();
        config.network = args.network.clone();
        config.next_epoch_id = 0;
        config.next_correction_epoch_id = 0;
        config.pending_rollover_lamports = 0;
        config.total_sealed_liability_remaining = 0;
        config.total_correction_liability_remaining = 0;
        config.paused = false;
        config.unpause_available_at = 0;
        config.created_at = clock.unix_timestamp;
        config.bump = ctx.bumps.token_config;

        let executor = &mut ctx.accounts.treasury_policy_executor;
        executor.governance = args.governance;
        executor.delay_seconds = TREASURY_OPERATION_DELAY_SECONDS;
        executor.next_operation_id = 0;
        executor.bump = ctx.bumps.treasury_policy_executor;

        ctx.accounts.distribution_vault.bump = ctx.bumps.distribution_vault;
        ctx.accounts.distribution_vault.total_deposited_lamports = 0;
        ctx.accounts.distribution_vault.total_claimed_lamports = 0;
        ctx.accounts.treasury_sol_vault.bump = ctx.bumps.treasury_sol_vault;
        ctx.accounts.treasury_sol_vault.total_received_lamports = 0;
        ctx.accounts.correction_reserve_vault.bump = ctx.bumps.correction_reserve_vault;
        ctx.accounts.correction_reserve_vault.total_funded_lamports = 0;
        ctx.accounts.correction_reserve_vault.total_claimed_lamports = 0;
        ctx.accounts
            .correction_reserve_vault
            .rejected_bonds_lamports = 0;

        let campaign = &mut ctx.accounts.initial_campaign;
        campaign.campaign_id = 0;
        campaign.mint = ctx.accounts.mint.key();
        campaign.vault = ctx.accounts.initial_campaign_vault.key();
        campaign.original_allocation_atoms = INITIAL_CAMPAIGN_ATOMS;
        campaign.cumulative_distributed_atoms = 0;
        campaign.remaining_atoms = INITIAL_CAMPAIGN_ATOMS;
        campaign.state = CampaignState::Funded;
        campaign.economic_config_hash = args.initial_campaign_config_hash;
        campaign.unused_balance_policy_hash = args.initial_unused_balance_policy_hash;
        campaign.paused = false;
        campaign.bump = ctx.bumps.initial_campaign;

        let treasury_position = &mut ctx.accounts.treasury_lock_position;
        treasury_position.beneficial_owner = args.governance;
        treasury_position.unlock_authority = args.governance;
        treasury_position.return_token_account = ctx.accounts.creator_treasury_reserve_vault.key();
        treasury_position.sol_claim_beneficiary = ctx.accounts.treasury_sol_vault.key();
        treasury_position.mint = ctx.accounts.mint.key();
        treasury_position.locked_atoms = CREATOR_TREASURY_ATOMS;
        treasury_position.created_at = clock.unix_timestamp;
        treasury_position.last_changed_at = clock.unix_timestamp;
        treasury_position.is_treasury = true;
        treasury_position.bump = ctx.bumps.treasury_lock_position;

        let config_bump = [config.bump];
        let config_signer: &[&[u8]] = &[b"token_config", &config_bump];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.initial_campaign_vault.to_account_info(),
                    authority: config.to_account_info(),
                },
                &[config_signer],
            ),
            INITIAL_CAMPAIGN_ATOMS,
        )?;
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx
                        .accounts
                        .creator_treasury_reserve_vault
                        .to_account_info(),
                    authority: config.to_account_info(),
                },
                &[config_signer],
            ),
            CREATOR_TREASURY_ATOMS,
        )?;
        ctx.accounts.mint.reload()?;
        require!(
            ctx.accounts.mint.supply == FIXED_SUPPLY_ATOMS,
            TokenomicsError::SupplyInvariantViolation
        );

        create_metadata_accounts_v3(
            CpiContext::new_with_signer(
                ctx.accounts.metadata_program.to_account_info(),
                CreateMetadataAccountsV3 {
                    metadata: ctx.accounts.metadata.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    mint_authority: config.to_account_info(),
                    payer: ctx.accounts.payer.to_account_info(),
                    update_authority: ctx.accounts.governance.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                    rent: ctx.accounts.rent.to_account_info(),
                },
                &[config_signer],
            ),
            mpl_token_metadata::types::DataV2 {
                name: TOKEN_NAME.to_owned(),
                symbol: TOKEN_SYMBOL.to_owned(),
                uri: args.metadata_uri,
                seller_fee_basis_points: 0,
                creators: None,
                collection: None,
                uses: None,
            },
            true,
            false,
            None,
        )?;

        let executor_bump = [executor.bump];
        let executor_signer: &[&[u8]] = &[b"treasury_policy_executor", &executor_bump];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx
                        .accounts
                        .creator_treasury_reserve_vault
                        .to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.treasury_lock_escrow.to_account_info(),
                    authority: executor.to_account_info(),
                },
                &[executor_signer],
            ),
            CREATOR_TREASURY_ATOMS,
            TOKEN_DECIMALS,
        )?;

        revoke_mint_authority(
            &ctx.accounts.token_program,
            &ctx.accounts.mint,
            config,
            config_signer,
            AuthorityType::MintTokens,
        )?;
        revoke_mint_authority(
            &ctx.accounts.token_program,
            &ctx.accounts.mint,
            config,
            config_signer,
            AuthorityType::FreezeAccount,
        )?;

        emit!(GenesisInitialized {
            mint: ctx.accounts.mint.key(),
            fixed_supply_atoms: FIXED_SUPPLY_ATOMS,
            campaign_allocation_atoms: INITIAL_CAMPAIGN_ATOMS,
            treasury_locked_atoms: CREATOR_TREASURY_ATOMS,
            governance: args.governance,
        });
        Ok(())
    }

    pub fn create_lock_position(ctx: Context<CreateLockPosition>, amount_atoms: u64) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(amount_atoms > 0, TokenomicsError::InvalidAmount);
        require!(
            ctx.accounts.source.owner == ctx.accounts.owner.key(),
            TokenomicsError::InvalidTokenOwner
        );
        require!(
            ctx.accounts.return_token_account.owner == ctx.accounts.owner.key(),
            TokenomicsError::InvalidTokenOwner
        );
        require!(
            ctx.accounts.source.mint == ctx.accounts.token_config.mint
                && ctx.accounts.return_token_account.mint == ctx.accounts.token_config.mint,
            TokenomicsError::InvalidMint
        );

        transfer_tokens_from_signer(
            &ctx.accounts.token_program,
            &ctx.accounts.mint,
            &ctx.accounts.source,
            &ctx.accounts.treasury_lock_escrow,
            &ctx.accounts.owner,
            amount_atoms,
        )?;

        let now = Clock::get()?.unix_timestamp;
        let position = &mut ctx.accounts.lock_position;
        position.beneficial_owner = ctx.accounts.owner.key();
        position.unlock_authority = ctx.accounts.owner.key();
        position.return_token_account = ctx.accounts.return_token_account.key();
        position.sol_claim_beneficiary = ctx.accounts.owner.key();
        position.mint = ctx.accounts.token_config.mint;
        position.locked_atoms = amount_atoms;
        position.created_at = now;
        position.last_changed_at = now;
        position.is_treasury = false;
        position.bump = ctx.bumps.lock_position;
        emit!(LockChanged {
            position: position.key(),
            beneficial_owner: position.beneficial_owner,
            amount_atoms,
            locked_atoms: amount_atoms,
            timestamp: now,
            change: LockChange::Locked,
        });
        Ok(())
    }

    pub fn top_up_lock(ctx: Context<TopUpLock>, amount_atoms: u64) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(amount_atoms > 0, TokenomicsError::InvalidAmount);
        require!(
            ctx.accounts.source.owner == ctx.accounts.owner.key(),
            TokenomicsError::InvalidTokenOwner
        );
        transfer_tokens_from_signer(
            &ctx.accounts.token_program,
            &ctx.accounts.mint,
            &ctx.accounts.source,
            &ctx.accounts.treasury_lock_escrow,
            &ctx.accounts.owner,
            amount_atoms,
        )?;
        let now = Clock::get()?.unix_timestamp;
        let position = &mut ctx.accounts.lock_position;
        position.locked_atoms = position
            .locked_atoms
            .checked_add(amount_atoms)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        position.last_changed_at = now;
        emit!(LockChanged {
            position: position.key(),
            beneficial_owner: position.beneficial_owner,
            amount_atoms,
            locked_atoms: position.locked_atoms,
            timestamp: now,
            change: LockChange::Locked,
        });
        Ok(())
    }

    pub fn unlock_tokens(ctx: Context<UnlockTokens>, amount_atoms: u64) -> Result<()> {
        require!(amount_atoms > 0, TokenomicsError::InvalidAmount);
        let position = &mut ctx.accounts.lock_position;
        require!(
            position.unlock_authority == ctx.accounts.unlock_authority.key(),
            TokenomicsError::Unauthorized
        );
        require!(
            position.return_token_account == ctx.accounts.return_token_account.key(),
            TokenomicsError::InvalidReturnDestination
        );
        require!(
            amount_atoms <= position.locked_atoms,
            TokenomicsError::InsufficientLockedBalance
        );
        let config = &ctx.accounts.token_config;
        let bump = [config.bump];
        let signer: &[&[u8]] = &[b"token_config", &bump];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.treasury_lock_escrow.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.return_token_account.to_account_info(),
                    authority: config.to_account_info(),
                },
                &[signer],
            ),
            amount_atoms,
            TOKEN_DECIMALS,
        )?;
        position.locked_atoms = position
            .locked_atoms
            .checked_sub(amount_atoms)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        let now = Clock::get()?.unix_timestamp;
        position.last_changed_at = now;
        emit!(LockChanged {
            position: position.key(),
            beneficial_owner: position.beneficial_owner,
            amount_atoms,
            locked_atoms: position.locked_atoms,
            timestamp: now,
            change: LockChange::Unlocked,
        });
        Ok(())
    }

    pub fn open_distribution_epoch(
        ctx: Context<OpenDistributionEpoch>,
        epoch_id: u64,
        first_turn_id: u64,
    ) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        let config = &mut ctx.accounts.token_config;
        require!(
            ctx.accounts.publisher.key() == config.epoch_root_publisher,
            TokenomicsError::Unauthorized
        );
        require!(
            epoch_id == config.next_epoch_id,
            TokenomicsError::InvalidEpoch
        );
        let last_turn_id = first_turn_id
            .checked_add(TURNS_PER_EPOCH - 1)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        let epoch = &mut ctx.accounts.epoch;
        epoch.epoch_id = epoch_id;
        epoch.kind = EpochKind::Standard;
        epoch.original_epoch_id = epoch_id;
        epoch.first_turn_id = first_turn_id;
        epoch.last_turn_id = last_turn_id;
        epoch.finalised_fees_lamports = 0;
        epoch.rollover_in_lamports = config.pending_rollover_lamports;
        epoch.gross_distributable_lamports = 0;
        epoch.total_weight = 0;
        epoch.sum_of_merkle_claims_lamports = 0;
        epoch.remaining_claim_liability_lamports = 0;
        epoch.rounding_dust_lamports = 0;
        epoch.zero_weight_rollover_out_lamports = 0;
        epoch.rollover_out_lamports = 0;
        epoch.merkle_root = [0; 32];
        epoch.manifest_hash = [0; 32];
        epoch.leaf_file_hash = [0; 32];
        epoch.calculation_code_commit = [0; 32];
        epoch.incident_record_hash = [0; 32];
        epoch.correction_reason_hash = [0; 32];
        epoch.artifact_uri = String::new();
        epoch.root_version = 0;
        epoch.provisional_published_at = 0;
        epoch.verification_window_ends_at = 0;
        epoch.challenge_resolution_deadline = 0;
        epoch.unresolved_challenges = 0;
        epoch.status = EpochStatus::Collecting;
        epoch.bump = ctx.bumps.epoch;
        config.pending_rollover_lamports = 0;
        emit!(EpochOpened {
            epoch_id,
            first_turn_id,
            last_turn_id,
            rollover_in_lamports: epoch.rollover_in_lamports,
        });
        Ok(())
    }

    pub fn open_correction_epoch(
        ctx: Context<OpenCorrectionEpoch>,
        correction_epoch_id: u64,
        original_epoch_id: u64,
        incident_record_hash: [u8; 32],
        correction_reason_hash: [u8; 32],
    ) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(
            ctx.accounts.governance.key() == ctx.accounts.token_config.governance,
            TokenomicsError::Unauthorized
        );
        let config = &mut ctx.accounts.token_config;
        require!(
            correction_epoch_id == config.next_correction_epoch_id,
            TokenomicsError::InvalidEpoch
        );
        require!(
            correction_epoch_id < (1u64 << 63),
            TokenomicsError::InvalidEpoch
        );
        require!(
            ctx.accounts.original_epoch.kind == EpochKind::Standard
                && ctx.accounts.original_epoch.status == EpochStatus::Sealed,
            TokenomicsError::CorrectionRequiresSealedEpoch
        );
        let canonical_epoch_id = correction_epoch_id | (1u64 << 63);
        let epoch = &mut ctx.accounts.epoch;
        epoch.epoch_id = canonical_epoch_id;
        epoch.kind = EpochKind::Correction;
        epoch.original_epoch_id = original_epoch_id;
        epoch.first_turn_id = 0;
        epoch.last_turn_id = 0;
        epoch.finalised_fees_lamports = 0;
        epoch.rollover_in_lamports = 0;
        epoch.gross_distributable_lamports = 0;
        epoch.total_weight = 1;
        epoch.sum_of_merkle_claims_lamports = 0;
        epoch.remaining_claim_liability_lamports = 0;
        epoch.rounding_dust_lamports = 0;
        epoch.zero_weight_rollover_out_lamports = 0;
        epoch.rollover_out_lamports = 0;
        epoch.merkle_root = [0; 32];
        epoch.manifest_hash = incident_record_hash;
        epoch.leaf_file_hash = correction_reason_hash;
        epoch.calculation_code_commit = [0; 32];
        epoch.incident_record_hash = incident_record_hash;
        epoch.correction_reason_hash = correction_reason_hash;
        epoch.artifact_uri = String::new();
        epoch.root_version = 0;
        epoch.provisional_published_at = 0;
        epoch.verification_window_ends_at = 0;
        epoch.challenge_resolution_deadline = 0;
        epoch.unresolved_challenges = 0;
        epoch.status = EpochStatus::Calculating;
        epoch.bump = ctx.bumps.epoch;
        config.next_correction_epoch_id = config
            .next_correction_epoch_id
            .checked_add(1)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        emit!(CorrectionEpochOpened {
            correction_epoch_id: canonical_epoch_id,
            original_epoch_id,
            incident_record_hash,
            correction_reason_hash,
        });
        Ok(())
    }

    pub fn deposit_treasury_fee(
        ctx: Context<DepositTreasuryFee>,
        turn_id: u64,
        amount_lamports: u64,
    ) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(amount_lamports > 0, TokenomicsError::InvalidAmount);
        require!(
            ctx.accounts.game_authority.key() == ctx.accounts.token_config.game_authority,
            TokenomicsError::UnauthorizedGame
        );
        let epoch = &mut ctx.accounts.epoch;
        require!(
            epoch.status == EpochStatus::Collecting,
            TokenomicsError::InvalidEpochStatus
        );
        require!(
            (epoch.first_turn_id..=epoch.last_turn_id).contains(&turn_id),
            TokenomicsError::TurnOutsideEpoch
        );
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                SystemTransfer {
                    from: ctx.accounts.fee_payer.to_account_info(),
                    to: ctx.accounts.distribution_vault.to_account_info(),
                },
            ),
            amount_lamports,
        )?;
        epoch.finalised_fees_lamports = epoch
            .finalised_fees_lamports
            .checked_add(amount_lamports)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        let vault = &mut ctx.accounts.distribution_vault;
        vault.total_deposited_lamports = vault
            .total_deposited_lamports
            .checked_add(amount_lamports)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        emit!(TreasuryFeeDeposited {
            epoch_id: epoch.epoch_id,
            turn_id,
            amount_lamports,
            fee_payer: ctx.accounts.fee_payer.key(),
        });
        Ok(())
    }

    /// Records a treasury fee that the configured game program transferred
    /// directly from its program-owned vault immediately before this CPI.
    /// The vault-balance check makes the accounting fail closed if the funding
    /// transfer and the record ever diverge.
    pub fn record_external_treasury_fee(
        ctx: Context<RecordExternalTreasuryFee>,
        turn_id: u64,
        amount_lamports: u64,
    ) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(amount_lamports > 0, TokenomicsError::InvalidAmount);
        require!(
            ctx.accounts.game_authority.key() == ctx.accounts.token_config.game_authority,
            TokenomicsError::UnauthorizedGame
        );
        let epoch = &mut ctx.accounts.epoch;
        require!(
            epoch.status == EpochStatus::Collecting,
            TokenomicsError::InvalidEpochStatus
        );
        require!(
            (epoch.first_turn_id..=epoch.last_turn_id).contains(&turn_id),
            TokenomicsError::TurnOutsideEpoch
        );

        let vault = &mut ctx.accounts.distribution_vault;
        let new_total_deposited = vault
            .total_deposited_lamports
            .checked_add(amount_lamports)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        let expected_unspent = new_total_deposited
            .checked_sub(vault.total_claimed_lamports)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        require!(
            available_lamports(&vault.to_account_info())? >= expected_unspent,
            TokenomicsError::DistributionVaultInsolvent
        );

        epoch.finalised_fees_lamports = epoch
            .finalised_fees_lamports
            .checked_add(amount_lamports)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        vault.total_deposited_lamports = new_total_deposited;
        emit!(ExternalTreasuryFeeRecorded {
            epoch_id: epoch.epoch_id,
            turn_id,
            amount_lamports,
            game_authority: ctx.accounts.game_authority.key(),
        });
        Ok(())
    }

    pub fn close_epoch_collection(
        ctx: Context<CloseEpochCollection>,
        last_completed_turn_id: u64,
    ) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(
            ctx.accounts.game_authority.key() == ctx.accounts.token_config.game_authority,
            TokenomicsError::UnauthorizedGame
        );
        let epoch = &mut ctx.accounts.epoch;
        require!(
            epoch.status == EpochStatus::Collecting,
            TokenomicsError::InvalidEpochStatus
        );
        require!(
            last_completed_turn_id >= epoch.last_turn_id,
            TokenomicsError::EpochTurnsIncomplete
        );
        epoch.status = EpochStatus::Calculating;
        emit!(EpochCollectionClosed {
            epoch_id: epoch.epoch_id,
            finalised_fees_lamports: epoch.finalised_fees_lamports,
        });
        Ok(())
    }

    pub fn publish_provisional_root(
        ctx: Context<PublishProvisionalRoot>,
        args: PublishProvisionalRootArgs,
    ) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(
            ctx.accounts.publisher.key() == ctx.accounts.token_config.epoch_root_publisher,
            TokenomicsError::Unauthorized
        );
        require!(
            !args.artifact_uri.is_empty() && args.artifact_uri.len() <= MAX_ARTIFACT_URI_BYTES,
            TokenomicsError::InvalidArtifactUri
        );
        require!(
            args.manifest_hash != [0; 32]
                && args.leaf_file_hash != [0; 32]
                && args.calculation_code_commit != [0; 32],
            TokenomicsError::InvalidCalculationArtifact
        );
        let now = Clock::get()?.unix_timestamp;
        let epoch = &mut ctx.accounts.epoch;
        require!(
            matches!(
                epoch.status,
                EpochStatus::Calculating | EpochStatus::Cancelled | EpochStatus::ExpiredUnresolved
            ),
            TokenomicsError::InvalidEpochStatus
        );
        require!(
            epoch.unresolved_challenges == 0,
            TokenomicsError::UnresolvedChallenges
        );
        let expected_root_version = epoch
            .root_version
            .checked_add(1)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        require!(
            args.root_version == expected_root_version,
            TokenomicsError::InvalidRootVersion
        );
        require!(
            epoch.kind == EpochKind::Standard || args.total_weight > 0,
            TokenomicsError::CorrectionMustBePositive
        );
        let accounting = if epoch.kind == EpochKind::Standard {
            epoch_accounting(
                epoch.finalised_fees_lamports,
                epoch.rollover_in_lamports,
                args.total_weight,
                args.sum_of_merkle_claims_lamports,
            )?
        } else {
            require!(
                args.sum_of_merkle_claims_lamports > 0,
                TokenomicsError::CorrectionMustBePositive
            );
            domain::EpochAccounting {
                gross_distributable_lamports: args.sum_of_merkle_claims_lamports,
                sum_of_merkle_claims_lamports: args.sum_of_merkle_claims_lamports,
                rounding_dust_lamports: 0,
                zero_weight_rollover_out_lamports: 0,
                rollover_out_lamports: 0,
            }
        };
        require!(
            args.total_weight == 0 || args.merkle_root != [0; 32],
            TokenomicsError::InvalidMerkleRoot
        );
        if epoch.kind == EpochKind::Standard && args.total_weight == 0 {
            let config = &mut ctx.accounts.token_config;
            epoch.gross_distributable_lamports = accounting.gross_distributable_lamports;
            epoch.total_weight = 0;
            epoch.zero_weight_rollover_out_lamports = accounting.zero_weight_rollover_out_lamports;
            epoch.rollover_out_lamports = accounting.rollover_out_lamports;
            epoch.manifest_hash = args.manifest_hash;
            epoch.leaf_file_hash = args.leaf_file_hash;
            epoch.calculation_code_commit = args.calculation_code_commit;
            epoch.artifact_uri = args.artifact_uri;
            epoch.status = EpochStatus::RolledOverNoWeight;
            config.pending_rollover_lamports = config
                .pending_rollover_lamports
                .checked_add(accounting.rollover_out_lamports)
                .ok_or(TokenomicsError::ArithmeticOverflow)?;
            config.next_epoch_id = config
                .next_epoch_id
                .checked_add(1)
                .ok_or(TokenomicsError::ArithmeticOverflow)?;
            emit!(ZeroWeightEpochRolledOver {
                epoch_id: epoch.epoch_id,
                rollover_out_lamports: accounting.rollover_out_lamports,
            });
            return Ok(());
        }

        if epoch.kind == EpochKind::Standard {
            let required = ctx
                .accounts
                .token_config
                .total_sealed_liability_remaining
                .checked_add(accounting.sum_of_merkle_claims_lamports)
                .ok_or(TokenomicsError::ArithmeticOverflow)?;
            require!(
                available_lamports(&ctx.accounts.distribution_vault.to_account_info())? >= required,
                TokenomicsError::DistributionVaultInsolvent
            );
        } else {
            let required = ctx
                .accounts
                .token_config
                .total_correction_liability_remaining
                .checked_add(accounting.sum_of_merkle_claims_lamports)
                .ok_or(TokenomicsError::ArithmeticOverflow)?;
            require!(
                available_lamports(&ctx.accounts.correction_reserve_vault.to_account_info())?
                    >= required,
                TokenomicsError::CorrectionReserveInsolvent
            );
        }
        epoch.gross_distributable_lamports = accounting.gross_distributable_lamports;
        epoch.total_weight = args.total_weight;
        epoch.sum_of_merkle_claims_lamports = accounting.sum_of_merkle_claims_lamports;
        epoch.remaining_claim_liability_lamports = accounting.sum_of_merkle_claims_lamports;
        epoch.rounding_dust_lamports = accounting.rounding_dust_lamports;
        epoch.zero_weight_rollover_out_lamports = 0;
        epoch.rollover_out_lamports = accounting.rollover_out_lamports;
        epoch.merkle_root = args.merkle_root;
        epoch.manifest_hash = args.manifest_hash;
        epoch.leaf_file_hash = args.leaf_file_hash;
        epoch.calculation_code_commit = args.calculation_code_commit;
        epoch.artifact_uri = args.artifact_uri;
        epoch.root_version = args.root_version;
        epoch.provisional_published_at = now;
        epoch.verification_window_ends_at = now
            .checked_add(REVIEW_WINDOW_SECONDS)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        epoch.challenge_resolution_deadline = epoch
            .verification_window_ends_at
            .checked_add(CHALLENGE_RESOLUTION_SECONDS)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        epoch.unresolved_challenges = 0;
        epoch.status = EpochStatus::Provisional;
        emit!(ProvisionalRootPublished {
            epoch_id: epoch.epoch_id,
            root_version: epoch.root_version,
            merkle_root: epoch.merkle_root,
            sum_of_merkle_claims_lamports: epoch.sum_of_merkle_claims_lamports,
            verification_window_ends_at: epoch.verification_window_ends_at,
        });
        Ok(())
    }

    pub fn challenge_epoch_root(
        ctx: Context<ChallengeEpochRoot>,
        args: ChallengeEpochRootArgs,
    ) -> Result<()> {
        require!(
            args.evidence_hash != [0; 32] && !args.evidence_uri.is_empty(),
            TokenomicsError::InvalidEvidence
        );
        require!(
            args.evidence_uri.len() <= MAX_REASON_URI_BYTES,
            TokenomicsError::InvalidEvidence
        );
        let now = Clock::get()?.unix_timestamp;
        let epoch = &mut ctx.accounts.epoch;
        require!(
            epoch.status == EpochStatus::Provisional || epoch.status == EpochStatus::Challenged,
            TokenomicsError::InvalidEpochStatus
        );
        require!(
            args.root_version == epoch.root_version,
            TokenomicsError::InvalidRootVersion
        );
        require!(
            now < epoch.verification_window_ends_at,
            TokenomicsError::ChallengeWindowClosed
        );
        let bond = DEFAULT_CHALLENGE_BOND_LAMPORTS;
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                SystemTransfer {
                    from: ctx.accounts.challenger.to_account_info(),
                    to: ctx.accounts.challenge.to_account_info(),
                },
            ),
            bond,
        )?;
        let challenge = &mut ctx.accounts.challenge;
        challenge.epoch = epoch.key();
        challenge.epoch_id = epoch.epoch_id;
        challenge.root_version = epoch.root_version;
        challenge.challenger = ctx.accounts.challenger.key();
        challenge.reason_code = args.reason_code;
        challenge.evidence_hash = args.evidence_hash;
        challenge.evidence_uri = args.evidence_uri;
        challenge.bond_lamports = bond;
        challenge.status = ChallengeStatus::Unresolved;
        challenge.resolution_reason_hash = [0; 32];
        challenge.created_at = now;
        challenge.resolved_at = 0;
        challenge.bump = ctx.bumps.challenge;
        epoch.unresolved_challenges = epoch
            .unresolved_challenges
            .checked_add(1)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        epoch.status = EpochStatus::Challenged;
        emit!(EpochRootChallenged {
            epoch_id: epoch.epoch_id,
            root_version: epoch.root_version,
            challenger: challenge.challenger,
            evidence_hash: challenge.evidence_hash,
            bond_lamports: bond,
        });
        Ok(())
    }

    pub fn resolve_epoch_challenge(
        ctx: Context<ResolveEpochChallenge>,
        accepted: bool,
        resolution_reason_hash: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.governance.key() == ctx.accounts.token_config.governance,
            TokenomicsError::Unauthorized
        );
        let now = Clock::get()?.unix_timestamp;
        let epoch = &mut ctx.accounts.epoch;
        require!(
            now <= epoch.challenge_resolution_deadline,
            TokenomicsError::ChallengeResolutionDeadlinePassed
        );
        let challenge = &mut ctx.accounts.challenge;
        require!(
            challenge.status == ChallengeStatus::Unresolved,
            TokenomicsError::ChallengeAlreadyResolved
        );
        require!(
            challenge.epoch == epoch.key() && challenge.root_version == epoch.root_version,
            TokenomicsError::InvalidChallenge
        );
        if accepted {
            transfer_owned_lamports(
                &challenge.to_account_info(),
                &ctx.accounts.challenger.to_account_info(),
                challenge.bond_lamports,
            )?;
            challenge.status = ChallengeStatus::Accepted;
            epoch.status = EpochStatus::Cancelled;
        } else {
            transfer_owned_lamports(
                &challenge.to_account_info(),
                &ctx.accounts.correction_reserve_vault.to_account_info(),
                challenge.bond_lamports,
            )?;
            challenge.status = ChallengeStatus::Rejected;
            let reserve = &mut ctx.accounts.correction_reserve_vault;
            reserve.rejected_bonds_lamports = reserve
                .rejected_bonds_lamports
                .checked_add(challenge.bond_lamports)
                .ok_or(TokenomicsError::ArithmeticOverflow)?;
            reserve.total_funded_lamports = reserve
                .total_funded_lamports
                .checked_add(challenge.bond_lamports)
                .ok_or(TokenomicsError::ArithmeticOverflow)?;
        }
        challenge.resolution_reason_hash = resolution_reason_hash;
        challenge.resolved_at = now;
        epoch.unresolved_challenges = epoch
            .unresolved_challenges
            .checked_sub(1)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        if !accepted && epoch.unresolved_challenges == 0 && epoch.status != EpochStatus::Cancelled {
            epoch.status = EpochStatus::Provisional;
        }
        emit!(EpochChallengeResolved {
            epoch_id: epoch.epoch_id,
            root_version: epoch.root_version,
            challenger: challenge.challenger,
            accepted,
            resolution_reason_hash,
        });
        Ok(())
    }

    pub fn refund_expired_challenge(ctx: Context<RefundExpiredChallenge>) -> Result<()> {
        let epoch = &mut ctx.accounts.epoch;
        require!(
            epoch.status == EpochStatus::ExpiredUnresolved,
            TokenomicsError::InvalidEpochStatus
        );
        let challenge = &mut ctx.accounts.challenge;
        require!(
            challenge.status == ChallengeStatus::Unresolved
                && challenge.epoch == epoch.key()
                && challenge.root_version == epoch.root_version
                && challenge.challenger == ctx.accounts.challenger.key(),
            TokenomicsError::InvalidChallenge
        );
        transfer_owned_lamports(
            &challenge.to_account_info(),
            &ctx.accounts.challenger.to_account_info(),
            challenge.bond_lamports,
        )?;
        challenge.status = ChallengeStatus::RefundedExpired;
        challenge.resolved_at = Clock::get()?.unix_timestamp;
        epoch.unresolved_challenges = epoch
            .unresolved_challenges
            .checked_sub(1)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        emit!(ExpiredChallengeBondRefunded {
            epoch_id: epoch.epoch_id,
            root_version: epoch.root_version,
            challenger: challenge.challenger,
            bond_lamports: challenge.bond_lamports,
        });
        Ok(())
    }

    pub fn expire_unresolved_root(ctx: Context<ExpireUnresolvedRoot>) -> Result<()> {
        let epoch = &mut ctx.accounts.epoch;
        require!(
            epoch.status == EpochStatus::Challenged && epoch.unresolved_challenges > 0,
            TokenomicsError::InvalidEpochStatus
        );
        require!(
            Clock::get()?.unix_timestamp > epoch.challenge_resolution_deadline,
            TokenomicsError::ChallengeResolutionStillOpen
        );
        epoch.status = EpochStatus::ExpiredUnresolved;
        emit!(EpochRootExpired {
            epoch_id: epoch.epoch_id,
            root_version: epoch.root_version,
        });
        Ok(())
    }

    pub fn seal_epoch_root(ctx: Context<SealEpochRoot>) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        let now = Clock::get()?.unix_timestamp;
        let epoch = &mut ctx.accounts.epoch;
        require!(
            epoch.status == EpochStatus::Provisional,
            TokenomicsError::InvalidEpochStatus
        );
        require!(
            epoch.unresolved_challenges == 0,
            TokenomicsError::UnresolvedChallenges
        );
        require!(
            now >= epoch.verification_window_ends_at,
            TokenomicsError::VerificationWindowOpen
        );
        let config = &mut ctx.accounts.token_config;
        if epoch.kind == EpochKind::Standard {
            let required = config
                .total_sealed_liability_remaining
                .checked_add(epoch.sum_of_merkle_claims_lamports)
                .ok_or(TokenomicsError::ArithmeticOverflow)?;
            require!(
                available_lamports(&ctx.accounts.distribution_vault.to_account_info())? >= required,
                TokenomicsError::DistributionVaultInsolvent
            );
            config.total_sealed_liability_remaining = required;
            config.pending_rollover_lamports = config
                .pending_rollover_lamports
                .checked_add(epoch.rollover_out_lamports)
                .ok_or(TokenomicsError::ArithmeticOverflow)?;
            config.next_epoch_id = config
                .next_epoch_id
                .checked_add(1)
                .ok_or(TokenomicsError::ArithmeticOverflow)?;
        } else {
            let required = config
                .total_correction_liability_remaining
                .checked_add(epoch.sum_of_merkle_claims_lamports)
                .ok_or(TokenomicsError::ArithmeticOverflow)?;
            require!(
                available_lamports(&ctx.accounts.correction_reserve_vault.to_account_info())?
                    >= required,
                TokenomicsError::CorrectionReserveInsolvent
            );
            config.total_correction_liability_remaining = required;
        }
        epoch.status = EpochStatus::Sealed;
        emit!(EpochRootSealed {
            epoch_id: epoch.epoch_id,
            root_version: epoch.root_version,
            merkle_root: epoch.merkle_root,
            claim_liability_lamports: epoch.sum_of_merkle_claims_lamports,
            rollover_out_lamports: epoch.rollover_out_lamports,
        });
        Ok(())
    }

    pub fn claim_distribution(
        ctx: Context<ClaimDistribution>,
        args: ClaimDistributionArgs,
    ) -> Result<()> {
        let epoch = &mut ctx.accounts.epoch;
        require!(
            epoch.status == EpochStatus::Sealed,
            TokenomicsError::EpochNotSealed
        );
        require!(
            args.epoch_id == epoch.epoch_id && args.root_version == epoch.root_version,
            TokenomicsError::InvalidEpoch
        );
        require!(
            args.beneficiary == ctx.accounts.beneficiary.key(),
            TokenomicsError::InvalidBeneficiary
        );
        let treasury_position = Pubkey::find_program_address(
            &[
                b"lock_position",
                ctx.accounts.token_config.governance.as_ref(),
            ],
            &crate::ID,
        )
        .0;
        let is_treasury_position = args.position == treasury_position;
        if is_treasury_position {
            require_keys_eq!(
                args.beneficiary,
                ctx.accounts.treasury_sol_vault.key(),
                TokenomicsError::InvalidTreasuryClaimDestination
            );
        } else {
            require_keys_neq!(
                args.beneficiary,
                ctx.accounts.treasury_sol_vault.key(),
                TokenomicsError::InvalidTreasuryClaimDestination
            );
        }
        let leaf = distribution_leaf_hash(
            &crate::ID,
            ctx.accounts.token_config.network.as_bytes(),
            args.epoch_id,
            &args.position,
            &args.beneficiary,
            args.amount_lamports,
        )?;
        require!(
            verify_merkle_proof(&epoch.merkle_root, &leaf, &args.proof)?,
            TokenomicsError::InvalidMerkleProof
        );
        require!(
            args.amount_lamports <= epoch.remaining_claim_liability_lamports,
            TokenomicsError::ClaimExceedsLiability
        );
        let claim = &mut ctx.accounts.claim;
        claim.epoch = epoch.key();
        claim.epoch_id = epoch.epoch_id;
        claim.root_version = epoch.root_version;
        claim.leaf_hash = leaf;
        claim.position = args.position;
        claim.beneficiary = args.beneficiary;
        claim.amount_lamports = args.amount_lamports;
        claim.claimed_at = Clock::get()?.unix_timestamp;
        claim.bump = ctx.bumps.claim;

        if epoch.kind == EpochKind::Standard && is_treasury_position {
            transfer_owned_lamports(
                &ctx.accounts.distribution_vault.to_account_info(),
                &ctx.accounts.treasury_sol_vault.to_account_info(),
                args.amount_lamports,
            )?;
            ctx.accounts.treasury_sol_vault.total_received_lamports = ctx
                .accounts
                .treasury_sol_vault
                .total_received_lamports
                .checked_add(args.amount_lamports)
                .ok_or(TokenomicsError::ArithmeticOverflow)?;
        } else if epoch.kind == EpochKind::Standard {
            transfer_owned_lamports(
                &ctx.accounts.distribution_vault.to_account_info(),
                &ctx.accounts.beneficiary.to_account_info(),
                args.amount_lamports,
            )?;
        } else {
            transfer_owned_lamports(
                &ctx.accounts.correction_reserve_vault.to_account_info(),
                &ctx.accounts.beneficiary.to_account_info(),
                args.amount_lamports,
            )?;
        }
        epoch.remaining_claim_liability_lamports = epoch
            .remaining_claim_liability_lamports
            .checked_sub(args.amount_lamports)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        let config = &mut ctx.accounts.token_config;
        if epoch.kind == EpochKind::Standard {
            config.total_sealed_liability_remaining = config
                .total_sealed_liability_remaining
                .checked_sub(args.amount_lamports)
                .ok_or(TokenomicsError::ArithmeticOverflow)?;
            let vault = &mut ctx.accounts.distribution_vault;
            vault.total_claimed_lamports = vault
                .total_claimed_lamports
                .checked_add(args.amount_lamports)
                .ok_or(TokenomicsError::ArithmeticOverflow)?;
        } else {
            config.total_correction_liability_remaining = config
                .total_correction_liability_remaining
                .checked_sub(args.amount_lamports)
                .ok_or(TokenomicsError::ArithmeticOverflow)?;
            let reserve = &mut ctx.accounts.correction_reserve_vault;
            reserve.total_claimed_lamports = reserve
                .total_claimed_lamports
                .checked_add(args.amount_lamports)
                .ok_or(TokenomicsError::ArithmeticOverflow)?;
        }
        emit!(DistributionClaimed {
            epoch_id: epoch.epoch_id,
            position: args.position,
            beneficiary: args.beneficiary,
            amount_lamports: args.amount_lamports,
            caller: ctx.accounts.caller.key(),
        });
        Ok(())
    }

    pub fn settle_action_reward(
        ctx: Context<SettleActionReward>,
        args: SettleActionRewardArgs,
    ) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(
            ctx.accounts.game_authority.key() == ctx.accounts.token_config.game_authority,
            TokenomicsError::UnauthorizedGame
        );
        let nominal_atoms = match args.kind {
            ActionRewardKind::Proposal => PROPOSAL_REWARD_ATOMS,
            ActionRewardKind::Supporter => SUPPORTER_REWARD_ATOMS,
        };
        let campaign = &mut ctx.accounts.campaign;
        require_campaign_active(campaign)?;
        let debit = debit_campaign(campaign.remaining_atoms, nominal_atoms);
        if debit.paid_atoms > 0 {
            transfer_campaign_tokens(
                &ctx.accounts.token_program,
                &ctx.accounts.mint,
                &ctx.accounts.campaign_vault,
                &ctx.accounts.beneficiary_token_account,
                &ctx.accounts.token_config,
                debit.paid_atoms,
            )?;
        }
        apply_campaign_debit(campaign, debit.paid_atoms)?;
        let receipt = &mut ctx.accounts.reward_receipt;
        receipt.campaign = campaign.key();
        receipt.action_id = args.action_id;
        receipt.beneficiary = ctx.accounts.beneficiary_token_account.owner;
        receipt.kind = match args.kind {
            ActionRewardKind::Proposal => CampaignRewardKind::Proposal,
            ActionRewardKind::Supporter => CampaignRewardKind::Supporter,
        };
        receipt.nominal_atoms = nominal_atoms;
        receipt.paid_atoms = debit.paid_atoms;
        receipt.final_partial = debit.final_partial;
        receipt.settled_at = Clock::get()?.unix_timestamp;
        receipt.bump = ctx.bumps.reward_receipt;
        emit_reward(campaign, receipt);
        Ok(())
    }

    pub fn settle_active_rule_rewards<'info>(
        ctx: Context<'_, '_, '_, 'info, SettleActiveRuleRewards<'info>>,
        args: SettleActiveRuleRewardsArgs,
    ) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(
            ctx.accounts.game_authority.key() == ctx.accounts.token_config.game_authority,
            TokenomicsError::UnauthorizedGame
        );
        let voter_count = u64::try_from(ctx.remaining_accounts.len())
            .map_err(|_| TokenomicsError::ArithmeticOverflow)?;
        validate_sorted_voter_accounts(ctx.remaining_accounts, ctx.accounts.token_config.mint)?;
        let campaign = &mut ctx.accounts.campaign;
        require_campaign_active(campaign)?;
        let rewards = active_rule_rewards(
            args.alternative_prize_pool_lamports,
            args.winner_count,
            campaign.remaining_atoms,
            voter_count > 0,
        )?;
        if rewards.creator_paid_atoms > 0 {
            transfer_campaign_tokens(
                &ctx.accounts.token_program,
                &ctx.accounts.mint,
                &ctx.accounts.campaign_vault,
                &ctx.accounts.creator_token_account,
                &ctx.accounts.token_config,
                rewards.creator_paid_atoms,
            )?;
        }
        for (index, account_info) in ctx.remaining_accounts.iter().enumerate() {
            let amount = voter_payment(
                rewards.voter_pool_paid_atoms,
                voter_count,
                u64::try_from(index).map_err(|_| TokenomicsError::ArithmeticOverflow)?,
            )?;
            if amount > 0 {
                transfer_campaign_tokens_to_info(
                    &ctx.accounts.token_program,
                    &ctx.accounts.mint,
                    &ctx.accounts.campaign_vault,
                    account_info,
                    &ctx.accounts.token_config,
                    amount,
                )?;
            }
        }
        let total_paid = rewards
            .creator_paid_atoms
            .checked_add(rewards.voter_pool_paid_atoms)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        apply_campaign_debit(campaign, total_paid)?;
        let settlement = &mut ctx.accounts.active_rule_reward;
        settlement.campaign = campaign.key();
        settlement.turn_id = args.turn_id;
        settlement.creator = ctx.accounts.creator_token_account.owner;
        settlement.individual_alternative_payout_lamports =
            rewards.individual_alternative_payout_lamports;
        settlement.calculated_creator_atoms = rewards.calculated_creator_atoms;
        settlement.creator_paid_atoms = rewards.creator_paid_atoms;
        settlement.calculated_voter_pool_atoms = rewards.calculated_voter_pool_atoms;
        settlement.voter_pool_paid_atoms = rewards.voter_pool_paid_atoms;
        settlement.unique_voter_count =
            u32::try_from(voter_count).map_err(|_| TokenomicsError::ArithmeticOverflow)?;
        settlement.settled_at = Clock::get()?.unix_timestamp;
        settlement.bump = ctx.bumps.active_rule_reward;
        emit!(ActiveRuleRewardsSettled {
            campaign_id: campaign.campaign_id,
            turn_id: args.turn_id,
            creator: settlement.creator,
            creator_paid_atoms: settlement.creator_paid_atoms,
            voter_pool_paid_atoms: settlement.voter_pool_paid_atoms,
            unique_voter_count: settlement.unique_voter_count,
            remaining_campaign_atoms: campaign.remaining_atoms,
        });
        Ok(())
    }

    pub fn attribute_referral(
        ctx: Context<AttributeReferral>,
        referral_code_hash: [u8; 32],
    ) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(
            ctx.accounts.inviter.key() != ctx.accounts.invitee.key(),
            TokenomicsError::SelfReferral
        );
        let attribution = &mut ctx.accounts.attribution;
        attribution.invitee = ctx.accounts.invitee.key();
        attribution.inviter = ctx.accounts.inviter.key();
        attribution.referral_code_hash = referral_code_hash;
        attribution.qualifying_turn_id = 0;
        attribution.invitee_first_round_reward_atoms = 0;
        attribution.base_reward_settled = false;
        attribution.bonus_settled = false;
        attribution.attributed_at = Clock::get()?.unix_timestamp;
        attribution.bump = ctx.bumps.attribution;
        emit!(ReferralAttributed {
            invitee: attribution.invitee,
            inviter: attribution.inviter,
            referral_code_hash,
        });
        Ok(())
    }

    pub fn settle_referral_base_rewards(
        ctx: Context<SettleReferralBaseRewards>,
        turn_id: u64,
    ) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(
            ctx.accounts.game_authority.key() == ctx.accounts.token_config.game_authority,
            TokenomicsError::UnauthorizedGame
        );
        let attribution = &mut ctx.accounts.attribution;
        require!(
            !attribution.base_reward_settled,
            TokenomicsError::ReferralAlreadySettled
        );
        require!(
            ctx.accounts.inviter_token_account.owner == attribution.inviter
                && ctx.accounts.invitee_token_account.owner == attribution.invitee,
            TokenomicsError::InvalidBeneficiary
        );
        let campaign = &mut ctx.accounts.campaign;
        require_campaign_active(campaign)?;
        let inviter = debit_campaign(campaign.remaining_atoms, REFERRAL_INVITER_REWARD_ATOMS);
        if inviter.paid_atoms > 0 {
            transfer_campaign_tokens(
                &ctx.accounts.token_program,
                &ctx.accounts.mint,
                &ctx.accounts.campaign_vault,
                &ctx.accounts.inviter_token_account,
                &ctx.accounts.token_config,
                inviter.paid_atoms,
            )?;
        }
        apply_campaign_debit(campaign, inviter.paid_atoms)?;
        let invitee = debit_campaign(campaign.remaining_atoms, REFERRAL_INVITEE_REWARD_ATOMS);
        if invitee.paid_atoms > 0 {
            transfer_campaign_tokens(
                &ctx.accounts.token_program,
                &ctx.accounts.mint,
                &ctx.accounts.campaign_vault,
                &ctx.accounts.invitee_token_account,
                &ctx.accounts.token_config,
                invitee.paid_atoms,
            )?;
        }
        apply_campaign_debit(campaign, invitee.paid_atoms)?;
        attribution.qualifying_turn_id = turn_id;
        attribution.invitee_first_round_reward_atoms = invitee.paid_atoms;
        attribution.base_reward_settled = true;
        emit!(ReferralBaseRewardsSettled {
            campaign_id: campaign.campaign_id,
            invitee: attribution.invitee,
            inviter: attribution.inviter,
            turn_id,
            inviter_paid_atoms: inviter.paid_atoms,
            invitee_paid_atoms: invitee.paid_atoms,
            remaining_campaign_atoms: campaign.remaining_atoms,
        });
        Ok(())
    }

    pub fn record_invitee_first_round_reward(
        ctx: Context<RecordInviteeFirstRoundReward>,
        turn_id: u64,
        contribution_id: [u8; 32],
        paid_atoms: u64,
    ) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(
            ctx.accounts.game_authority.key() == ctx.accounts.token_config.game_authority,
            TokenomicsError::UnauthorizedGame
        );
        require!(paid_atoms > 0, TokenomicsError::InvalidAmount);
        let attribution = &mut ctx.accounts.attribution;
        require!(
            attribution.base_reward_settled
                && attribution.qualifying_turn_id == turn_id
                && !attribution.bonus_settled,
            TokenomicsError::InvalidReferralState
        );
        attribution.invitee_first_round_reward_atoms = attribution
            .invitee_first_round_reward_atoms
            .checked_add(paid_atoms)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        let contribution = &mut ctx.accounts.contribution;
        contribution.attribution = attribution.key();
        contribution.contribution_id = contribution_id;
        contribution.turn_id = turn_id;
        contribution.paid_atoms = paid_atoms;
        contribution.recorded_at = Clock::get()?.unix_timestamp;
        contribution.bump = ctx.bumps.contribution;
        Ok(())
    }

    pub fn settle_referral_bonus(ctx: Context<SettleReferralBonus>, turn_id: u64) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(
            ctx.accounts.game_authority.key() == ctx.accounts.token_config.game_authority,
            TokenomicsError::UnauthorizedGame
        );
        let attribution = &mut ctx.accounts.attribution;
        require!(
            attribution.base_reward_settled
                && !attribution.bonus_settled
                && attribution.qualifying_turn_id == turn_id,
            TokenomicsError::InvalidReferralState
        );
        require!(
            ctx.accounts.inviter_token_account.owner == attribution.inviter,
            TokenomicsError::InvalidBeneficiary
        );
        let nominal = referral_bonus(attribution.invitee_first_round_reward_atoms)?;
        let campaign = &mut ctx.accounts.campaign;
        require_campaign_active(campaign)?;
        let debit = debit_campaign(campaign.remaining_atoms, nominal);
        if debit.paid_atoms > 0 {
            transfer_campaign_tokens(
                &ctx.accounts.token_program,
                &ctx.accounts.mint,
                &ctx.accounts.campaign_vault,
                &ctx.accounts.inviter_token_account,
                &ctx.accounts.token_config,
                debit.paid_atoms,
            )?;
        }
        apply_campaign_debit(campaign, debit.paid_atoms)?;
        attribution.bonus_settled = true;
        emit!(ReferralBonusSettled {
            campaign_id: campaign.campaign_id,
            invitee: attribution.invitee,
            inviter: attribution.inviter,
            turn_id,
            bonus_base_atoms: attribution.invitee_first_round_reward_atoms,
            nominal_atoms: nominal,
            paid_atoms: debit.paid_atoms,
            remaining_campaign_atoms: campaign.remaining_atoms,
        });
        Ok(())
    }

    pub fn create_future_campaign_draft(
        ctx: Context<CreateFutureCampaignDraft>,
        args: CreateFutureCampaignDraftArgs,
    ) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(
            ctx.accounts.governance.key() == ctx.accounts.token_config.governance,
            TokenomicsError::Unauthorized
        );
        require!(args.campaign_id > 0, TokenomicsError::InvalidCampaignId);
        require!(
            args.economic_config_hash == CAMPAIGN_V2_ECONOMIC_CONFIG_HASH
                && args.unused_balance_policy_hash == CAMPAIGN_UNUSED_BALANCE_POLICY_HASH,
            TokenomicsError::InvalidCampaignConfiguration
        );
        let campaign = &mut ctx.accounts.campaign;
        campaign.campaign_id = args.campaign_id;
        campaign.mint = ctx.accounts.token_config.mint;
        campaign.vault = ctx.accounts.campaign_vault.key();
        campaign.original_allocation_atoms = 0;
        campaign.cumulative_distributed_atoms = 0;
        campaign.remaining_atoms = 0;
        campaign.state = CampaignState::Draft;
        campaign.economic_config_hash = args.economic_config_hash;
        campaign.unused_balance_policy_hash = args.unused_balance_policy_hash;
        campaign.paused = false;
        campaign.bump = ctx.bumps.campaign;
        emit!(FutureCampaignDraftCreated {
            campaign_id: campaign.campaign_id,
            vault: campaign.vault,
            economic_config_hash: campaign.economic_config_hash,
            unused_balance_policy_hash: campaign.unused_balance_policy_hash,
        });
        Ok(())
    }

    /// Performs the single pre-mainnet devnet migration from the funded v1
    /// campaign-0 commitment to the approved v2 economics. No tokens move and
    /// every balance/accounting field is preserved.
    #[cfg(feature = "devnet-campaign-v2-migration")]
    pub fn migrate_initial_campaign_to_v2(ctx: Context<MigrateInitialCampaignToV2>) -> Result<()> {
        require_keys_eq!(
            crate::ID,
            DEVNET_TOKENOMICS_PROGRAM_ID,
            TokenomicsError::InvalidCampaignConfiguration
        );
        require_not_paused(&ctx.accounts.token_config)?;
        require_keys_eq!(
            ctx.accounts.governance.key(),
            ctx.accounts.token_config.governance,
            TokenomicsError::Unauthorized
        );

        let campaign = &mut ctx.accounts.campaign;
        validate_initial_campaign_v2_migration(campaign, ctx.accounts.campaign_vault.amount)?;
        campaign.economic_config_hash = CAMPAIGN_V2_ECONOMIC_CONFIG_HASH;

        let remaining_atoms = campaign.remaining_atoms.to_le_bytes();
        anchor_lang::solana_program::log::sol_log_data(&[
            &INITIAL_CAMPAIGN_ECONOMICS_MIGRATED_EVENT_DISCRIMINATOR,
            &remaining_atoms,
        ]);
        Ok(())
    }

    pub fn fund_future_campaign(
        ctx: Context<FundFutureCampaign>,
        allocation_atoms: u64,
    ) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(allocation_atoms > 0, TokenomicsError::InvalidAmount);
        let campaign = &mut ctx.accounts.campaign;
        require!(
            campaign.state == CampaignState::Draft
                && campaign.original_allocation_atoms == 0
                && campaign.remaining_atoms == 0,
            TokenomicsError::CampaignConfigurationFrozen
        );
        require!(
            ctx.accounts.operation.asset == TreasuryAsset::Token
                && ctx.accounts.operation.destination == campaign.vault
                && ctx.accounts.operation.amount == allocation_atoms,
            TokenomicsError::OperationMismatch
        );
        validate_operation(
            &ctx.accounts.operation,
            TreasuryAsset::Token,
            campaign.vault,
        )?;
        let executor = &ctx.accounts.treasury_policy_executor;
        let bump = [executor.bump];
        let signer: &[&[u8]] = &[b"treasury_policy_executor", &bump];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx
                        .accounts
                        .creator_treasury_reserve_vault
                        .to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.campaign_vault.to_account_info(),
                    authority: executor.to_account_info(),
                },
                &[signer],
            ),
            allocation_atoms,
            TOKEN_DECIMALS,
        )?;
        campaign.original_allocation_atoms = allocation_atoms;
        campaign.remaining_atoms = allocation_atoms;
        campaign.state = CampaignState::Funded;
        mark_operation_executed(&mut ctx.accounts.operation)?;
        emit!(FutureCampaignFunded {
            campaign_id: campaign.campaign_id,
            vault: campaign.vault,
            allocation_atoms,
            source_operation_id: ctx.accounts.operation.operation_id,
        });
        Ok(())
    }

    pub fn pause_campaign(ctx: Context<PauseCampaign>) -> Result<()> {
        require!(
            ctx.accounts.guardian.key() == ctx.accounts.token_config.guardian,
            TokenomicsError::Unauthorized
        );
        require!(
            ctx.accounts.campaign.state == CampaignState::Funded,
            TokenomicsError::CampaignNotActive
        );
        ctx.accounts.campaign.paused = true;
        emit!(CampaignPauseChanged {
            campaign_id: ctx.accounts.campaign.campaign_id,
            paused: true,
        });
        Ok(())
    }

    pub fn resume_campaign(ctx: Context<ResumeCampaign>) -> Result<()> {
        require!(
            ctx.accounts.governance.key() == ctx.accounts.token_config.governance,
            TokenomicsError::Unauthorized
        );
        require!(
            ctx.accounts.campaign.state == CampaignState::Funded,
            TokenomicsError::CampaignNotActive
        );
        ctx.accounts.campaign.paused = false;
        emit!(CampaignPauseChanged {
            campaign_id: ctx.accounts.campaign.campaign_id,
            paused: false,
        });
        Ok(())
    }

    pub fn schedule_treasury_operation(
        ctx: Context<ScheduleTreasuryOperation>,
        args: ScheduleTreasuryOperationArgs,
    ) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(
            ctx.accounts.governance.key() == ctx.accounts.token_config.governance,
            TokenomicsError::Unauthorized
        );
        require!(args.amount > 0, TokenomicsError::InvalidAmount);
        require!(
            args.destination != Pubkey::default(),
            TokenomicsError::InvalidDestination
        );
        let executor = &mut ctx.accounts.treasury_policy_executor;
        require!(
            args.operation_id == executor.next_operation_id,
            TokenomicsError::InvalidOperationId
        );
        let now = Clock::get()?.unix_timestamp;
        let operation = &mut ctx.accounts.operation;
        operation.operation_id = args.operation_id;
        operation.asset = args.asset;
        operation.destination = args.destination;
        operation.amount = args.amount;
        operation.purpose_hash = args.purpose_hash;
        operation.scheduled_at = now;
        operation.execute_after = now
            .checked_add(executor.delay_seconds)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        operation.executed_at = 0;
        operation.cancelled_at = 0;
        operation.state = TreasuryOperationState::Scheduled;
        operation.bump = ctx.bumps.operation;
        executor.next_operation_id = executor
            .next_operation_id
            .checked_add(1)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        emit!(TreasuryOperationScheduled {
            operation_id: operation.operation_id,
            asset: operation.asset,
            destination: operation.destination,
            amount: operation.amount,
            execute_after: operation.execute_after,
            purpose_hash: operation.purpose_hash,
        });
        Ok(())
    }

    pub fn execute_treasury_token_operation(
        ctx: Context<ExecuteTreasuryTokenOperation>,
    ) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        validate_operation(
            &ctx.accounts.operation,
            TreasuryAsset::Token,
            ctx.accounts.destination.key(),
        )?;
        let executor = &ctx.accounts.treasury_policy_executor;
        let bump = [executor.bump];
        let signer: &[&[u8]] = &[b"treasury_policy_executor", &bump];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx
                        .accounts
                        .creator_treasury_reserve_vault
                        .to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.destination.to_account_info(),
                    authority: executor.to_account_info(),
                },
                &[signer],
            ),
            ctx.accounts.operation.amount,
            TOKEN_DECIMALS,
        )?;
        mark_operation_executed(&mut ctx.accounts.operation)?;
        Ok(())
    }

    pub fn execute_treasury_sol_operation(ctx: Context<ExecuteTreasurySolOperation>) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        validate_operation(
            &ctx.accounts.operation,
            TreasuryAsset::Sol,
            ctx.accounts.destination.key(),
        )?;
        transfer_owned_lamports(
            &ctx.accounts.treasury_sol_vault.to_account_info(),
            &ctx.accounts.destination.to_account_info(),
            ctx.accounts.operation.amount,
        )?;
        mark_operation_executed(&mut ctx.accounts.operation)?;
        Ok(())
    }

    pub fn cancel_treasury_operation(ctx: Context<CancelTreasuryOperation>) -> Result<()> {
        require!(
            ctx.accounts.governance.key() == ctx.accounts.token_config.governance,
            TokenomicsError::Unauthorized
        );
        let operation = &mut ctx.accounts.operation;
        require!(
            operation.state == TreasuryOperationState::Scheduled,
            TokenomicsError::InvalidOperationState
        );
        operation.state = TreasuryOperationState::Cancelled;
        operation.cancelled_at = Clock::get()?.unix_timestamp;
        emit!(TreasuryOperationCancelled {
            operation_id: operation.operation_id,
        });
        Ok(())
    }

    pub fn fund_correction_reserve(
        ctx: Context<FundCorrectionReserve>,
        amount_lamports: u64,
    ) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(amount_lamports > 0, TokenomicsError::InvalidAmount);
        require!(
            ctx.accounts.operation.asset == TreasuryAsset::Sol
                && ctx.accounts.operation.destination
                    == ctx.accounts.correction_reserve_vault.key()
                && ctx.accounts.operation.amount == amount_lamports,
            TokenomicsError::OperationMismatch
        );
        validate_operation(
            &ctx.accounts.operation,
            TreasuryAsset::Sol,
            ctx.accounts.correction_reserve_vault.key(),
        )?;
        transfer_owned_lamports(
            &ctx.accounts.treasury_sol_vault.to_account_info(),
            &ctx.accounts.correction_reserve_vault.to_account_info(),
            amount_lamports,
        )?;
        let reserve = &mut ctx.accounts.correction_reserve_vault;
        reserve.total_funded_lamports = reserve
            .total_funded_lamports
            .checked_add(amount_lamports)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        mark_operation_executed(&mut ctx.accounts.operation)?;
        Ok(())
    }

    pub fn activate_spending_limit(
        ctx: Context<ActivateSpendingLimit>,
        args: ActivateSpendingLimitArgs,
    ) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(
            args.operator != Pubkey::default()
                && args.destination != Pubkey::default()
                && args.max_lamports > 0
                && args.period_seconds > 0,
            TokenomicsError::InvalidSpendingLimit
        );
        let expected_hash = spending_limit_hash(&args);
        require!(
            ctx.accounts.operation.asset == TreasuryAsset::Sol
                && ctx.accounts.operation.destination == args.destination
                && ctx.accounts.operation.amount == args.max_lamports
                && ctx.accounts.operation.purpose_hash == expected_hash,
            TokenomicsError::OperationMismatch
        );
        validate_operation(
            &ctx.accounts.operation,
            TreasuryAsset::Sol,
            args.destination,
        )?;
        let now = Clock::get()?.unix_timestamp;
        let limit = &mut ctx.accounts.spending_limit;
        limit.limit_id = args.limit_id;
        limit.operator = args.operator;
        limit.destination = args.destination;
        limit.max_lamports = args.max_lamports;
        limit.period_seconds = args.period_seconds;
        limit.period_started_at = now;
        limit.spent_in_period_lamports = 0;
        limit.config_hash = expected_hash;
        limit.active = true;
        limit.bump = ctx.bumps.spending_limit;
        mark_operation_executed(&mut ctx.accounts.operation)?;
        emit!(SpendingLimitActivated {
            limit_id: limit.limit_id,
            operator: limit.operator,
            destination: limit.destination,
            max_lamports: limit.max_lamports,
            period_seconds: limit.period_seconds,
            config_hash: limit.config_hash,
        });
        Ok(())
    }

    pub fn spend_within_limit(ctx: Context<SpendWithinLimit>, amount_lamports: u64) -> Result<()> {
        require_not_paused(&ctx.accounts.token_config)?;
        require!(amount_lamports > 0, TokenomicsError::InvalidAmount);
        let now = Clock::get()?.unix_timestamp;
        let limit = &mut ctx.accounts.spending_limit;
        require!(limit.active, TokenomicsError::SpendingLimitInactive);
        require!(
            limit.operator == ctx.accounts.operator.key()
                && limit.destination == ctx.accounts.destination.key(),
            TokenomicsError::Unauthorized
        );
        let period_ends_at = limit
            .period_started_at
            .checked_add(limit.period_seconds)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        if now >= period_ends_at {
            limit.period_started_at = now;
            limit.spent_in_period_lamports = 0;
        }
        let next_spent = limit
            .spent_in_period_lamports
            .checked_add(amount_lamports)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        require!(
            next_spent <= limit.max_lamports,
            TokenomicsError::SpendingLimitExceeded
        );
        transfer_owned_lamports(
            &ctx.accounts.treasury_sol_vault.to_account_info(),
            &ctx.accounts.destination.to_account_info(),
            amount_lamports,
        )?;
        limit.spent_in_period_lamports = next_spent;
        emit!(SpendingLimitUsed {
            limit_id: limit.limit_id,
            amount_lamports,
            spent_in_period_lamports: next_spent,
            destination: limit.destination,
        });
        Ok(())
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        require!(
            ctx.accounts.guardian.key() == ctx.accounts.token_config.guardian,
            TokenomicsError::Unauthorized
        );
        let config = &mut ctx.accounts.token_config;
        require!(!config.paused, TokenomicsError::AlreadyPaused);
        config.paused = true;
        config.unpause_available_at = 0;
        emit!(EmergencyPauseActivated {
            guardian: ctx.accounts.guardian.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    pub fn announce_unpause(
        ctx: Context<AnnounceUnpause>,
        incident_record_hash: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.governance.key() == ctx.accounts.token_config.governance,
            TokenomicsError::Unauthorized
        );
        require!(
            incident_record_hash != [0; 32],
            TokenomicsError::InvalidIncidentRecord
        );
        let config = &mut ctx.accounts.token_config;
        require!(config.paused, TokenomicsError::NotPaused);
        config.unpause_available_at = Clock::get()?
            .unix_timestamp
            .checked_add(UNPAUSE_NOTICE_SECONDS)
            .ok_or(TokenomicsError::ArithmeticOverflow)?;
        emit!(UnpauseAnnounced {
            incident_record_hash,
            available_at: config.unpause_available_at,
        });
        Ok(())
    }

    pub fn unpause(ctx: Context<AnnounceUnpause>) -> Result<()> {
        require!(
            ctx.accounts.governance.key() == ctx.accounts.token_config.governance,
            TokenomicsError::Unauthorized
        );
        let config = &mut ctx.accounts.token_config;
        require!(config.paused, TokenomicsError::NotPaused);
        require!(
            config.unpause_available_at > 0
                && Clock::get()?.unix_timestamp >= config.unpause_available_at,
            TokenomicsError::UnpauseNoticePending
        );
        config.paused = false;
        config.unpause_available_at = 0;
        emit!(EmergencyPauseLifted {
            governance: ctx.accounts.governance.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}

fn revoke_mint_authority<'info>(
    token_program: &Program<'info, Token>,
    mint: &Account<'info, Mint>,
    config: &Account<'info, TokenConfig>,
    signer: &[&[u8]],
    authority_type: AuthorityType,
) -> Result<()> {
    token::set_authority(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            SetAuthority {
                account_or_mint: mint.to_account_info(),
                current_authority: config.to_account_info(),
            },
            &[signer],
        ),
        authority_type,
        None,
    )
}

fn require_not_paused(config: &TokenConfig) -> Result<()> {
    require!(!config.paused, TokenomicsError::ProtocolPaused);
    Ok(())
}

fn transfer_tokens_from_signer<'info>(
    token_program: &Program<'info, Token>,
    mint: &Account<'info, Mint>,
    source: &Account<'info, TokenAccount>,
    destination: &Account<'info, TokenAccount>,
    authority: &Signer<'info>,
    amount: u64,
) -> Result<()> {
    token::transfer_checked(
        CpiContext::new(
            token_program.to_account_info(),
            TransferChecked {
                from: source.to_account_info(),
                mint: mint.to_account_info(),
                to: destination.to_account_info(),
                authority: authority.to_account_info(),
            },
        ),
        amount,
        TOKEN_DECIMALS,
    )
}

fn transfer_campaign_tokens<'info>(
    token_program: &Program<'info, Token>,
    mint: &Account<'info, Mint>,
    campaign_vault: &Account<'info, TokenAccount>,
    destination: &Account<'info, TokenAccount>,
    config: &Account<'info, TokenConfig>,
    amount: u64,
) -> Result<()> {
    transfer_campaign_tokens_to_info(
        token_program,
        mint,
        campaign_vault,
        &destination.to_account_info(),
        config,
        amount,
    )
}

fn transfer_campaign_tokens_to_info<'info>(
    token_program: &Program<'info, Token>,
    mint: &Account<'info, Mint>,
    campaign_vault: &Account<'info, TokenAccount>,
    destination: &AccountInfo<'info>,
    config: &Account<'info, TokenConfig>,
    amount: u64,
) -> Result<()> {
    let bump = [config.bump];
    let signer: &[&[u8]] = &[b"token_config", &bump];
    token::transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked {
                from: campaign_vault.to_account_info(),
                mint: mint.to_account_info(),
                to: destination.clone(),
                authority: config.to_account_info(),
            },
            &[signer],
        ),
        amount,
        TOKEN_DECIMALS,
    )
}

fn apply_campaign_debit(campaign: &mut CampaignReserve, amount: u64) -> Result<()> {
    campaign.remaining_atoms = campaign
        .remaining_atoms
        .checked_sub(amount)
        .ok_or(TokenomicsError::ArithmeticOverflow)?;
    campaign.cumulative_distributed_atoms = campaign
        .cumulative_distributed_atoms
        .checked_add(amount)
        .ok_or(TokenomicsError::ArithmeticOverflow)?;
    if campaign.remaining_atoms == 0 {
        campaign.state = CampaignState::Exhausted;
        emit!(PromotionCampaignExhausted {
            campaign_id: campaign.campaign_id,
            cumulative_distributed_atoms: campaign.cumulative_distributed_atoms,
        });
    }
    Ok(())
}

fn require_campaign_active(campaign: &CampaignReserve) -> Result<()> {
    require!(
        campaign.state == CampaignState::Funded
            && !campaign.paused
            && campaign.economic_config_hash == CAMPAIGN_V2_ECONOMIC_CONFIG_HASH
            && campaign.unused_balance_policy_hash == CAMPAIGN_UNUSED_BALANCE_POLICY_HASH,
        TokenomicsError::CampaignNotActive
    );
    Ok(())
}

#[cfg(any(feature = "devnet-campaign-v2-migration", test))]
fn validate_initial_campaign_v2_migration(
    campaign: &CampaignReserve,
    vault_amount: u64,
) -> Result<()> {
    let accounted_atoms = campaign
        .cumulative_distributed_atoms
        .checked_add(campaign.remaining_atoms)
        .ok_or(TokenomicsError::ArithmeticOverflow)?;
    require!(
        campaign.campaign_id == 0
            && campaign.state == CampaignState::Funded
            && !campaign.paused
            && campaign.economic_config_hash == INITIAL_CAMPAIGN_V1_ECONOMIC_CONFIG_HASH
            && campaign.unused_balance_policy_hash == CAMPAIGN_UNUSED_BALANCE_POLICY_HASH
            && campaign.original_allocation_atoms == INITIAL_CAMPAIGN_ATOMS
            && accounted_atoms == campaign.original_allocation_atoms
            && vault_amount == campaign.remaining_atoms,
        TokenomicsError::InvalidCampaignConfiguration
    );
    Ok(())
}

fn emit_reward(campaign: &CampaignReserve, receipt: &CampaignRewardReceipt) {
    emit!(CampaignRewardSettled {
        campaign_id: campaign.campaign_id,
        action_id: receipt.action_id,
        beneficiary: receipt.beneficiary,
        kind: receipt.kind,
        nominal_atoms: receipt.nominal_atoms,
        paid_atoms: receipt.paid_atoms,
        final_partial: receipt.final_partial,
        remaining_campaign_atoms: campaign.remaining_atoms,
    });
}

fn validate_sorted_voter_accounts(
    accounts: &[AccountInfo<'_>],
    expected_mint: Pubkey,
) -> Result<()> {
    let mut previous_owner: Option<Pubkey> = None;
    for account_info in accounts {
        require!(
            account_info.owner == &anchor_spl::token::ID,
            TokenomicsError::InvalidTokenProgram
        );
        let token_account = TokenAccount::try_deserialize(
            &mut account_info
                .try_borrow_data()
                .map_err(|_| TokenomicsError::InvalidTokenAccount)?
                .as_ref(),
        )
        .map_err(|_| TokenomicsError::InvalidTokenAccount)?;
        require!(
            token_account.mint == expected_mint,
            TokenomicsError::InvalidMint
        );
        if let Some(previous) = previous_owner {
            require!(
                previous < token_account.owner,
                TokenomicsError::InvalidVoterOrder
            );
        }
        previous_owner = Some(token_account.owner);
    }
    Ok(())
}

fn available_lamports(account: &AccountInfo<'_>) -> Result<u64> {
    let minimum = Rent::get()?.minimum_balance(account.data_len());
    account
        .lamports()
        .checked_sub(minimum)
        .ok_or_else(|| error!(TokenomicsError::VaultBelowRentExemption))
}

fn transfer_owned_lamports(
    source: &AccountInfo<'_>,
    destination: &AccountInfo<'_>,
    amount: u64,
) -> Result<()> {
    require!(
        source.owner == &crate::ID,
        TokenomicsError::InvalidVaultOwner
    );
    require!(
        available_lamports(source)? >= amount,
        TokenomicsError::InsufficientVaultBalance
    );
    let source_after = source
        .lamports()
        .checked_sub(amount)
        .ok_or(TokenomicsError::ArithmeticOverflow)?;
    let destination_after = destination
        .lamports()
        .checked_add(amount)
        .ok_or(TokenomicsError::ArithmeticOverflow)?;
    **source.try_borrow_mut_lamports()? = source_after;
    **destination.try_borrow_mut_lamports()? = destination_after;
    Ok(())
}

fn validate_operation(
    operation: &ScheduledTreasuryOperation,
    asset: TreasuryAsset,
    destination: Pubkey,
) -> Result<()> {
    require!(
        operation.state == TreasuryOperationState::Scheduled,
        TokenomicsError::InvalidOperationState
    );
    require!(operation.asset == asset, TokenomicsError::OperationMismatch);
    require!(
        operation.destination == destination,
        TokenomicsError::OperationMismatch
    );
    require!(
        Clock::get()?.unix_timestamp >= operation.execute_after,
        TokenomicsError::TreasuryOperationNotExecutable
    );
    Ok(())
}

fn mark_operation_executed(operation: &mut ScheduledTreasuryOperation) -> Result<()> {
    operation.state = TreasuryOperationState::Executed;
    operation.executed_at = Clock::get()?.unix_timestamp;
    emit!(TreasuryOperationExecuted {
        operation_id: operation.operation_id,
        asset: operation.asset,
        destination: operation.destination,
        amount: operation.amount,
    });
    Ok(())
}

fn spending_limit_hash(args: &ActivateSpendingLimitArgs) -> [u8; 32] {
    hashv(&[
        // Existing scheduled operations commit to this legacy protocol domain.
        b"idealer:treasury-spending-limit:v1",
        &args.limit_id.to_le_bytes(),
        args.operator.as_ref(),
        args.destination.as_ref(),
        &args.max_lamports.to_le_bytes(),
        &args.period_seconds.to_le_bytes(),
    ])
    .to_bytes()
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeGenesisArgs {
    pub governance: Pubkey,
    pub guardian: Pubkey,
    pub game_authority: Pubkey,
    pub epoch_root_publisher: Pubkey,
    pub network: String,
    pub metadata_uri: String,
    pub initial_campaign_config_hash: [u8; 32],
    pub initial_unused_balance_policy_hash: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PublishProvisionalRootArgs {
    pub root_version: u32,
    pub total_weight: u128,
    pub sum_of_merkle_claims_lamports: u64,
    pub merkle_root: [u8; 32],
    pub manifest_hash: [u8; 32],
    pub leaf_file_hash: [u8; 32],
    pub calculation_code_commit: [u8; 32],
    pub artifact_uri: String,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ChallengeEpochRootArgs {
    pub root_version: u32,
    pub reason_code: u16,
    pub evidence_hash: [u8; 32],
    pub evidence_uri: String,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ClaimDistributionArgs {
    pub epoch_id: u64,
    pub root_version: u32,
    pub position: Pubkey,
    pub beneficiary: Pubkey,
    pub amount_lamports: u64,
    pub proof: Vec<[u8; 32]>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SettleActionRewardArgs {
    pub action_id: [u8; 32],
    pub kind: ActionRewardKind,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SettleActiveRuleRewardsArgs {
    pub turn_id: u64,
    pub alternative_prize_pool_lamports: u64,
    pub winner_count: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ScheduleTreasuryOperationArgs {
    pub operation_id: u64,
    pub asset: TreasuryAsset,
    pub destination: Pubkey,
    pub amount: u64,
    pub purpose_hash: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateFutureCampaignDraftArgs {
    pub campaign_id: u64,
    pub economic_config_hash: [u8; 32],
    pub unused_balance_policy_hash: [u8; 32],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ActivateSpendingLimitArgs {
    pub limit_id: u64,
    pub operator: Pubkey,
    pub destination: Pubkey,
    pub max_lamports: u64,
    pub period_seconds: i64,
}

#[derive(Accounts)]
#[instruction(args: InitializeGenesisArgs)]
pub struct InitializeGenesis<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + TokenConfig::INIT_SPACE,
        seeds = [b"token_config"],
        bump
    )]
    pub token_config: Box<Account<'info, TokenConfig>>,
    #[account(
        init,
        payer = payer,
        space = 8 + TreasuryPolicyExecutor::INIT_SPACE,
        seeds = [b"treasury_policy_executor"],
        bump
    )]
    pub treasury_policy_executor: Box<Account<'info, TreasuryPolicyExecutor>>,
    #[account(
        init,
        payer = payer,
        mint::decimals = TOKEN_DECIMALS,
        mint::authority = token_config,
        mint::freeze_authority = token_config
    )]
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: The address is constrained to the canonical Metaplex metadata PDA,
    /// and the Metaplex program creates and owns it in this instruction.
    #[account(
        mut,
        address = mpl_token_metadata::accounts::Metadata::find_pda(&mint.key()).0
    )]
    pub metadata: UncheckedAccount<'info>,
    /// CHECK: This devnet rehearsal binds metadata updates to the same Squads
    /// vault that governs Tokenomics Core. It is not required to sign creation.
    #[account(address = args.governance)]
    pub governance: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        token::mint = mint,
        token::authority = treasury_policy_executor,
        seeds = [b"creator_treasury_reserve_vault"],
        bump
    )]
    pub creator_treasury_reserve_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        token::mint = mint,
        token::authority = token_config,
        seeds = [b"treasury_lock_escrow"],
        bump
    )]
    pub treasury_lock_escrow: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        token::mint = mint,
        token::authority = token_config,
        seeds = [b"campaign_vault", 0u64.to_le_bytes().as_ref()],
        bump
    )]
    pub initial_campaign_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = payer,
        space = 8 + CampaignReserve::INIT_SPACE,
        seeds = [b"campaign", 0u64.to_le_bytes().as_ref()],
        bump
    )]
    pub initial_campaign: Box<Account<'info, CampaignReserve>>,
    #[account(
        init,
        payer = payer,
        space = 8 + LockPosition::INIT_SPACE,
        seeds = [b"lock_position", args.governance.as_ref()],
        bump
    )]
    pub treasury_lock_position: Box<Account<'info, LockPosition>>,
    #[account(
        init,
        payer = payer,
        space = 8 + DistributionVaultRecord::INIT_SPACE,
        seeds = [b"distribution_vault"],
        bump
    )]
    pub distribution_vault: Box<Account<'info, DistributionVaultRecord>>,
    #[account(
        init,
        payer = payer,
        space = 8 + TreasurySolVaultRecord::INIT_SPACE,
        seeds = [b"treasury_sol_vault"],
        bump
    )]
    pub treasury_sol_vault: Box<Account<'info, TreasurySolVaultRecord>>,
    #[account(
        init,
        payer = payer,
        space = 8 + CorrectionReserveVaultRecord::INIT_SPACE,
        seeds = [b"correction_reserve_vault"],
        bump
    )]
    pub correction_reserve_vault: Box<Account<'info, CorrectionReserveVaultRecord>>,
    pub metadata_program: Program<'info, Metadata>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CreateLockPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(address = token_config.mint)]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub source: Account<'info, TokenAccount>,
    pub return_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        address = token_config.treasury_lock_escrow
    )]
    pub treasury_lock_escrow: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = owner,
        space = 8 + LockPosition::INIT_SPACE,
        seeds = [b"lock_position", owner.key().as_ref()],
        bump
    )]
    pub lock_position: Account<'info, LockPosition>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TopUpLock<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(address = token_config.mint)]
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub source: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"lock_position", owner.key().as_ref()],
        bump = lock_position.bump,
        constraint = lock_position.beneficial_owner == owner.key() @ TokenomicsError::Unauthorized,
        constraint = lock_position.mint == token_config.mint @ TokenomicsError::InvalidMint
    )]
    pub lock_position: Account<'info, LockPosition>,
    #[account(mut, address = token_config.treasury_lock_escrow)]
    pub treasury_lock_escrow: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UnlockTokens<'info> {
    pub unlock_authority: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(address = token_config.mint)]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"lock_position", lock_position.beneficial_owner.as_ref()],
        bump = lock_position.bump,
        constraint = lock_position.mint == token_config.mint @ TokenomicsError::InvalidMint
    )]
    pub lock_position: Account<'info, LockPosition>,
    #[account(mut, address = token_config.treasury_lock_escrow)]
    pub treasury_lock_escrow: Account<'info, TokenAccount>,
    #[account(mut)]
    pub return_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(epoch_id: u64)]
pub struct OpenDistributionEpoch<'info> {
    #[account(mut)]
    pub publisher: Signer<'info>,
    #[account(mut, seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        init,
        payer = publisher,
        space = 8 + DistributionEpoch::INIT_SPACE,
        seeds = [b"epoch", epoch_id.to_le_bytes().as_ref()],
        bump
    )]
    pub epoch: Account<'info, DistributionEpoch>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(correction_epoch_id: u64, original_epoch_id: u64)]
pub struct OpenCorrectionEpoch<'info> {
    #[account(mut)]
    pub governance: Signer<'info>,
    #[account(mut, seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        init,
        payer = governance,
        space = 8 + DistributionEpoch::INIT_SPACE,
        seeds = [
            b"epoch",
            (correction_epoch_id | (1u64 << 63)).to_le_bytes().as_ref()
        ],
        bump
    )]
    pub epoch: Account<'info, DistributionEpoch>,
    #[account(
        seeds = [b"epoch", original_epoch_id.to_le_bytes().as_ref()],
        bump = original_epoch.bump
    )]
    pub original_epoch: Account<'info, DistributionEpoch>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositTreasuryFee<'info> {
    #[account(mut)]
    pub fee_payer: Signer<'info>,
    pub game_authority: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        mut,
        seeds = [b"epoch", epoch.epoch_id.to_le_bytes().as_ref()],
        bump = epoch.bump
    )]
    pub epoch: Account<'info, DistributionEpoch>,
    #[account(
        mut,
        address = token_config.distribution_vault,
        seeds = [b"distribution_vault"],
        bump = distribution_vault.bump
    )]
    pub distribution_vault: Account<'info, DistributionVaultRecord>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RecordExternalTreasuryFee<'info> {
    pub game_authority: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        mut,
        seeds = [b"epoch", epoch.epoch_id.to_le_bytes().as_ref()],
        bump = epoch.bump
    )]
    pub epoch: Account<'info, DistributionEpoch>,
    #[account(
        mut,
        address = token_config.distribution_vault,
        seeds = [b"distribution_vault"],
        bump = distribution_vault.bump
    )]
    pub distribution_vault: Account<'info, DistributionVaultRecord>,
}

#[derive(Accounts)]
pub struct CloseEpochCollection<'info> {
    pub game_authority: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        mut,
        seeds = [b"epoch", epoch.epoch_id.to_le_bytes().as_ref()],
        bump = epoch.bump
    )]
    pub epoch: Account<'info, DistributionEpoch>,
}

#[derive(Accounts)]
pub struct PublishProvisionalRoot<'info> {
    pub publisher: Signer<'info>,
    #[account(mut, seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        mut,
        seeds = [b"epoch", epoch.epoch_id.to_le_bytes().as_ref()],
        bump = epoch.bump
    )]
    pub epoch: Account<'info, DistributionEpoch>,
    #[account(
        address = token_config.distribution_vault,
        seeds = [b"distribution_vault"],
        bump = distribution_vault.bump
    )]
    pub distribution_vault: Account<'info, DistributionVaultRecord>,
    #[account(
        address = token_config.correction_reserve_vault,
        seeds = [b"correction_reserve_vault"],
        bump = correction_reserve_vault.bump
    )]
    pub correction_reserve_vault: Account<'info, CorrectionReserveVaultRecord>,
}

#[derive(Accounts)]
#[instruction(args: ChallengeEpochRootArgs)]
pub struct ChallengeEpochRoot<'info> {
    #[account(mut)]
    pub challenger: Signer<'info>,
    #[account(
        mut,
        seeds = [b"epoch", epoch.epoch_id.to_le_bytes().as_ref()],
        bump = epoch.bump
    )]
    pub epoch: Account<'info, DistributionEpoch>,
    #[account(
        init,
        payer = challenger,
        space = 8 + EpochRootChallenge::INIT_SPACE,
        seeds = [
            b"challenge",
            epoch.key().as_ref(),
            args.root_version.to_le_bytes().as_ref(),
            args.evidence_hash.as_ref()
        ],
        bump
    )]
    pub challenge: Account<'info, EpochRootChallenge>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ResolveEpochChallenge<'info> {
    pub governance: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        mut,
        seeds = [b"epoch", epoch.epoch_id.to_le_bytes().as_ref()],
        bump = epoch.bump
    )]
    pub epoch: Account<'info, DistributionEpoch>,
    #[account(
        mut,
        seeds = [
            b"challenge",
            epoch.key().as_ref(),
            challenge.root_version.to_le_bytes().as_ref(),
            challenge.evidence_hash.as_ref()
        ],
        bump = challenge.bump,
        constraint = challenge.challenger == challenger.key() @ TokenomicsError::InvalidChallenge
    )]
    pub challenge: Account<'info, EpochRootChallenge>,
    /// CHECK: Bound to the challenger stored in the challenge account.
    #[account(mut)]
    pub challenger: UncheckedAccount<'info>,
    #[account(
        mut,
        address = token_config.correction_reserve_vault,
        seeds = [b"correction_reserve_vault"],
        bump = correction_reserve_vault.bump
    )]
    pub correction_reserve_vault: Account<'info, CorrectionReserveVaultRecord>,
}

#[derive(Accounts)]
pub struct ExpireUnresolvedRoot<'info> {
    #[account(
        mut,
        seeds = [b"epoch", epoch.epoch_id.to_le_bytes().as_ref()],
        bump = epoch.bump
    )]
    pub epoch: Account<'info, DistributionEpoch>,
}

#[derive(Accounts)]
pub struct RefundExpiredChallenge<'info> {
    #[account(
        mut,
        seeds = [b"epoch", epoch.epoch_id.to_le_bytes().as_ref()],
        bump = epoch.bump
    )]
    pub epoch: Account<'info, DistributionEpoch>,
    #[account(
        mut,
        seeds = [
            b"challenge",
            epoch.key().as_ref(),
            challenge.root_version.to_le_bytes().as_ref(),
            challenge.evidence_hash.as_ref()
        ],
        bump = challenge.bump
    )]
    pub challenge: Account<'info, EpochRootChallenge>,
    /// CHECK: Bound to the challenge's stored beneficiary.
    #[account(mut)]
    pub challenger: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SealEpochRoot<'info> {
    #[account(mut, seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        mut,
        seeds = [b"epoch", epoch.epoch_id.to_le_bytes().as_ref()],
        bump = epoch.bump
    )]
    pub epoch: Account<'info, DistributionEpoch>,
    #[account(
        address = token_config.distribution_vault,
        seeds = [b"distribution_vault"],
        bump = distribution_vault.bump
    )]
    pub distribution_vault: Account<'info, DistributionVaultRecord>,
    #[account(
        address = token_config.correction_reserve_vault,
        seeds = [b"correction_reserve_vault"],
        bump = correction_reserve_vault.bump
    )]
    pub correction_reserve_vault: Account<'info, CorrectionReserveVaultRecord>,
}

#[derive(Accounts)]
#[instruction(args: ClaimDistributionArgs)]
pub struct ClaimDistribution<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,
    #[account(mut, seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        mut,
        seeds = [b"epoch", args.epoch_id.to_le_bytes().as_ref()],
        bump = epoch.bump
    )]
    pub epoch: Account<'info, DistributionEpoch>,
    #[account(
        init,
        payer = caller,
        space = 8 + TreasuryDistributionClaim::INIT_SPACE,
        seeds = [
            b"distribution_claim",
            args.epoch_id.to_le_bytes().as_ref(),
            args.position.as_ref()
        ],
        bump
    )]
    pub claim: Account<'info, TreasuryDistributionClaim>,
    #[account(
        mut,
        address = token_config.distribution_vault,
        seeds = [b"distribution_vault"],
        bump = distribution_vault.bump
    )]
    pub distribution_vault: Account<'info, DistributionVaultRecord>,
    #[account(
        mut,
        address = token_config.correction_reserve_vault,
        seeds = [b"correction_reserve_vault"],
        bump = correction_reserve_vault.bump
    )]
    pub correction_reserve_vault: Account<'info, CorrectionReserveVaultRecord>,
    #[account(
        mut,
        address = token_config.treasury_sol_vault,
        seeds = [b"treasury_sol_vault"],
        bump = treasury_sol_vault.bump
    )]
    pub treasury_sol_vault: Account<'info, TreasurySolVaultRecord>,
    /// CHECK: The address is bound to the signed Merkle leaf.
    #[account(mut, address = args.beneficiary)]
    pub beneficiary: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: SettleActionRewardArgs)]
pub struct SettleActionReward<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub game_authority: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(address = token_config.mint)]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.campaign_id.to_le_bytes().as_ref()],
        bump = campaign.bump,
        constraint = campaign.mint == token_config.mint @ TokenomicsError::InvalidMint
    )]
    pub campaign: Account<'info, CampaignReserve>,
    #[account(mut, address = campaign.vault)]
    pub campaign_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = beneficiary_token_account.mint == token_config.mint @ TokenomicsError::InvalidMint)]
    pub beneficiary_token_account: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = payer,
        space = 8 + CampaignRewardReceipt::INIT_SPACE,
        seeds = [b"campaign_reward", campaign.key().as_ref(), args.action_id.as_ref()],
        bump
    )]
    pub reward_receipt: Account<'info, CampaignRewardReceipt>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: SettleActiveRuleRewardsArgs)]
pub struct SettleActiveRuleRewards<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub game_authority: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(address = token_config.mint)]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.campaign_id.to_le_bytes().as_ref()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, CampaignReserve>,
    #[account(mut, address = campaign.vault)]
    pub campaign_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = creator_token_account.mint == token_config.mint @ TokenomicsError::InvalidMint)]
    pub creator_token_account: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = payer,
        space = 8 + ActiveRuleCreatorReward::INIT_SPACE,
        seeds = [b"active_rule_reward", campaign.key().as_ref(), args.turn_id.to_le_bytes().as_ref()],
        bump
    )]
    pub active_rule_reward: Account<'info, ActiveRuleCreatorReward>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(referral_code_hash: [u8; 32])]
pub struct AttributeReferral<'info> {
    #[account(mut)]
    pub invitee: Signer<'info>,
    /// CHECK: Public inviter identity; self-referral is rejected.
    pub inviter: UncheckedAccount<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        init,
        payer = invitee,
        space = 8 + ReferralAttribution::INIT_SPACE,
        seeds = [b"referral_attribution", invitee.key().as_ref()],
        bump
    )]
    pub attribution: Account<'info, ReferralAttribution>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleReferralBaseRewards<'info> {
    pub game_authority: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Box<Account<'info, TokenConfig>>,
    #[account(address = token_config.mint)]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"referral_attribution", attribution.invitee.as_ref()],
        bump = attribution.bump
    )]
    pub attribution: Account<'info, ReferralAttribution>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.campaign_id.to_le_bytes().as_ref()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, CampaignReserve>,
    #[account(mut, address = campaign.vault)]
    pub campaign_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub inviter_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub invitee_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(turn_id: u64, contribution_id: [u8; 32])]
pub struct RecordInviteeFirstRoundReward<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub game_authority: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        mut,
        seeds = [b"referral_attribution", attribution.invitee.as_ref()],
        bump = attribution.bump
    )]
    pub attribution: Account<'info, ReferralAttribution>,
    #[account(
        init,
        payer = payer,
        space = 8 + ReferralRewardContribution::INIT_SPACE,
        seeds = [
            b"referral_contribution",
            attribution.key().as_ref(),
            contribution_id.as_ref()
        ],
        bump
    )]
    pub contribution: Account<'info, ReferralRewardContribution>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleReferralBonus<'info> {
    pub game_authority: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(address = token_config.mint)]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"referral_attribution", attribution.invitee.as_ref()],
        bump = attribution.bump
    )]
    pub attribution: Account<'info, ReferralAttribution>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.campaign_id.to_le_bytes().as_ref()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, CampaignReserve>,
    #[account(mut, address = campaign.vault)]
    pub campaign_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub inviter_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(args: CreateFutureCampaignDraftArgs)]
pub struct CreateFutureCampaignDraft<'info> {
    #[account(mut)]
    pub governance: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(address = token_config.mint)]
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = governance,
        token::mint = mint,
        token::authority = token_config,
        seeds = [b"campaign_vault", args.campaign_id.to_le_bytes().as_ref()],
        bump
    )]
    pub campaign_vault: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = governance,
        space = 8 + CampaignReserve::INIT_SPACE,
        seeds = [b"campaign", args.campaign_id.to_le_bytes().as_ref()],
        bump
    )]
    pub campaign: Account<'info, CampaignReserve>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundFutureCampaign<'info> {
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        seeds = [b"treasury_policy_executor"],
        bump = treasury_policy_executor.bump
    )]
    pub treasury_policy_executor: Account<'info, TreasuryPolicyExecutor>,
    #[account(
        mut,
        seeds = [b"treasury_operation", operation.operation_id.to_le_bytes().as_ref()],
        bump = operation.bump
    )]
    pub operation: Account<'info, ScheduledTreasuryOperation>,
    #[account(address = token_config.mint)]
    pub mint: Account<'info, Mint>,
    #[account(mut, address = token_config.creator_treasury_reserve_vault)]
    pub creator_treasury_reserve_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.campaign_id.to_le_bytes().as_ref()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, CampaignReserve>,
    #[account(mut, address = campaign.vault)]
    pub campaign_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct MigrateInitialCampaignToV2<'info> {
    pub governance: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        mut,
        seeds = [b"campaign", 0u64.to_le_bytes().as_ref()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, CampaignReserve>,
    #[account(address = campaign.vault)]
    pub campaign_vault: Account<'info, TokenAccount>,
}

#[derive(Accounts)]
pub struct PauseCampaign<'info> {
    pub guardian: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.campaign_id.to_le_bytes().as_ref()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, CampaignReserve>,
}

#[derive(Accounts)]
pub struct ResumeCampaign<'info> {
    pub governance: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.campaign_id.to_le_bytes().as_ref()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, CampaignReserve>,
}

#[derive(Accounts)]
#[instruction(args: ScheduleTreasuryOperationArgs)]
pub struct ScheduleTreasuryOperation<'info> {
    #[account(mut)]
    pub governance: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        mut,
        seeds = [b"treasury_policy_executor"],
        bump = treasury_policy_executor.bump
    )]
    pub treasury_policy_executor: Account<'info, TreasuryPolicyExecutor>,
    #[account(
        init,
        payer = governance,
        space = 8 + ScheduledTreasuryOperation::INIT_SPACE,
        seeds = [b"treasury_operation", args.operation_id.to_le_bytes().as_ref()],
        bump
    )]
    pub operation: Account<'info, ScheduledTreasuryOperation>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteTreasuryTokenOperation<'info> {
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        seeds = [b"treasury_policy_executor"],
        bump = treasury_policy_executor.bump
    )]
    pub treasury_policy_executor: Account<'info, TreasuryPolicyExecutor>,
    #[account(
        mut,
        seeds = [b"treasury_operation", operation.operation_id.to_le_bytes().as_ref()],
        bump = operation.bump
    )]
    pub operation: Account<'info, ScheduledTreasuryOperation>,
    #[account(address = token_config.mint)]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        address = token_config.creator_treasury_reserve_vault
    )]
    pub creator_treasury_reserve_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub destination: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ExecuteTreasurySolOperation<'info> {
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        mut,
        seeds = [b"treasury_operation", operation.operation_id.to_le_bytes().as_ref()],
        bump = operation.bump
    )]
    pub operation: Account<'info, ScheduledTreasuryOperation>,
    #[account(
        mut,
        address = token_config.treasury_sol_vault,
        seeds = [b"treasury_sol_vault"],
        bump = treasury_sol_vault.bump
    )]
    pub treasury_sol_vault: Account<'info, TreasurySolVaultRecord>,
    /// CHECK: Bound to the scheduled operation destination.
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CancelTreasuryOperation<'info> {
    pub governance: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        mut,
        seeds = [b"treasury_operation", operation.operation_id.to_le_bytes().as_ref()],
        bump = operation.bump
    )]
    pub operation: Account<'info, ScheduledTreasuryOperation>,
}

#[derive(Accounts)]
pub struct FundCorrectionReserve<'info> {
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        mut,
        seeds = [b"treasury_operation", operation.operation_id.to_le_bytes().as_ref()],
        bump = operation.bump
    )]
    pub operation: Account<'info, ScheduledTreasuryOperation>,
    #[account(
        mut,
        address = token_config.treasury_sol_vault,
        seeds = [b"treasury_sol_vault"],
        bump = treasury_sol_vault.bump
    )]
    pub treasury_sol_vault: Account<'info, TreasurySolVaultRecord>,
    #[account(
        mut,
        address = token_config.correction_reserve_vault,
        seeds = [b"correction_reserve_vault"],
        bump = correction_reserve_vault.bump
    )]
    pub correction_reserve_vault: Account<'info, CorrectionReserveVaultRecord>,
}

#[derive(Accounts)]
#[instruction(args: ActivateSpendingLimitArgs)]
pub struct ActivateSpendingLimit<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        mut,
        seeds = [b"treasury_operation", operation.operation_id.to_le_bytes().as_ref()],
        bump = operation.bump
    )]
    pub operation: Account<'info, ScheduledTreasuryOperation>,
    #[account(
        init,
        payer = payer,
        space = 8 + TreasurySpendingLimit::INIT_SPACE,
        seeds = [b"spending_limit", args.limit_id.to_le_bytes().as_ref()],
        bump
    )]
    pub spending_limit: Account<'info, TreasurySpendingLimit>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SpendWithinLimit<'info> {
    pub operator: Signer<'info>,
    #[account(seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
    #[account(
        mut,
        seeds = [b"spending_limit", spending_limit.limit_id.to_le_bytes().as_ref()],
        bump = spending_limit.bump
    )]
    pub spending_limit: Account<'info, TreasurySpendingLimit>,
    #[account(
        mut,
        address = token_config.treasury_sol_vault,
        seeds = [b"treasury_sol_vault"],
        bump = treasury_sol_vault.bump
    )]
    pub treasury_sol_vault: Account<'info, TreasurySolVaultRecord>,
    /// CHECK: Fixed in the spending-limit account.
    #[account(mut)]
    pub destination: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Pause<'info> {
    pub guardian: Signer<'info>,
    #[account(mut, seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
}

#[derive(Accounts)]
pub struct AnnounceUnpause<'info> {
    pub governance: Signer<'info>,
    #[account(mut, seeds = [b"token_config"], bump = token_config.bump)]
    pub token_config: Account<'info, TokenConfig>,
}

#[account]
#[derive(InitSpace)]
pub struct TokenConfig {
    pub governance: Pubkey,
    pub guardian: Pubkey,
    pub game_authority: Pubkey,
    pub epoch_root_publisher: Pubkey,
    pub mint: Pubkey,
    pub metadata: Pubkey,
    pub metadata_update_authority: Pubkey,
    #[max_len(MAX_METADATA_URI_BYTES)]
    pub metadata_uri: String,
    pub metadata_mutable: bool,
    pub creator_treasury_reserve_vault: Pubkey,
    pub treasury_lock_escrow: Pubkey,
    pub initial_campaign_vault: Pubkey,
    pub distribution_vault: Pubkey,
    pub treasury_sol_vault: Pubkey,
    pub correction_reserve_vault: Pubkey,
    #[max_len(MAX_NETWORK_BYTES)]
    pub network: String,
    pub next_epoch_id: u64,
    pub next_correction_epoch_id: u64,
    pub pending_rollover_lamports: u64,
    pub total_sealed_liability_remaining: u64,
    pub total_correction_liability_remaining: u64,
    pub paused: bool,
    pub unpause_available_at: i64,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct TreasuryPolicyExecutor {
    pub governance: Pubkey,
    pub delay_seconds: i64,
    pub next_operation_id: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LockPosition {
    pub beneficial_owner: Pubkey,
    pub unlock_authority: Pubkey,
    pub return_token_account: Pubkey,
    pub sol_claim_beneficiary: Pubkey,
    pub mint: Pubkey,
    pub locked_atoms: u64,
    pub created_at: i64,
    pub last_changed_at: i64,
    pub is_treasury: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct DistributionVaultRecord {
    pub total_deposited_lamports: u64,
    pub total_claimed_lamports: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct TreasurySolVaultRecord {
    pub total_received_lamports: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct CorrectionReserveVaultRecord {
    pub total_funded_lamports: u64,
    pub total_claimed_lamports: u64,
    pub rejected_bonds_lamports: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct DistributionEpoch {
    pub epoch_id: u64,
    pub kind: EpochKind,
    pub original_epoch_id: u64,
    pub first_turn_id: u64,
    pub last_turn_id: u64,
    pub finalised_fees_lamports: u64,
    pub rollover_in_lamports: u64,
    pub gross_distributable_lamports: u64,
    pub total_weight: u128,
    pub sum_of_merkle_claims_lamports: u64,
    pub remaining_claim_liability_lamports: u64,
    pub rounding_dust_lamports: u64,
    pub zero_weight_rollover_out_lamports: u64,
    pub rollover_out_lamports: u64,
    pub merkle_root: [u8; 32],
    pub manifest_hash: [u8; 32],
    pub leaf_file_hash: [u8; 32],
    pub calculation_code_commit: [u8; 32],
    pub incident_record_hash: [u8; 32],
    pub correction_reason_hash: [u8; 32],
    #[max_len(MAX_ARTIFACT_URI_BYTES)]
    pub artifact_uri: String,
    pub root_version: u32,
    pub provisional_published_at: i64,
    pub verification_window_ends_at: i64,
    pub challenge_resolution_deadline: i64,
    pub unresolved_challenges: u32,
    pub status: EpochStatus,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct EpochRootChallenge {
    pub epoch: Pubkey,
    pub epoch_id: u64,
    pub root_version: u32,
    pub challenger: Pubkey,
    pub reason_code: u16,
    pub evidence_hash: [u8; 32],
    #[max_len(MAX_REASON_URI_BYTES)]
    pub evidence_uri: String,
    pub bond_lamports: u64,
    pub status: ChallengeStatus,
    pub resolution_reason_hash: [u8; 32],
    pub created_at: i64,
    pub resolved_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct TreasuryDistributionClaim {
    pub epoch: Pubkey,
    pub epoch_id: u64,
    pub root_version: u32,
    pub leaf_hash: [u8; 32],
    pub position: Pubkey,
    pub beneficiary: Pubkey,
    pub amount_lamports: u64,
    pub claimed_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct CampaignReserve {
    pub campaign_id: u64,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub original_allocation_atoms: u64,
    pub cumulative_distributed_atoms: u64,
    pub remaining_atoms: u64,
    pub state: CampaignState,
    pub economic_config_hash: [u8; 32],
    pub unused_balance_policy_hash: [u8; 32],
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct CampaignRewardReceipt {
    pub campaign: Pubkey,
    pub action_id: [u8; 32],
    pub beneficiary: Pubkey,
    pub kind: CampaignRewardKind,
    pub nominal_atoms: u64,
    pub paid_atoms: u64,
    pub final_partial: bool,
    pub settled_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ActiveRuleCreatorReward {
    pub campaign: Pubkey,
    pub turn_id: u64,
    pub creator: Pubkey,
    pub individual_alternative_payout_lamports: u64,
    pub calculated_creator_atoms: u64,
    pub creator_paid_atoms: u64,
    pub calculated_voter_pool_atoms: u64,
    pub voter_pool_paid_atoms: u64,
    pub unique_voter_count: u32,
    pub settled_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ReferralAttribution {
    pub invitee: Pubkey,
    pub inviter: Pubkey,
    pub referral_code_hash: [u8; 32],
    pub qualifying_turn_id: u64,
    pub invitee_first_round_reward_atoms: u64,
    pub base_reward_settled: bool,
    pub bonus_settled: bool,
    pub attributed_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ReferralRewardContribution {
    pub attribution: Pubkey,
    pub contribution_id: [u8; 32],
    pub turn_id: u64,
    pub paid_atoms: u64,
    pub recorded_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct ScheduledTreasuryOperation {
    pub operation_id: u64,
    pub asset: TreasuryAsset,
    pub destination: Pubkey,
    pub amount: u64,
    pub purpose_hash: [u8; 32],
    pub scheduled_at: i64,
    pub execute_after: i64,
    pub executed_at: i64,
    pub cancelled_at: i64,
    pub state: TreasuryOperationState,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct TreasurySpendingLimit {
    pub limit_id: u64,
    pub operator: Pubkey,
    pub destination: Pubkey,
    pub max_lamports: u64,
    pub period_seconds: i64,
    pub period_started_at: i64,
    pub spent_in_period_lamports: u64,
    pub config_hash: [u8; 32],
    pub active: bool,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum EpochKind {
    Standard,
    Correction,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum EpochStatus {
    Collecting,
    Calculating,
    Provisional,
    Challenged,
    Cancelled,
    ExpiredUnresolved,
    Sealed,
    RolledOverNoWeight,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum ChallengeStatus {
    Unresolved,
    Accepted,
    Rejected,
    RefundedExpired,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum CampaignState {
    Draft,
    Funded,
    Exhausted,
    Ended,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum ActionRewardKind {
    Proposal,
    Supporter,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum CampaignRewardKind {
    Proposal,
    Supporter,
    ActiveRuleCreator,
    ElectedRuleVoterPool,
    ReferralInviter,
    ReferralInvitee,
    ReferralInviterFirstRoundBonus,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum TreasuryAsset {
    Sol,
    Token,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum TreasuryOperationState {
    Scheduled,
    Executed,
    Cancelled,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum LockChange {
    Locked,
    Unlocked,
}

#[event]
pub struct GenesisInitialized {
    pub mint: Pubkey,
    pub fixed_supply_atoms: u64,
    pub campaign_allocation_atoms: u64,
    pub treasury_locked_atoms: u64,
    pub governance: Pubkey,
}

#[event]
pub struct LockChanged {
    pub position: Pubkey,
    pub beneficial_owner: Pubkey,
    pub amount_atoms: u64,
    pub locked_atoms: u64,
    pub timestamp: i64,
    pub change: LockChange,
}

#[event]
pub struct EpochOpened {
    pub epoch_id: u64,
    pub first_turn_id: u64,
    pub last_turn_id: u64,
    pub rollover_in_lamports: u64,
}

#[event]
pub struct CorrectionEpochOpened {
    pub correction_epoch_id: u64,
    pub original_epoch_id: u64,
    pub incident_record_hash: [u8; 32],
    pub correction_reason_hash: [u8; 32],
}

#[event]
pub struct TreasuryFeeDeposited {
    pub epoch_id: u64,
    pub turn_id: u64,
    pub amount_lamports: u64,
    pub fee_payer: Pubkey,
}

#[event]
pub struct ExternalTreasuryFeeRecorded {
    pub epoch_id: u64,
    pub turn_id: u64,
    pub amount_lamports: u64,
    pub game_authority: Pubkey,
}

#[event]
pub struct EpochCollectionClosed {
    pub epoch_id: u64,
    pub finalised_fees_lamports: u64,
}

#[event]
pub struct ProvisionalRootPublished {
    pub epoch_id: u64,
    pub root_version: u32,
    pub merkle_root: [u8; 32],
    pub sum_of_merkle_claims_lamports: u64,
    pub verification_window_ends_at: i64,
}

#[event]
pub struct ZeroWeightEpochRolledOver {
    pub epoch_id: u64,
    pub rollover_out_lamports: u64,
}

#[event]
pub struct EpochRootChallenged {
    pub epoch_id: u64,
    pub root_version: u32,
    pub challenger: Pubkey,
    pub evidence_hash: [u8; 32],
    pub bond_lamports: u64,
}

#[event]
pub struct EpochChallengeResolved {
    pub epoch_id: u64,
    pub root_version: u32,
    pub challenger: Pubkey,
    pub accepted: bool,
    pub resolution_reason_hash: [u8; 32],
}

#[event]
pub struct EpochRootExpired {
    pub epoch_id: u64,
    pub root_version: u32,
}

#[event]
pub struct ExpiredChallengeBondRefunded {
    pub epoch_id: u64,
    pub root_version: u32,
    pub challenger: Pubkey,
    pub bond_lamports: u64,
}

#[event]
pub struct EpochRootSealed {
    pub epoch_id: u64,
    pub root_version: u32,
    pub merkle_root: [u8; 32],
    pub claim_liability_lamports: u64,
    pub rollover_out_lamports: u64,
}

#[event]
pub struct DistributionClaimed {
    pub epoch_id: u64,
    pub position: Pubkey,
    pub beneficiary: Pubkey,
    pub amount_lamports: u64,
    pub caller: Pubkey,
}

#[event]
pub struct CampaignRewardSettled {
    pub campaign_id: u64,
    pub action_id: [u8; 32],
    pub beneficiary: Pubkey,
    pub kind: CampaignRewardKind,
    pub nominal_atoms: u64,
    pub paid_atoms: u64,
    pub final_partial: bool,
    pub remaining_campaign_atoms: u64,
}

#[event]
pub struct ActiveRuleRewardsSettled {
    pub campaign_id: u64,
    pub turn_id: u64,
    pub creator: Pubkey,
    pub creator_paid_atoms: u64,
    pub voter_pool_paid_atoms: u64,
    pub unique_voter_count: u32,
    pub remaining_campaign_atoms: u64,
}

#[event]
pub struct PromotionCampaignExhausted {
    pub campaign_id: u64,
    pub cumulative_distributed_atoms: u64,
}

#[event]
pub struct FutureCampaignDraftCreated {
    pub campaign_id: u64,
    pub vault: Pubkey,
    pub economic_config_hash: [u8; 32],
    pub unused_balance_policy_hash: [u8; 32],
}

#[event]
pub struct FutureCampaignFunded {
    pub campaign_id: u64,
    pub vault: Pubkey,
    pub allocation_atoms: u64,
    pub source_operation_id: u64,
}

#[event]
pub struct CampaignPauseChanged {
    pub campaign_id: u64,
    pub paused: bool,
}

#[event]
pub struct ReferralAttributed {
    pub invitee: Pubkey,
    pub inviter: Pubkey,
    pub referral_code_hash: [u8; 32],
}

#[event]
pub struct ReferralBaseRewardsSettled {
    pub campaign_id: u64,
    pub invitee: Pubkey,
    pub inviter: Pubkey,
    pub turn_id: u64,
    pub inviter_paid_atoms: u64,
    pub invitee_paid_atoms: u64,
    pub remaining_campaign_atoms: u64,
}

#[event]
pub struct ReferralBonusSettled {
    pub campaign_id: u64,
    pub invitee: Pubkey,
    pub inviter: Pubkey,
    pub turn_id: u64,
    pub bonus_base_atoms: u64,
    pub nominal_atoms: u64,
    pub paid_atoms: u64,
    pub remaining_campaign_atoms: u64,
}

#[event]
pub struct TreasuryOperationScheduled {
    pub operation_id: u64,
    pub asset: TreasuryAsset,
    pub destination: Pubkey,
    pub amount: u64,
    pub execute_after: i64,
    pub purpose_hash: [u8; 32],
}

#[event]
pub struct TreasuryOperationExecuted {
    pub operation_id: u64,
    pub asset: TreasuryAsset,
    pub destination: Pubkey,
    pub amount: u64,
}

#[event]
pub struct TreasuryOperationCancelled {
    pub operation_id: u64,
}

#[event]
pub struct SpendingLimitActivated {
    pub limit_id: u64,
    pub operator: Pubkey,
    pub destination: Pubkey,
    pub max_lamports: u64,
    pub period_seconds: i64,
    pub config_hash: [u8; 32],
}

#[event]
pub struct SpendingLimitUsed {
    pub limit_id: u64,
    pub amount_lamports: u64,
    pub spent_in_period_lamports: u64,
    pub destination: Pubkey,
}

#[event]
pub struct EmergencyPauseActivated {
    pub guardian: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct UnpauseAnnounced {
    pub incident_record_hash: [u8; 32],
    pub available_at: i64,
}

#[event]
pub struct EmergencyPauseLifted {
    pub governance: Pubkey,
    pub timestamp: i64,
}

#[error_code]
pub enum TokenomicsError {
    #[msg("The signer is not authorized.")]
    Unauthorized,
    #[msg("The configured authority is invalid.")]
    InvalidAuthority,
    #[msg("The game authority is invalid.")]
    UnauthorizedGame,
    #[msg("The protocol is paused.")]
    ProtocolPaused,
    #[msg("The amount must be positive.")]
    InvalidAmount,
    #[msg("Arithmetic overflow or underflow.")]
    ArithmeticOverflow,
    #[msg("The fixed supply invariant was violated.")]
    SupplyInvariantViolation,
    #[msg("The token mint is invalid.")]
    InvalidMint,
    #[msg("The token metadata configuration is invalid.")]
    InvalidMetadata,
    #[msg("The token owner is invalid.")]
    InvalidTokenOwner,
    #[msg("The SPL token program is invalid.")]
    InvalidTokenProgram,
    #[msg("The token account is invalid.")]
    InvalidTokenAccount,
    #[msg("The lock does not have enough tokens.")]
    InsufficientLockedBalance,
    #[msg("The unlocked-token return destination is invalid.")]
    InvalidReturnDestination,
    #[msg("The network identifier is invalid.")]
    InvalidNetwork,
    #[msg("The epoch identifier is invalid.")]
    InvalidEpoch,
    #[msg("The epoch state does not permit this operation.")]
    InvalidEpochStatus,
    #[msg("The turn does not belong to this epoch.")]
    TurnOutsideEpoch,
    #[msg("Seven completed turns have not been finalised.")]
    EpochTurnsIncomplete,
    #[msg("The declared claim total is invalid.")]
    InvalidDeclaredClaims,
    #[msg("The artifact URI is invalid.")]
    InvalidArtifactUri,
    #[msg(
        "The calculation artifacts must use non-zero content hashes and a non-zero code commit."
    )]
    InvalidCalculationArtifact,
    #[msg("The Merkle root is invalid.")]
    InvalidMerkleRoot,
    #[msg("The Merkle tree cannot be empty.")]
    EmptyMerkleTree,
    #[msg("The Merkle proof is invalid.")]
    InvalidMerkleProof,
    #[msg("The Merkle proof exceeds the maximum depth.")]
    MerkleProofTooDeep,
    #[msg("The distribution vault cannot cover all sealed and proposed liabilities.")]
    DistributionVaultInsolvent,
    #[msg("The distribution vault would fall below rent exemption.")]
    VaultBelowRentExemption,
    #[msg("The challenge evidence is invalid.")]
    InvalidEvidence,
    #[msg("The root version is invalid.")]
    InvalidRootVersion,
    #[msg("The root challenge window is closed.")]
    ChallengeWindowClosed,
    #[msg("The challenge is invalid.")]
    InvalidChallenge,
    #[msg("The challenge was already resolved.")]
    ChallengeAlreadyResolved,
    #[msg("The challenge resolution deadline has passed.")]
    ChallengeResolutionDeadlinePassed,
    #[msg("The challenge resolution deadline is still open.")]
    ChallengeResolutionStillOpen,
    #[msg("Unresolved challenges block sealing.")]
    UnresolvedChallenges,
    #[msg("The verification window is still open.")]
    VerificationWindowOpen,
    #[msg("The epoch root is not sealed.")]
    EpochNotSealed,
    #[msg("The claim beneficiary is invalid.")]
    InvalidBeneficiary,
    #[msg("The treasury position must claim only to the fixed Treasury SOL Vault, which is reserved for that position.")]
    InvalidTreasuryClaimDestination,
    #[msg("The claim exceeds the sealed remaining liability.")]
    ClaimExceedsLiability,
    #[msg("A lock position appears more than once in the epoch input.")]
    DuplicatePosition,
    #[msg("The campaign is not active.")]
    CampaignNotActive,
    #[msg("The campaign identifier is invalid.")]
    InvalidCampaignId,
    #[msg("The campaign configuration is invalid.")]
    InvalidCampaignConfiguration,
    #[msg("Funding froze this campaign configuration.")]
    CampaignConfigurationFrozen,
    #[msg("The alternative winner count must be positive.")]
    InvalidWinnerCount,
    #[msg("There are no eligible voters.")]
    NoEligibleVoters,
    #[msg("Voter token accounts are not unique and canonically ordered.")]
    InvalidVoterOrder,
    #[msg("Self-referrals are forbidden.")]
    SelfReferral,
    #[msg("The referral reward was already settled.")]
    ReferralAlreadySettled,
    #[msg("The referral state is invalid.")]
    InvalidReferralState,
    #[msg("The treasury operation identifier is invalid.")]
    InvalidOperationId,
    #[msg("The treasury operation state is invalid.")]
    InvalidOperationState,
    #[msg("The treasury operation does not match its scheduled asset or destination.")]
    OperationMismatch,
    #[msg("The treasury operation is not yet executable.")]
    TreasuryOperationNotExecutable,
    #[msg("The destination is invalid.")]
    InvalidDestination,
    #[msg("The vault is not owned by Tokenomics Core.")]
    InvalidVaultOwner,
    #[msg("The vault has insufficient balance above rent exemption.")]
    InsufficientVaultBalance,
    #[msg("The protocol is already paused.")]
    AlreadyPaused,
    #[msg("The protocol is not paused.")]
    NotPaused,
    #[msg("The 24-hour unpause notice has not elapsed.")]
    UnpauseNoticePending,
    #[msg("A correction epoch must contain only positive additional entitlements.")]
    CorrectionMustBePositive,
    #[msg("A correction epoch must reference an existing sealed standard epoch.")]
    CorrectionRequiresSealedEpoch,
    #[msg("The correction reserve cannot cover all correction liabilities.")]
    CorrectionReserveInsolvent,
    #[msg("The spending limit configuration is invalid.")]
    InvalidSpendingLimit,
    #[msg("The spending limit is inactive.")]
    SpendingLimitInactive,
    #[msg("The requested spend exceeds the active period limit.")]
    SpendingLimitExceeded,
    #[msg("The public incident record hash is invalid.")]
    InvalidIncidentRecord,
}

#[cfg(test)]
mod metadata_uri_policy_tests {
    use super::*;

    fn campaign_with_hash(economic_config_hash: [u8; 32]) -> CampaignReserve {
        CampaignReserve {
            campaign_id: 0,
            mint: Pubkey::new_unique(),
            vault: Pubkey::new_unique(),
            original_allocation_atoms: INITIAL_CAMPAIGN_ATOMS,
            cumulative_distributed_atoms: PROPOSAL_REWARD_ATOMS,
            remaining_atoms: INITIAL_CAMPAIGN_ATOMS - PROPOSAL_REWARD_ATOMS,
            state: CampaignState::Funded,
            economic_config_hash,
            unused_balance_policy_hash: CAMPAIGN_UNUSED_BALANCE_POLICY_HASH,
            paused: false,
            bump: 255,
        }
    }

    #[test]
    fn only_the_exact_legacy_campaign_can_migrate_to_v2() {
        let campaign = campaign_with_hash(INITIAL_CAMPAIGN_V1_ECONOMIC_CONFIG_HASH);
        assert!(
            validate_initial_campaign_v2_migration(&campaign, campaign.remaining_atoms).is_ok()
        );

        let already_v2 = campaign_with_hash(CAMPAIGN_V2_ECONOMIC_CONFIG_HASH);
        assert!(
            validate_initial_campaign_v2_migration(&already_v2, already_v2.remaining_atoms)
                .is_err()
        );

        let mismatched_vault = campaign.remaining_atoms - 1;
        assert!(validate_initial_campaign_v2_migration(&campaign, mismatched_vault).is_err());
    }

    #[test]
    fn campaign_settlement_requires_the_v2_hash() {
        let legacy = campaign_with_hash(INITIAL_CAMPAIGN_V1_ECONOMIC_CONFIG_HASH);
        assert!(require_campaign_active(&legacy).is_err());

        let current = campaign_with_hash(CAMPAIGN_V2_ECONOMIC_CONFIG_HASH);
        assert!(require_campaign_active(&current).is_ok());
    }

    #[test]
    fn https_metadata_is_valid_and_non_https_metadata_is_rejected() {
        assert!(metadata_uri_is_valid(
            "https://metadata.example/jdr.json",
            &DEVNET_TOKENOMICS_PROGRAM_ID
        ));
        assert!(!metadata_uri_is_valid(
            "http://metadata.example/jdr.json",
            &DEVNET_TOKENOMICS_PROGRAM_ID
        ));
        assert!(!metadata_uri_is_valid(
            "ipfs://jdr",
            &DEVNET_TOKENOMICS_PROGRAM_ID
        ));
    }

    #[test]
    fn empty_metadata_never_crosses_the_devnet_program_identity_boundary() {
        let separate_mainnet_identity = Pubkey::new_from_array([7; 32]);
        assert_ne!(separate_mainnet_identity, DEVNET_TOKENOMICS_PROGRAM_ID);
        assert!(!metadata_uri_is_valid("", &separate_mainnet_identity));
    }

    #[test]
    fn empty_metadata_follows_the_explicit_devnet_build_feature() {
        assert_eq!(
            metadata_uri_is_valid("", &DEVNET_TOKENOMICS_PROGRAM_ID),
            cfg!(feature = "devnet-empty-metadata-uri")
        );
    }

    #[test]
    fn oversized_metadata_is_rejected_in_every_build() {
        let oversized = format!("https://example.com/{}", "a".repeat(MAX_METADATA_URI_BYTES));
        assert!(oversized.len() > MAX_METADATA_URI_BYTES);
        assert!(!metadata_uri_is_valid(
            &oversized,
            &DEVNET_TOKENOMICS_PROGRAM_ID
        ));
    }
}
