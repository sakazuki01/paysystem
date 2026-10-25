# Pay System — Logic & Design

Solana Hackathon (MLH, online, November 6–8 2026)

> **Pitch:** Venmo inside Telegram. Send dollars to any @username, even if they've never touched crypto. They claim it in one tap.

---

## 1. Problem

- Wallet addresses (`7xKX...9fQz`, 44 characters) are too long to type, share or check. One wrong character and the money is gone.
- Existing username systems (`.sol` domains, Phantom usernames) only work if the **recipient already has a wallet**.
- New users have to install a wallet, save a seed phrase and buy SOL for fees before they can even receive money.

## 2. Solution summary

1. Every user gets a **unique, lookalike-proof username**.
2. You can send USDC to a **username or a Telegram handle**, even if that person hasn't signed up yet.
3. Unclaimed money sits in an **on-chain escrow** until the recipient claims it, or is refunded to the sender after it expires.
4. Recipients sign in with **Telegram or email**. A wallet is created for them behind the scenes, with no seed phrase.
5. The app **pays all network fees** (gasless), so users never need to hold SOL.
6. *(Stretch goal)* **Tickets** are sent the same way, with resale price caps enforced on-chain.

## 3. Hackathon scope

| Priority | Feature |
|---|---|
| Must | Username registration (normalization + skeleton check) |
| Must | Send USDC to a registered username |
| Must | Send to an unregistered Telegram handle through escrow, then claim |
| Must | Telegram bot `/send @user 5` plus a Mini App UI |
| Must | Gasless transactions (app pays the fees) |
| Should | Send-time safety: confirmation card, first-time warning, "did you mean" |
| Should | Refund unclaimed escrow after 7 days |
| Could | Tickets as tokens with a resale price cap (Token-2022 transfer hook) |
| Pitch only | Squatting limits, reserved names, username recycling rules |

Build payments first. Only start tickets if payments are finished and demo-ready.

## 4. Architecture

```
Telegram chat ──► Telegram Bot ──► Backend (Node/TS)
      │                               │
      ▼                               ├─ Telegram identity verification
Telegram Mini App (React)             ├─ Fee payer (sponsors transactions)
      │                               └─ Claim attestation signer
      ▼                               │
Embedded wallet (Privy / Web3Auth)    ▼
      │                        Solana devnet
      └──────────────────────► Anchor program "pay_system"
                                 ├─ UsernameRecord PDAs
                                 ├─ SkeletonRecord PDAs
                                 ├─ Escrow PDAs (USDC token accounts)
                                 └─ (stretch) Ticket mint + transfer hook
```

| Layer | Tech |
|---|---|
| On-chain program | Rust + Anchor |
| Currency | USDC (devnet) |
| Wallets / login | Privy or Web3Auth embedded wallets (Telegram + email login) |
| Fees | Backend fee-payer keypair signs as `fee_payer` on every transaction |
| Frontend | Telegram Mini App (React + `@solana/web3.js`) |
| Bot | Telegram Bot API (grammY or Telegraf) |
| Tickets (stretch) | Token-2022 with a transfer hook |

## 5. Username system

There are two problems to solve:

- **Exact clashes:** two people both want `alex`.
- **Lookalike clashes:** someone registers `a1ex` to catch money meant for `alex`. This is the dangerous one, because it's how people get scammed.

### 5.1 Normalization (rejects bad input)

Apply this before anything else, the same way on the client and in the program:

1. Convert to lowercase.
2. Allowed characters are `a-z`, `0-9` and `_` only. No emoji, no Unicode letters.
3. Length must be 3 to 20 characters.
4. Reject anything on the reserved list (see 5.5).

The result is the `normalized_name`. It is the username exactly as stored and shown.

### 5.2 Exact uniqueness: one PDA per name

Each username is an account whose address is derived from the name:

```rust
#[account(
    init,
    payer = fee_payer,
    space = 8 + UsernameRecord::INIT_SPACE,
    seeds = [b"username", normalized_name.as_bytes()],
    bump
)]
pub username_record: Account<'info, UsernameRecord>,
```

