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

## 6b. Sign-up and sign-in methods (v1.3)

### Methods
| Method | Wallet | Where it's offered |
|---|---|---|
| Telegram | embedded (created for you) | Inside Telegram: automatic, no screen. Web: "Continue with Telegram" |
| Email (6-digit code) | embedded | everywhere |
| Google | embedded | web; inside Telegram it opens the system browser (Google blocks sign-in inside embedded webviews) |
| Apple | embedded | web; inside Telegram it opens the system browser |
| Connect a wallet (Phantom, Solflare, Backpack, WalletConnect) | the user's own wallet | everywhere |
| Import a wallet (private key or recovery phrase) | imported into the embedded wallet | **web only**, behind a warning screen. Never inside Telegram chats, where fake "import your wallet" bots are the #1 scam |

**Provider:** one auth provider that supports all of these plus embedded Solana wallets and key import (Privy fits; Web3Auth is the fallback). Keys live in the provider's secure infrastructure, never on our servers. The hackathon build runs on a mocked `AuthApi`; the real provider needs a dashboard login from the user to get an app ID.

### Account model
- **One account = one wallet** (embedded or connected). That wallet is the `owner` on the UsernameRecord.
- An account can **link several sign-in methods** (Telegram + email + Google…), so the same person never ends up with two accounts. Linking happens in Settings → "Sign-in methods".
- A connected external wallet signs its own transactions (the app still pays the fees). An embedded wallet signs silently.
- **Program change:** `register_username` takes `telegram_id: Option<u64>`. If it's None (an email, Google, Apple or wallet user), no TelegramIndex is created. One-name-per-account for those users is enforced by the backend (it only co-signs one registration per account), and on-chain the owner wallet can't hold two names: add an `OwnerIndex` PDA `[b"owner", owner]`.

## 6c. Local currency and phone-number accounts (v1.3, agreed with the user)

### Principles
1. **Hold dollars, show local currency.** Every balance is USDC on Solana. A user in Lagos sees ₦, Nairobi KSh, Accra GH₵. Converting happens only for **display**, for typing amounts, and when money **enters or leaves** the system (top-up or cash-out). No swap happens on ordinary payments, so ordinary payments can't fail halfway or pay a spread.
2. **Any currency.** The local currency defaults from the phone number's country code (falling back to the Telegram language, then USD) and can be changed in Settings. Currencies are data, not code: `{code, symbol, decimals, locale}` in `packages/shared/currencies.ts`. Launch set: NGN, KES, GHS, ZAR, UGX, EGP, INR, PHP, BRL, MXN, USD, EUR, GBP.
3. **Phone number = account number.** A verified phone number is an alias that points at the account, like @username. It's shown in national format as the "account number" (e.g. Nigeria `0801 234 5678` → account no. `801 234 5678`). Anyone can pay a phone number, even one that isn't registered yet (escrow).
4. **Top-up and cash-out without P2P.** The user pays in their own currency (bank transfer, card or mobile money), and USDC lands in their account. Cash-out is the reverse, to their bank or mobile money. This needs a **licensed ramp partner per country** (e.g. Yellow Card for several African markets). The hackathon build runs it on a mocked `RampApi` with realistic screens, clearly labelled "Demo"; real partners plug in behind the same interface.

### Phone verification
- Inside Telegram: `requestContact()`. Telegram shares the user's verified number with their permission, at no cost and with no SMS.
- On the web: an SMS one-time code (provider mocked for the hackathon).
- Normalized to E.164 (`+2348012345678`) with libphonenumber. One phone → one account. Re-verification is required when the number is moved to a new account.
- **Recycled numbers:** a phone alias that hasn't been re-verified for 12 months is released, and money sent to a released number goes into escrow instead of to the old account.

### Privacy
Phone numbers never go on-chain in plain text, and not as a plain hash either (the space of phone numbers is small enough to brute-force). The backend keeps `phone → account` and computes `alias_hash = HMAC-SHA256(server_secret, "phone:" + E164)`.

**Escrow change (Milestone B):** the escrow seed's `handle_hash` becomes **`alias_hash`**, the same HMAC for both Telegram handles (`"tg:" + handle`) and phones. So nothing reversible about a person is on-chain, and the backend's claim co-signature is what proves the claimer owns the alias.

### Sending in local currency
- The user types `₦10,000`. The app fetches a quote (`FxApi`) of, say, ₦1,600 per $1 and shows "≈ $6.25 · rate ₦1,600/$". On Confirm, the quote is **locked for 60 s**, and the program receives **6.25 USDC** (6 decimals, rounded DOWN so we never over-send).
- If the quote expires on Confirm, refresh it and show the new amount before sending ("Rate updated: ≈ $6.24").
- The recipient sees the dollars in *their* currency at *their* rate. A Kenyan receiving $6.25 sees ≈ KSh 806.

