//! Payments (LOGIC §7.5): exactly-once `pay` with a Receipt, and escrow for recipients who
//! aren't on Pay System yet (send / claim / refund). The authority (backend) pays all rent and fees.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, CloseAccount, Mint, Token, TokenAccount, TransferChecked};

use crate::{Config, PayError};

/// Bounds for `Config.escrow_ttl_secs` (production: 7 days; tests use a few seconds).
pub const MIN_ESCROW_TTL_SECS: i64 = 1;
pub const MAX_ESCROW_TTL_SECS: i64 = 30 * 24 * 60 * 60;

pub type IntentId = [u8; 16];
pub type AliasHash = [u8; 32];

// ---------------------------------------------------------------- state

/// Proof that the payment with (sender, intent_id) happened. Never closed during the hackathon,
/// so the same intent can never pay twice, however often a client retries (LOGIC §7.5.1).
#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub sender: Pubkey,
    /// The recipient wallet, or the Escrow PDA for escrow sends.
    pub recipient: Pubkey,
    pub amount: u64,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub sender: Pubkey,
    /// Opaque HMAC of the recipient alias (Telegram handle or phone), computed by the backend.
    pub alias_hash: [u8; 32], // InitSpace needs the literal array type, not the alias
    pub intent_id: [u8; 16],
    pub amount: u64,
    pub created_at: i64,
    pub expires_at: i64,
    pub bump: u8,
}

// ---------------------------------------------------------------- pay

#[derive(Accounts)]
#[instruction(intent_id: IntentId)]
pub struct Pay<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = usdc_mint @ PayError::WrongMint)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, address = config.authority @ PayError::Unauthorized)]
    pub authority: Signer<'info>,
    pub sender: Signer<'info>,
    /// CHECK: any wallet; it only owns the destination token account.
    pub recipient: UncheckedAccount<'info>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = usdc_mint, token::authority = sender)]
    pub sender_ata: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = recipient,
    )]
    pub recipient_ata: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = authority,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [b"receipt", sender.key().as_ref(), intent_id.as_ref()],
        bump,
    )]
    pub receipt: Box<Account<'info, Receipt>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn pay(ctx: Context<Pay>, amount: u64) -> Result<()> {
    require!(amount > 0, PayError::InvalidAmount);
    let a = &ctx.accounts;
    token::transfer_checked(
        CpiContext::new(
            a.token_program.to_account_info(),
            TransferChecked {
                from: a.sender_ata.to_account_info(),
                mint: a.usdc_mint.to_account_info(),
                to: a.recipient_ata.to_account_info(),
                authority: a.sender.to_account_info(),
            },
        ),
        amount,
        a.usdc_mint.decimals,
    )?;
    let receipt = &mut ctx.accounts.receipt;
    receipt.sender = ctx.accounts.sender.key();
    receipt.recipient = ctx.accounts.recipient.key();
    receipt.amount = amount;
    receipt.created_at = Clock::get()?.unix_timestamp;
    receipt.bump = ctx.bumps.receipt;
    Ok(())
}

// ---------------------------------------------------------------- send_to_escrow

#[derive(Accounts)]
#[instruction(intent_id: IntentId, alias_hash: AliasHash)]
pub struct SendToEscrow<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = usdc_mint @ PayError::WrongMint)]
    pub config: Box<Account<'info, Config>>,
    #[account(mut, address = config.authority @ PayError::Unauthorized)]
    pub authority: Signer<'info>,
    pub sender: Signer<'info>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = usdc_mint, token::authority = sender)]
    pub sender_ata: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = authority,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", alias_hash.as_ref(), sender.key().as_ref(), intent_id.as_ref()],
        bump,
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = escrow,
    )]
    pub vault: Box<Account<'info, TokenAccount>>,
    /// Also written for escrow sends: the escrow itself closes on claim/refund, so without a
    /// lasting receipt a "didn't land" retry with the same intent could re-create it.
    #[account(
        init,
        payer = authority,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [b"receipt", sender.key().as_ref(), intent_id.as_ref()],
        bump,
    )]
    pub receipt: Box<Account<'info, Receipt>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn send_to_escrow(ctx: Context<SendToEscrow>, intent_id: IntentId, alias_hash: AliasHash, amount: u64) -> Result<()> {
    require!(amount > 0, PayError::InvalidAmount);
    let now = Clock::get()?.unix_timestamp;
    let a = &ctx.accounts;
    token::transfer_checked(
        CpiContext::new(
            a.token_program.to_account_info(),
            TransferChecked {
                from: a.sender_ata.to_account_info(),
                mint: a.usdc_mint.to_account_info(),
                to: a.vault.to_account_info(),
                authority: a.sender.to_account_info(),
            },
        ),
        amount,
        a.usdc_mint.decimals,
    )?;
    let ttl = ctx.accounts.config.escrow_ttl_secs;
    let escrow_key = ctx.accounts.escrow.key();
    let escrow = &mut ctx.accounts.escrow;
    escrow.sender = ctx.accounts.sender.key();
    escrow.alias_hash = alias_hash;
    escrow.intent_id = intent_id;
    escrow.amount = amount;
    escrow.created_at = now;
    escrow.expires_at = now.checked_add(ttl).ok_or(PayError::InvalidAmount)?;
    escrow.bump = ctx.bumps.escrow;

    let receipt = &mut ctx.accounts.receipt;
    receipt.sender = ctx.accounts.sender.key();
    receipt.recipient = escrow_key;
    receipt.amount = amount;
    receipt.created_at = now;
    receipt.bump = ctx.bumps.receipt;
    Ok(())
}

