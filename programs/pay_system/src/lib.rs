use anchor_lang::prelude::*;

pub mod payments;
pub mod username;

use payments::*;

declare_id!("9QA6zUCshCS3DjgGrwSMw4vkuLM3dGp4TmZ4U98tEakt");

#[program]
pub mod pay_system {
    use super::*;

    /// One-time setup. The signer becomes the authority (backend key + fee payer).
    /// `escrow_ttl_secs`: how long unclaimed escrow waits before refund (production: 7 days).
    pub fn initialize(ctx: Context<Initialize>, usdc_mint: Pubkey, escrow_ttl_secs: i64) -> Result<()> {
        require!(
            (MIN_ESCROW_TTL_SECS..=MAX_ESCROW_TTL_SECS).contains(&escrow_ttl_secs),
            PayError::InvalidTtl
        );
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.usdc_mint = usdc_mint;
        config.escrow_ttl_secs = escrow_ttl_secs;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    /// USDC sender → recipient, exactly once per (sender, intent_id): the Receipt `init` fails
    /// on any repeat. The recipient's token account is created if missing (authority pays).
    pub fn pay(ctx: Context<Pay>, _intent_id: IntentId, amount: u64) -> Result<()> {
        payments::pay(ctx, amount)
    }

    /// USDC sender → vault owned by an Escrow PDA keyed by (alias_hash, sender, intent_id).
    pub fn send_to_escrow(ctx: Context<SendToEscrow>, intent_id: IntentId, alias_hash: AliasHash, amount: u64) -> Result<()> {
        payments::send_to_escrow(ctx, intent_id, alias_hash, amount)
    }

    /// Before expiry, with the authority's co-signature: vault → claimer; closes vault and escrow.
    pub fn claim_escrow(ctx: Context<ClaimEscrow>) -> Result<()> {
        payments::claim_escrow(ctx)
    }

    /// At or after expiry, by the sender: vault → sender; closes vault and escrow.
    pub fn refund_escrow(ctx: Context<RefundEscrow>) -> Result<()> {
        payments::refund_escrow(ctx)
    }

    /// Registers `name` for `owner`. The authority co-signs to attest it verified the sign-in
    /// (and `telegram_id`, when the user signed in with Telegram). `name` must already be
    /// normalized; `skeleton` is recomputed and checked so clients can't lie.
    /// Uniqueness comes from `init`: name, lookalike, one name per wallet (OwnerIndex) and,
    /// for Telegram users, one name per Telegram ID (TelegramIndex).
    pub fn register_username(
        ctx: Context<RegisterUsername>,
        name: String,
        skeleton: String,
        telegram_id: Option<u64>,
    ) -> Result<()> {
        // The TelegramIndex account must be passed exactly when there is a Telegram ID.
        require!(
            telegram_id.is_some() == ctx.accounts.telegram_index.is_some(),
            PayError::TelegramIndexMismatch
        );
        let (normalized, expected_skeleton) = username::validate(&name).map_err(|e| match e {
            username::UsernameError::Invalid => PayError::InvalidUsername,
            username::UsernameError::Reserved => PayError::ReservedUsername,
        })?;
        // PDA seeds are derived from the raw arg, so it must be canonical.
        require!(normalized == name, PayError::InvalidUsername);
        require!(expected_skeleton == skeleton, PayError::SkeletonMismatch);

        let record_key = ctx.accounts.username_record.key();

        let record = &mut ctx.accounts.username_record;
        record.owner = ctx.accounts.owner.key();
        record.telegram_id = telegram_id;
        record.name = name;
        record.created_at = Clock::get()?.unix_timestamp;
        record.bump = ctx.bumps.username_record;

        let skeleton_record = &mut ctx.accounts.skeleton_record;
        skeleton_record.username = record_key;
        skeleton_record.bump = ctx.bumps.skeleton_record;

        let owner_index = &mut ctx.accounts.owner_index;
        owner_index.username = record_key;
        owner_index.bump = ctx.bumps.owner_index;

        if let Some(telegram_index) = ctx.accounts.telegram_index.as_mut() {
            telegram_index.username = record_key;
            telegram_index.bump = ctx.bumps.telegram_index.unwrap_or_default();
        }

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(name: String, skeleton: String, telegram_id: Option<u64>)]
pub struct RegisterUsername<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, address = config.authority @ PayError::Unauthorized)]
    pub authority: Signer<'info>,
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + UsernameRecord::INIT_SPACE,
        seeds = [b"username", name.as_bytes()],
        bump,
    )]
    pub username_record: Account<'info, UsernameRecord>,
    #[account(
        init,
        payer = authority,
        space = 8 + SkeletonRecord::INIT_SPACE,
        seeds = [b"skeleton", skeleton.as_bytes()],
        bump,
    )]
    pub skeleton_record: Account<'info, SkeletonRecord>,
    /// One name per wallet, whatever the sign-in method.
    #[account(
        init,
        payer = authority,
        space = 8 + OwnerIndex::INIT_SPACE,
        seeds = [b"owner", owner.key().as_ref()],
        bump,
    )]
    pub owner_index: Account<'info, OwnerIndex>,
    /// Only for Telegram sign-ups (None for email / Google / Apple / wallet).
    #[account(
        init,
        payer = authority,
        space = 8 + TelegramIndex::INIT_SPACE,
        seeds = [b"tg", telegram_id.unwrap_or_default().to_le_bytes().as_ref()],
        bump,
    )]
    pub telegram_index: Option<Account<'info, TelegramIndex>>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub escrow_ttl_secs: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UsernameRecord {
    pub owner: Pubkey,
    pub telegram_id: Option<u64>,
    #[max_len(20)]
    pub name: String,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct SkeletonRecord {
    /// The UsernameRecord PDA that owns this skeleton.
    pub username: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct OwnerIndex {
    /// The UsernameRecord PDA owned by this wallet.
    pub username: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct TelegramIndex {
    /// The UsernameRecord PDA registered to this Telegram ID.
    pub username: Pubkey,
    pub bump: u8,
}

#[error_code]
pub enum PayError {
    #[msg("Username must be 3-20 characters of a-z, 0-9 or _")]
    InvalidUsername,
    #[msg("Username is reserved")]
    ReservedUsername,
    #[msg("Skeleton argument does not match the name")]
    SkeletonMismatch,
    #[msg("Signer is not the configured authority")]
    Unauthorized,
    #[msg("Pass the TelegramIndex account exactly when telegram_id is set")]
    TelegramIndexMismatch,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Token accounts must use the configured USDC mint")]
    WrongMint,
    #[msg("Escrow TTL out of range")]
    InvalidTtl,
    #[msg("This escrow has expired; only a refund is possible")]
    EscrowExpired,
    #[msg("This escrow hasn't expired yet")]
    EscrowNotExpired,
    #[msg("Only the sender can refund")]
    NotSender,
}