An account at a given address can only be created once. If two people try to claim `alex` at the same moment, the first transaction succeeds and the second fails automatically. There's no race condition, no database lock and no trusted backend.

```rust
#[account]
#[derive(InitSpace)]
pub struct UsernameRecord {
    pub owner: Pubkey,          // wallet that receives funds
    pub telegram_id: u64,       // permanent Telegram user ID (0 if none)
    #[max_len(20)]
    pub name: String,           // normalized name
    pub created_at: i64,
    pub bump: u8,
}
```

### 5.3 Lookalike protection: skeleton PDA

Every name is also reduced to a **skeleton**, where confusable characters map to one canonical form:

| Rule | Example |
|---|---|
| `0` → `o` | `j0hn` → `john` |
| `1`, `i`, `l` → `l` | `a1ex` → `alex` |
| `rn` → `m` | `rnike` → `mike` |
| `5` → `s` | `5akz` → `sakz` |
| `3` → `e` | `l3o` → `leo` |
| `8` → `b` | `8ob` → `bob` |
| drop `_` | `alex_` → `alex` |
| collapse repeated characters | `aalex` → `alex` |

Apply the rules in a fixed order: drop `_` first, then `rn`→`m`, then single-character maps, then collapse repeats. The same function must run in the client (for instant feedback) and in the program (for enforcement).

At registration the program creates a **second** PDA:

```rust
seeds = [b"skeleton", skeleton(normalized_name).as_bytes()]
```

If `alex` exists, registering `a1ex` tries to create the skeleton account for `alex`, which already exists, so the transaction fails. **Both uniqueness rules are enforced on-chain.**

The trade-off is that some legitimate names get blocked (nobody can have `a1ex` if `alex` exists). For a payments app this is correct. Pitch line: *"Lookalike usernames are impossible by design."*

### 5.4 Registration flow

```
User types name
  → client: normalize + validate → show error instantly if invalid
  → client: compute skeleton → check if either PDA exists → show "taken"
  → backend: verify Telegram login, enforce one free name per telegram_id
  → backend co-signs as fee payer
  → program: re-normalizes, recomputes skeleton, init both PDAs
       ├─ success → name is yours
       └─ either PDA exists → tx fails → "taken / too similar to @alex"
```

### 5.5 Anti-squatting

- One free username per verified Telegram account.
- Account rent (about 0.002 SOL per record) discourages registering in bulk. The app covers it for the first name.
- Reserved names: `admin`, `support`, `help`, `official`, `solana`, `telegram`, `paysystem`, `wallet`, brand names. The program rejects them.
- Usernames can't be transferred during the hackathon. Future idea: a cooldown before a released name can be claimed again.

## 6. Telegram identity

- **Link wallets to the Telegram user ID**, a permanent number, **not the `@handle`**. Handles can be changed or given up and later taken by someone else.
- The handle is only used for **lookup at send time**.
- Telegram login is verified by the backend: the Mini App `initData` is checked with an HMAC using the bot token.
- **Trust assumption:** the backend vouches that a wallet belongs to a Telegram user. That's acceptable for the hackathon, so state it openly in the pitch.

## 7. Payment flows

### 7.1 Send to a registered username

```
/send @alex 5   (or Mini App form)
  → resolve "alex" → UsernameRecord PDA → owner pubkey
  → show confirmation card (section 8)
  → sender signs USDC transfer; backend co-signs as fee payer
  → alex gets a bot DM: "Sakz sent you $5"
```

### 7.2 Send to someone who isn't registered (escrow)

```
/send @newfriend 10
  → no UsernameRecord for "newfriend"
  → program: create Escrow PDA
        seeds = [b"escrow", hash(lowercase_tg_handle), sender, nonce]
        holds 10 USDC in a PDA-owned token account
        stores: sender, amount, handle_hash, created_at, expires_at (+7 days)
  → bot posts: "@newfriend, Sakz sent you $10. Tap to claim"
```

### 7.3 Claim