// ---------------------------------------------------------------- claim / refund

#[derive(Accounts)]
pub struct ClaimEscrow<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = usdc_mint @ PayError::WrongMint)]
    pub config: Box<Account<'info, Config>>,
    /// Co-signs only after the backend verified the claimer owns the alias (LOGIC §7.2).
    #[account(mut, address = config.authority @ PayError::Unauthorized)]
    pub authority: Signer<'info>,
    pub claimer: Signer<'info>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        close = authority,
        seeds = [b"escrow", escrow.alias_hash.as_ref(), escrow.sender.as_ref(), escrow.intent_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = escrow)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = claimer,
    )]
    pub claimer_ata: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn claim_escrow(ctx: Context<ClaimEscrow>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(now < ctx.accounts.escrow.expires_at, PayError::EscrowExpired);
    let to = ctx.accounts.claimer_ata.to_account_info();
    release(
        &ctx.accounts.escrow,
        &ctx.accounts.vault,
        &ctx.accounts.usdc_mint,
        to,
        ctx.accounts.authority.to_account_info(),
        &ctx.accounts.token_program,
    )
}

#[derive(Accounts)]
pub struct RefundEscrow<'info> {
    #[account(seeds = [b"config"], bump = config.bump, has_one = usdc_mint @ PayError::WrongMint)]
    pub config: Box<Account<'info, Config>>,
    /// Fee payer (gasless); gets back the rent it paid.
    #[account(mut, address = config.authority @ PayError::Unauthorized)]
    pub authority: Signer<'info>,
    #[account(address = escrow.sender @ PayError::NotSender)]
    pub sender: Signer<'info>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        close = authority,
        seeds = [b"escrow", escrow.alias_hash.as_ref(), escrow.sender.as_ref(), escrow.intent_id.as_ref()],
        bump = escrow.bump,
    )]
    pub escrow: Box<Account<'info, Escrow>>,
    #[account(mut, associated_token::mint = usdc_mint, associated_token::authority = escrow)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = sender,
    )]
    pub sender_ata: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn refund_escrow(ctx: Context<RefundEscrow>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(now >= ctx.accounts.escrow.expires_at, PayError::EscrowNotExpired);
    let to = ctx.accounts.sender_ata.to_account_info();
    release(
        &ctx.accounts.escrow,
        &ctx.accounts.vault,
        &ctx.accounts.usdc_mint,
        to,
        ctx.accounts.authority.to_account_info(),
        &ctx.accounts.token_program,
    )
}

/// Vault → `to`, then close the vault (rent to the authority). The escrow account itself is
/// closed by the `close = authority` constraint, so claim and refund are mutually exclusive.
fn release<'info>(
    escrow: &Account<'info, Escrow>,
    vault: &Account<'info, TokenAccount>,
    mint: &Account<'info, Mint>,
    to: AccountInfo<'info>,
    rent_to: AccountInfo<'info>,
    token_program: &Program<'info, Token>,
) -> Result<()> {
    let bump = [escrow.bump];
    let seeds: &[&[u8]] = &[b"escrow", escrow.alias_hash.as_ref(), escrow.sender.as_ref(), escrow.intent_id.as_ref(), &bump];
    let signer = &[seeds];
    token::transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to,
                authority: escrow.to_account_info(),
            },
            signer,
        ),
        vault.amount,
        mint.decimals,
    )?;
    token::close_account(CpiContext::new_with_signer(
        token_program.to_account_info(),
        CloseAccount {
            account: vault.to_account_info(),
            destination: rent_to,
            authority: escrow.to_account_info(),
        },
        signer,
    ))
}