### Receiving other tokens
- Incoming **USDT** or **SOL** to a user's wallet is swapped to USDC automatically (Jupiter on mainnet, mocked on devnet), and the activity shows "Received 5.00 USDT → $4.99". Embedded wallets authorise the swap through a pre-approved session permission; external wallets get a one-tap prompt.
- Dust (under $0.10) isn't swapped.

### Top-up (on-ramp) flow
```
Add money → amount in local currency → quote ("You'll get $62.50", locked 10 min)
  → method: bank transfer (shows partner account no. + reference) | card | mobile money
  → partner confirms payment → partner sends USDC to the user's wallet
  → status timeline: Waiting for payment → Payment received → Dollars added
```

### Cash-out (off-ramp) flow
```
Cash out → amount in local currency (max = balance) → choose bank / mobile money
  → account-name lookup ("ADA OBI — Access Bank") → quote locked 10 min
  → user signs a USDC transfer to the partner → partner pays out
  → status: Sending → Processing → Paid to your bank
```
Fees are shown up front, as a single line: "Fee ₦150". On the real system, KYC level limits apply (shown as "Limit ₦500,000/day — verify ID to raise it"; mocked).

## 7. Payment flows

### 7.1 Send to a registered username

```
/send @alex 5   (or Mini App form)
  → resolve "alex" → UsernameRecord PDA → owner pubkey
  → show confirmation card (section 8)
  → sender signs USDC transfer; backend co-signs as fee payer
  → alex gets a bot DM: "Sakz sent you $5"
```

### 7.1b Send to a wallet address (v1.1)
For paying any Solana wallet, such as an exchange or Phantom:
```
User pastes or scans an address in S4
  → client validates: base58, decodes to 32 bytes, ON the ed25519 curve
      (off-curve = program address → reject "This address can't receive payments")
  → if the address is the owner of a UsernameRecord → treat it as that @username (normal flow)
  → if it's my own address → reject "That's your own wallet"
  → plain USDC transfer; the fee payer creates the recipient's USDC account if it's missing
```
No escrow: the address already exists, so the money arrives instantly.

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

## 7.5 Double-spend and duplicate-payment protection (v1.2)

Solana itself stops anyone spending the same dollars twice: a token account can't go below zero, and the same signed transaction can't land twice. **Our** risk is different. The app can create **two different payments** when the user meant one, or a buyer can be charged a price they didn't agree to. Every path is closed at the layer that can actually guarantee it.

### 7.5.1 Payment intents: every send is exactly-once ON-CHAIN
- When the Confirm screen opens, the client creates a **payment intent ID** (16 random bytes) and keeps it for the life of that screen, including across "Try again". A new intent ID only appears when the user starts a new payment.
- All sends go through our program, never a bare SPL transfer:
  - `pay(intent_id, amount)`: transfers USDC sender → recipient and **creates a `Receipt` PDA** with seeds `[b"receipt", sender, intent_id]` (sender, recipient, amount, created_at). A second transaction with the same intent fails at `init`, so a duplicate payment **is impossible on-chain**, however many times the client submits.
  - `send_to_escrow(intent_id, handle_hash, amount)`: the escrow PDA seed uses `intent_id` instead of a separate nonce, so the same guarantee holds for escrow.
- The fee payer covers the receipt rent (~0.001 SOL). Receipts are kept for the hackathon; a future `close_receipt` can reclaim the rent after 24 h, which is far past the ~1-minute window in which an old signed transaction can still land.

### 7.5.2 Retries never re-sign blindly
- **Network error ≠ not sent.** After a timeout or dropped connection, the client must **not** say "your money hasn't moved". It first checks whether `Receipt[sender, intent_id]` exists:
  - exists → the payment went through; show Success (with the receipt's real time).
  - doesn't exist and the original transaction's blockhash has expired → it definitely didn't land; offer **Try again**, which builds a new transaction **with the same intent ID** (so even a late landing of the first one can't double up).
  - can't tell yet → show "Checking your payment…" and poll every 2 s, for up to ~90 s (the blockhash lifetime).
- The backend fee-payer endpoint is **idempotent by intent ID**: the same intent gets back the same signed transaction (same signature) while it's still valid, never a second one.

### 7.5.3 Single-flight UI
- Every money-moving button (Send, Claim, Refund, Buy, Buy resale, Gift, List) uses a **synchronous in-flight lock** (a ref, set before any `await`), so double taps and Telegram MainButton double events trigger at most one request. React state alone is too slow (the same class of bug as the keypad stale read).

### 7.5.4 Escrow: claim vs refund vs claim
- `claim_escrow` and `refund_escrow` both **close** the escrow account, so whichever lands first wins and the other fails: you can't claim twice, or claim and refund.
- They're also separated in time: claim only before `expires_at`, refund only at or after it.
- An escrow PDA can't be re-created after it closes, because the seed includes a fresh intent ID and the same intent never repeats. Stale claim links can't revive.