```
@newfriend taps link → Mini App opens
  → logs in with Telegram → embedded wallet created silently
  → backend checks: Telegram initData valid AND current handle == escrow handle
  → backend signs a claim attestation (handle_hash, claimer wallet, escrow)
  → program verifies the attestation signature (Ed25519 instruction)
  → USDC moves escrow → claimer wallet; escrow account closed (rent refunded)
  → optional: prompt to register a username
```

### 7.4 Refund

- After `expires_at`, the **sender** can call `refund`, and the USDC goes back to them.
- This limits the risk of a handle changing owner before the money is claimed.

## 8. Send-time safety (UX)

Registration rules aren't enough on their own, so the send screen adds:

1. **Confirmation card:** recipient avatar, linked Telegram account, account age, short wallet fingerprint (`7xKX…9fQz`).
2. **First-time warning:** "You've never sent money to @alex2 before."
3. **"Did you mean" check:** if the typed name is within edit distance 1–2 of a past recipient, show "Did you mean @alex? You've paid them 6 times."
4. **Recent contacts first**, so people tap a contact instead of typing a name.
5. Unclaimed sends show clearly as **"Pending — refundable after 7 days."**

## 9. Fees (gasless)

- Every transaction sets the backend's keypair as `fee_payer`. Users never hold SOL.
- The backend also pays rent for username and escrow accounts. Escrow rent is refunded when the escrow closes.
- Abuse limits: per-user rate limits and one sponsored registration per Telegram ID.

## 10. Tickets (stretch)

- An organizer creates an event, and each ticket is a Token-2022 token (supply 1).
- Buy with USDC, then send to `@friend` using the same username and escrow logic.
- A **transfer hook** enforces the resale rules: a maximum resale price (for example, face value + 10%) and optional no-transfer within 24 hours of the event.
- At the door, a QR code signed by the holder's wallet proves ownership and can't be faked.

## 11. Program instructions (Anchor)

| Instruction | Purpose |
|---|---|
| `register_username(name)` | Normalize, compute skeleton, init `UsernameRecord` + `SkeletonRecord` |
| `send_to_escrow(handle_hash, amount, nonce)` | Lock USDC in an escrow PDA for an unregistered recipient |
| `claim_escrow(attestation)` | Verify backend Ed25519 attestation, release USDC to the claimer |
| `refund_escrow()` | Sender reclaims after expiry |
| *(stretch)* `create_event`, `buy_ticket`, transfer hook | Tickets |

Direct username-to-username payments are a plain SPL token transfer, so they need no custom instruction.

## 12. Error cases

| Case | Behaviour |
|---|---|
| Name contains invalid characters or wrong length | Rejected by client and program |
| Name taken | `UsernameRecord` init fails → "taken" |
| Name looks like an existing one | `SkeletonRecord` init fails → "too similar to @x" |
| Reserved name | Program rejects |
| Claim by the wrong Telegram user | Backend won't sign the attestation → claim fails |
| Handle changed before claim | Claim fails, and the sender gets a refund after expiry |
| Escrow expired | Only `refund_escrow` is allowed |
| Fee payer out of SOL | Backend alerts; top it up from the devnet faucet |

## 13. Known trade-offs (say them in the pitch)

- **Backend trust for Telegram identity.** The backend attests to handle ownership. A future version could use zk proofs or Telegram-native verification.
- **Skeleton rules block some legitimate names.** That's intentional, because safety beats choice for payments.
- **Escrow is tied to the handle, not the ID**, for unregistered users. Mitigated by the 7-day expiry and refund.
- **Devnet only** for the hackathon.

## 14. Two-minute demo script

1. Two phones, one Telegram group.
2. Sakz registers `@sakz`, then tries `@5akz` and gets "too similar." (Shows lookalike protection.)
3. Sakz types `/send @newfriend 10`. Newfriend has no wallet.
4. Newfriend taps "Claim", logs in with Telegram, and the $10 appears. No seed phrase, no SOL.
5. Newfriend sends $3 back to `@sakz` in one tap.
6. *(If built)* Sakz buys a ticket and sends it to `@newfriend`. A resale above the cap is rejected.
7. Close: "Fast, nearly free, and anyone with Telegram can use it."
