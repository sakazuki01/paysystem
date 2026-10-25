use anchor_lang::prelude::*;

pub mod username;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod pay_system {
    use super::*;

    /// One-time setup. The signer becomes the authority (backend key + fee payer).
    pub fn initialize(ctx: Context<Initialize>, usdc_mint: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.usdc_mint = usdc_mint;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    /// Registers `name` for `owner`. The authority co-signs to attest it verified `telegram_id`.
    /// `name` must already be normalized; `skeleton` is recomputed and checked so clients can't lie.
    /// Uniqueness (name, lookalike, one name per Telegram ID) comes from `init` on the three PDAs.
    pub fn register_username(
        ctx: Context<RegisterUsername>,
        name: String,
        skeleton: String,
        telegram_id: u64,
    ) -> Result<()> {
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

        let telegram_index = &mut ctx.accounts.telegram_index;
        telegram_index.username = record_key;
        telegram_index.bump = ctx.bumps.telegram_index;

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
#[instruction(name: String, skeleton: String, telegram_id: u64)]
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
    #[account(
        init,
        payer = authority,
        space = 8 + TelegramIndex::INIT_SPACE,
        seeds = [b"tg", telegram_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub telegram_index: Account<'info, TelegramIndex>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UsernameRecord {
    pub owner: Pubkey,
    pub telegram_id: u64,
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
}