### 7.5.5 Tickets
- `buy_ticket(intent_id)`: a ticket purchase creates a Receipt too, so a double tap can't buy two tickets.
- `buy_listed(expected_seller, expected_price)`: the program requires that the listing's current owner and price **equal** what the buyer saw. That stops a seller from raising the price (still under the cap) or relisting in the moment between the buyer tapping Buy and the transaction landing. If two buyers race for the same listing, the first wins and the second fails `NotListed`, with nothing charged.
- `gift_ticket`, `list_ticket` and `buy_listed` are mutually exclusive by state: you can't gift a listed ticket, and buying clears the listing. A ticket can't be both sold and gifted.
- `check_in` sets `checked_in` once, and a second scan fails `AlreadyCheckedIn`. QR payloads expire after 30 s, and the scanner checks that the signer is the **current** on-chain owner, so a screenshot of a ticket that has since been gifted or resold won't work.

### 7.5.6 Errors (new)
`DuplicatePayment` (receipt exists, surfaced as success rather than an error), `ListingChanged` (seller or price mismatch on `buy_listed`).

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

## 10. Concert tickets (v1.1, now in scope)

### 10.1 Design decision: tickets are program accounts, not tokens
The original idea was Token-2022 with a transfer hook enforcing a resale cap. **It can't work.** A token transfer carries no price, so a hook can't tell a $25 resale from a $500 one. Instead, each ticket is an account owned by our program, and the **only** ways to move one are the program's own instructions. That makes every rule enforceable on-chain:
- **Can't be faked:** a ticket exists only if the program created it when a buyer paid the organizer.
- **Price-capped resale:** a resale happens inside the program, which sees the price and rejects anything above the cap.
- **Gifting is limited:** one free gift per ticket, and no gifts or resales in the final 24 h before the show. This closes the "sell for cash off-chain, gift on-chain" loophole as far as is practical.

Trade-off (say it in the pitch): the tickets don't show up as NFTs in Phantom. They live in Pay System. A future version could mirror them as non-transferable NFTs for display.

### 10.2 Accounts
- `Event` PDA, seeds `[b"event", organizer, event_id: u64 LE]`: organizer, name (max 48), venue (max 48), starts_at, price (USDC base units), max_resale_bps (e.g. 11000 = 110% of face value), supply, sold, lock_secs (default 86 400), bump.
- `Ticket` PDA, seeds `[b"ticket", event, ticket_no: u32 LE]`: event, owner, ticket_no, face_price, listed_price (0 = not listed), gifts_used (u8), checked_in (bool), bump.

### 10.3 Instructions
| Instruction | Who signs | Rules |
|---|---|---|
| `create_event(event_id, name, venue, starts_at, price, max_resale_bps, supply, lock_secs)` | organizer + authority (fees) | price > 0; 10000 ≤ max_resale_bps ≤ 20000; supply 1–10 000; starts_at in the future |
| `buy_ticket()` | buyer + authority | sold < supply; before starts_at; USDC buyer → organizer; creates Ticket #sold, sold += 1 |
| `gift_ticket(to)` | owner + authority | `to` must have a UsernameRecord (registered users only); gifts_used == 0; not listed; not checked in; now < starts_at − lock_secs |
| `list_ticket(price)` | owner + authority | price ≤ face_price × max_resale_bps / 10000 (error `PriceAboveCap`); not checked in; outside the lock window |
| `cancel_listing()` | owner + authority | listed_price → 0 |
| `buy_listed()` | buyer + authority | ticket is listed; outside the lock window; USDC buyer → seller at listed_price; owner = buyer; listed_price → 0 |
| `check_in()` | organizer + authority | not already checked in; within ±12 h of starts_at |

There's no platform fee. All USDC moves go directly between users' token accounts.

### 10.4 Door check-in
1. The holder opens **My ticket**. The Mini App shows a QR code of `{ticket, ts}` signed by the holder's wallet, refreshed every 30 s so screenshots go stale.
2. The organizer scans it with Telegram's built-in QR scanner (`showScanQrPopup`).
3. The scanner checks that the signature matches the ticket's on-chain owner and that `ts` is fresh, then calls `check_in`. It shows a green "Admit" screen or a red "Already used" / "Not valid" screen.

### 10.5 Demo
@sakz buys a ticket for "Solana Night Live" at $25 (cap 110% = $27.50). They try to resell it for $40 and get "Max resale price is $27.50". They gift it to @newfriend instead. The organizer scans @newfriend's QR → Admit. Scanning it again → "Already used".

## 11. Program instructions (Anchor)

| Instruction | Purpose |
|---|---|
| `register_username(name)` | Normalize, compute skeleton, init `UsernameRecord` + `SkeletonRecord` |
| `pay(intent_id, amount)` | USDC sender → recipient plus a `Receipt` PDA, for exactly-once payments (§7.5) |
| `send_to_escrow(intent_id, handle_hash, amount)` | Lock USDC in an escrow PDA for an unregistered recipient (the intent ID replaces the nonce) |
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
