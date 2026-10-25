# Pay System — Design Spec (Telegram Mini App)

Owner: design lead (this file is the source of truth for all UI work). Builders don't change it. Raise questions with the design lead instead.

Companion to `../PAY_SYSTEM_LOGIC.md`.

---

## 1. Design principles

1. **Feels like Telegram, not like crypto.** No seed phrases, no "lamports", no hex on primary screens. Money is in **dollars**. A wallet address only ever appears as a short fingerprint `7xKX…9fQz` inside secondary detail views.
2. **One thumb, one job per screen.** The main action is always the bottom button (Telegram MainButton). Max one primary action per screen.
3. **Safety is visible, not scary.** Warnings are calm and specific ("You've never paid @alex2 before"), never generic red alarms.
4. **Instant feedback.** Every tap responds within 100 ms (haptic + visual). Chain confirmation (~1 s) shows a short progress state, never a frozen screen.
5. **Native to the host.** Respect the user's Telegram light/dark theme via `themeParams`. Our brand lives in the accent colour, the logo mark and the success moment.

## 2. Platform rules (Telegram Mini App)

- Use `@telegram-apps/sdk-react` (or `window.Telegram.WebApp`). Call `ready()` and `expand()` on load.
- **MainButton** = the primary CTA on every screen (Send, Confirm, Claim, Done). Don't draw a duplicate in-page primary button.
- **BackButton** = Telegram's native back button. No in-page back arrows.
- **Haptics:** `impactOccurred('light')` on key taps, `notificationOccurred('success'|'error'|'warning')` on outcomes.
- **Theme:** map Telegram `themeParams` to CSS variables (section 3). Re-apply on the `themeChanged` event.
- Safe areas: respect `safeAreaInset` / `contentSafeAreaInset`.
- Target viewport 360–430 px wide. Must not scroll horizontally. Test at 360 × 640.

## 3. Design tokens

Build them as CSS custom properties in `apps/miniapp/src/styles/tokens.css`. Surface and text colours come from Telegram, with our fallbacks. Brand and semantic colours are ours.

### 3.1 Colour

| Token | Source / light fallback | Dark fallback | Use |
|---|---|---|---|
| `--bg` | `--tg-theme-bg-color` / `#FFFFFF` | `#17181C` | page background |
| `--bg-secondary` | `--tg-theme-secondary-bg-color` / `#F2F3F5` | `#1F2026` | cards, inputs |
| `--text` | `--tg-theme-text-color` / `#0F1115` | `#F4F5F7` | primary text |
| `--text-muted` | `--tg-theme-hint-color` / `#6B7280` | `#9097A3` | secondary text |
| `--separator` | `--tg-theme-section-separator-color` / `#E5E7EB` | `#2C2E36` | dividers |
| `--brand` | `#6A45F5` | `#6F52F0` | brand FILLS: Send button, MainButton, gradient start, focus ring |
| `--brand-text` | `#6A45F5` | `#A08AFF` | brand TEXT and icons: links, selected chip text, Receive button text |
| `--avatar-bg` | `color-mix(in srgb, #6A45F5 10%, var(--bg))` | `color-mix(in srgb, #8F74FF 15%, var(--bg))` | SOLID avatar / recipient-pill background, so it stays the same inside cards. Measured: initials 4.79 (light), 5.26 (dark) |
| `--brand-soft` | `#6A45F51A` | `#8F74FF26` | accent backgrounds, avatars |
| `--on-brand` | `#FFFFFF` | `#FFFFFF` | text on brand |
| `--success` | `#14B86A` | `#2FD083` | received, claimed, done |
| `--success-soft` | `#14B86A1A` | `#2FD08326` | success banners |
| `--warning` | `#D98A00` | `#F2B233` | first-time / lookalike warnings |
| `--warning-soft` | `#D98A001A` | `#F2B23326` | warning banners |
| `--danger` | `#E5484D` | `#FF6369` | errors, failed |
| `--danger-soft` | `#E5484D1A` | `#FF636926` | error banners |
| `--pending` | `#8A8F98` | `#A3A9B3` | pending / unclaimed (icons, dots) |

**Text-only semantic tokens.** Added in v1.1 after a contrast audit. Fill colours above are for fills and icons. Any TEXT in a semantic colour must use these:

| Token | Light | Dark | Measured (light) |
|---|---|---|---|
| `--success-text` | `#0B7A45` | `#2FD083` | 4.92 on success-soft |
| `--warning-text` | `#946000` | `#F2B233` | 4.85 on warning-soft |
| `--danger-text` | `#C8303A` | `#FF6369` | 4.69 on danger-soft |
| `--pending-text` | `#646973` | `#A3A9B3` | 5.51 on bg |
| `--text-muted-on-card` | `#5F6672` | `#9097A3` | 5.21 on bg-secondary |

White on `--brand`: 5.55 (light) and 5.07 (dark). Brand-text on brand-soft: 4.91 (light).

Brand gradient (only for the success moment and the logo): `linear-gradient(135deg, #6A45F5 0%, #14F195 100%)`. The nod to Solana's green is intentional. **Never** use it behind body text.

Set the MainButton colour with `setParams({ color: brand, text_color: '#FFFFFF' })`.

Contrast: all text/background pairs must reach WCAG AA (4.5:1 body, 3:1 for ≥18 px or bold ≥14 px). `--warning` text sits on `--warning-soft`, never on plain white, at small sizes. Check it.

### 3.2 Typography

Font: `Inter` (Google Fonts, weights 400/500/600/700), falling back to `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`. Enable `font-variant-numeric: tabular-nums` on every amount.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `--type-amount-xl` | 48 / 56 | 700 | amount entry, success amount |
| `--type-amount-l` | 34 / 40 | 700 | home balance |
| `--type-title` | 22 / 28 | 600 | screen titles |
| `--type-headline` | 17 / 22 | 600 | card titles, names |
| `--type-body` | 16 / 22 | 400 | body |
| `--type-label` | 14 / 20 | 500 | labels, buttons, chips |
| `--type-caption` | 13 / 18 | 400 | timestamps, helper text |
| `--type-mono` | 13 / 18, `ui-monospace` | 500 | address fingerprint only |

Minimum text size is 13 px. Never use all-caps body text. Small labels may use letter-spacing `0.02em`.

### 3.3 Spacing, radius, elevation, motion

- **Spacing scale (4 pt):** `--s-1: 4px`, `--s-2: 8px`, `--s-3: 12px`, `--s-4: 16px`, `--s-5: 20px`, `--s-6: 24px`, `--s-8: 32px`, `--s-10: 40px`. The screen side gutter is `--s-4` (16 px).
- **Radius:** `--r-sm: 8px` (chips), `--r-md: 12px` (inputs, list rows), `--r-lg: 16px` (cards), `--r-xl: 24px` (sheets), `--r-full: 999px` (avatars, pills).
- **Elevation:** keep things flat. Cards use `--bg-secondary` with no shadow. Only bottom sheets get `0 -8px 24px rgba(0,0,0,.12)`.
- **Motion:** `--dur-fast: 120ms`, `--dur-base: 200ms`, `--dur-slow: 320ms`; easing `cubic-bezier(.2,.8,.2,1)`. Respect `prefers-reduced-motion` by removing transforms and keeping opacity changes only.
- **Touch targets:** at least 44 × 44 px.

## 4. Components

| Component | Spec |
|---|---|
| **Avatar** | Circle, 40 px in lists and 64 px on the confirm card. Uses the Telegram photo if available, otherwise initials on `--avatar-bg` with `--brand-text` text. |
| **UserRow** | Avatar + `@username` (headline) + caption line (display name, or "Paid 6 times" / "New"). Whole row tappable, 64 px tall. |
| **AmountDisplay** | `$` prefix at 60% size, `--text-muted`; value in `--type-amount-xl`, tabular-nums. Max 2 decimals. Shakes (6 px, 3×, 240 ms) + error haptic when the input is invalid. |
| **Keypad** | 3×4 grid (1–9, `.`, 0, ⌫), keys 64 px tall, `--type-amount-l` digits, light haptic per key. Use our own keypad, not the system keyboard, for amounts. |
| **Chip** | Quick amounts `$5 $10 $20 $50`. `--bg-secondary`, `--r-full`, `--type-label`. Selected = `--brand-soft` bg + `--brand-text` text. |
| **Card** | `--bg-secondary`, `--r-lg`, padding `--s-4`. |
| **Banner** | Icon + one-line text + optional link, on a `*-soft` bg with `*` icon and text colour, `--r-md`. Variants: info (brand), warning, success, danger. |
| **StatusPill** | Small pill: `Sent` (muted), `Received` (success), `Pending` (pending), `Refundable` (warning), `Failed` (danger). |
| **ActivityRow** | Avatar + "@alex" + caption (time / status pill) + right-aligned signed amount: `+$10.00` in `--success`, `−$5.00` in `--text`. |
| **Fingerprint** | `7xKX…9fQz` in `--type-mono`, tap to copy, with a toast "Address copied". |
| **Toast** | Bottom, above the MainButton, 2.5 s, `--text` bg with `--bg` text, `--r-md`. |
| **Skeleton loader** | `--bg-secondary` blocks with a 1.2 s shimmer. Use for every list and balance load. |
| **UsernameInput** | `@` prefix fixed. Live validation (debounced 300 ms) with a status line under the field (section 6.2). Lowercases as you type. |

Icons: Lucide (`lucide-react`), 20 px in rows and 24 px in nav, stroke 2. Use no emoji as UI icons.

## 5. Screens

Navigation: Home is the root. Everything else pushes on top and uses Telegram BackButton. No tab bar.

### S1 — Welcome (first open only)
- Logo mark (brand gradient circle with a "→$" glyph) + title "Send dollars to any @username" + body "No seed phrase, no fees. Just Telegram."
- Login happens automatically through Telegram initData plus the embedded wallet. Show a skeleton + "Setting up your wallet…" (≤ 2 s target).
- MainButton: **Get started** → S2.

### S1b — Sign in (v1.3; web, or when not signed in)
- Inside Telegram, the user signs in automatically with Telegram and never sees this screen. S1 → S2 as before.
- Outside Telegram (the web version), after the S1 logo and title: a stack of full-width 52 px buttons on `--bg-secondary`, `--r-md`, each with a 20 px icon on the left and a centred label:
  1. **Continue with Telegram**
  2. **Continue with Google**
  3. **Continue with Apple**
  4. **Continue with email** → S1c
  5. Divider "or"
  6. **Connect a wallet** → a bottom sheet listing Phantom, Solflare, Backpack and WalletConnect (detected wallets first, with an "Installed" pill)
- Under the stack, a text link (`--brand-text`): "Import an existing wallet" → S1d.
- Footer caption: "By continuing you agree to the Terms and Privacy Policy" (links).
- Errors: inline danger-text under the stack, e.g. "Google sign-in was cancelled" or "Couldn't connect to Phantom — is it unlocked?".

### S1c — Email code
- Email field → MainButton **Send code** → 6 single-digit boxes (auto-advance, paste fills all six, numeric keyboard) → auto-submit on the 6th digit.
- "Resend code" link, disabled with a 30 s countdown. Wrong code: shake + "That code isn't right". Expired: "That code expired — we sent a new one".

### S1d — Import wallet (web only)
- A full-screen warning first: shield icon, title "Only import a wallet you own", body "Pay System will never ask for your recovery phrase in a chat, DM or bot. Anyone who does is trying to steal your money." Checkbox "I understand". MainButton **Continue** (disabled until checked).
- Then a segmented control: Recovery phrase | Private key. Phrase: a 12/24-word grid with paste support and a word-count validator. Key: a masked field with a show toggle.
- MainButton **Import**. Success → S2 (or Home if the wallet already has a username).

### S17 — Settings → Sign-in methods (v1.3)
- Reached from the avatar on Home → Profile → "Sign-in methods".
- List of methods with a status: "Connected · alex@mail.com" or a **Link** button. At least one method must remain; the last one shows no Unlink option.
- Linking a method that already belongs to ANOTHER account: "That Google account is already used by @alex2. Sign in with it to manage that account instead."

### S2 — Pick your username
- Title "Pick your username". Caption "This is how friends pay you."
- UsernameInput is prefilled with the Telegram handle if valid and available.
- Validation states under the field:
  - typing / checking: spinner + "Checking…" (muted)
  - ✓ available: "@sakz is yours to claim" (success)
  - taken: "@alex is taken" (danger)
  - lookalike: "Too similar to @alex — pick something more distinct" (warning)
  - invalid: "3–20 characters: letters, numbers and _" (danger)
  - reserved: "That name is reserved" (danger)
- MainButton: **Claim @sakz**, disabled until available. Then a progress state "Claiming…" → success haptic → S3.

### S3 — Home
- Header: avatar + `@sakz` (tappable, goes to S9 Receive).
- Balance card: caption "Balance", `--type-amount-l` "$124.50", below it a muted "USDC on Solana".
- Two equal actions under the balance: **Send** (brand filled) and **Receive** (brand-soft). This is the one place with in-page buttons; the MainButton is hidden on Home.
- If there's unclaimed money for me: a success Banner "@sakz sent you $10 — Claim" → S7.
- "Activity" list (ActivityRow). Empty state: "No payments yet. Send your first $1 to a friend."
- Pending outgoing escrows appear with a `Pending` pill. After expiry they show `Refundable` with a "Refund" action.

### S4 — Send: choose recipient
- Search field "Username or @handle", autofocused.
- Section "Recent" (UserRows, most recent first), then live search results.
- If the typed handle has no Pay System account: a row "Send to @newfriend on Telegram", caption "They'll get a link to claim it", with a brand-soft avatar showing a link icon.
- "Did you mean": if the input is within edit distance 1–2 of a past recipient, show a warning Banner "Did you mean @alex? You've paid them 6 times." Tapping it selects @alex.
- Tapping a row → S5.
- **Wallet address (v1.1):** the search field placeholder becomes "Username, @handle or wallet address". Two icon buttons sit inside the field's right edge: **Paste** (clipboard) and **Scan** (Telegram `showScanQrPopup`; accepts a raw address or a `solana:<address>` URI).
  - When the input looks like an address (base58, 32–44 characters), show a single row: generic wallet icon avatar + "Send to wallet" (headline) + Fingerprint `7xKX…9fQz` (caption).
  - If that address belongs to a registered user, show their normal UserRow instead, with caption "Wallet of @alex".
  - Invalid: helper line (danger-text) "That's not a valid Solana address". Off-curve: "This address can't receive payments". Own wallet: "That's your own wallet".

### S5 — Send: amount
- Recipient pill at the top (avatar + @name).
- AmountDisplay + quick Chips + Keypad.
- Optional note field "What's it for?" (max 60 characters, one line).
- Balance caption: "Balance $124.50". If amount > balance: the caption turns danger "Not enough balance" and the MainButton is disabled.
- MainButton: **Review**.

### S6 — Confirm (the safety screen)
- Large Card, centred: 64 px avatar, `@alex` (headline), display name, caption "On Pay System since Oct 2026", Fingerprint.
- Amount `--type-amount-xl` "$10.00", note below.
- Safety banners, at most 2, shown in this order. Warnings 1–2 apply only to REGISTERED recipients; an escrow recipient shows banner 3 only. A send-failure banner replaces all of them while visible.
  1. Warning: "First time paying @alex2" (if never paid before)
  2. Warning: "This account was created today" (if age < 24 h)
  3. Info: "@newfriend isn't on Pay System yet. They have 7 days to claim, or you get it back." (escrow case)
- **Wallet-address variant (v1.1):** the card shows the wallet icon avatar, the title "Wallet address", and the FULL address in `--type-mono`, broken into groups of 4 characters over 3 lines so it can be checked by eye. No account age line. A single warning banner: "Double-check this address — payments can't be undone." There are no first-time or new-account banners for raw addresses.
- Fee row: "Network fee — Free" (success text).
- MainButton: **Send $10.00** → progress "Sending…" (MainButton progress spinner) → S8.
- Failure: danger Banner with a specific reason plus a **Try again** MainButton. Never lose the entered amount.

### S7 — Claim (incoming escrow)
- Opened from the bot's "Claim" link (deep link `startapp=claim_<escrow>`).
- Sender avatar + "@sakz sent you" + amount `--type-amount-xl` + note.
- If first time: "We'll set up your wallet — takes a second."
- MainButton: **Claim $10.00** → "Claiming…" → S8 (received variant) → then S2 if they have no username yet ("Pick a username so friends can pay you directly").
- Expired: muted card "This payment expired and was returned to @sakz."
- Wrong account: "This payment was sent to @newfriend. You're signed in as @other."

### S8 — Success
- Brand gradient circle with a check, scale-in (0.8 → 1, 320 ms) + success haptic. This is the one celebratory moment.
- "Sent $10.00 to @alex" or "You received $10.00 from @sakz".
- Caption: "Settled in 0.9 s · Free" (show the real measured time; it's part of the pitch).
- Secondary link "View on explorer" (devnet).
- MainButton: **Done** → Home.

### S9 — Receive
- `@sakz` large, a QR code of the deep link `t.me/<bot>/app?startapp=pay_sakz`, and a **Share** MainButton (Telegram `switchInlineQuery` or share link).
- Fingerprint below in a "Wallet address" detail row (for advanced users).

### S10 — Activity detail
- Amount, counterparty UserRow, status pill, timestamp, note, fee "Free", explorer link.
- For a pending escrow: "Expires in 6 days" + a disabled **Refund** button. After expiry the button is enabled.

## 5a. Local currency and phone accounts (v1.3)

### Global display rules
- All amounts show in the user's **local currency** first, with dollars secondary where it matters: the Home balance shows "₦199,200" in `--type-amount-l` with "$124.50 USDC" below it as the caption. Lists show local currency only. Confirm and Success show both ("₦10,000 · ≈ $6.25").
- Format with `Intl.NumberFormat(locale, {style:'currency', currency})`. Currencies with 0 decimals (UGX) show none. Always `tabular-nums`.
- Rate caption wherever a conversion is shown: "Rate ₦1,600/$ · updated 12 s ago" (muted caption).

### S5 changes — amount entry
- A currency toggle pill next to the amount: `₦ ⇄ $`. The secondary line under the amount shows the other currency: "≈ $6.25".
- Quick chips use local round numbers (₦1,000 / ₦5,000 / ₦10,000 / ₦20,000), defined per currency in `currencies.ts`.

### S6 changes — confirm
- Amount "₦10,000" + caption "≈ $6.25 USDC". Quote countdown under the fee row: "Rate locked for 0:58". At 0 the rate refreshes, and if the amount changed: info banner "Rate updated: ≈ $6.24".

### S4 changes — recipient
- The search accepts phone numbers in national or international format. When it parses as a phone: a row with a phone icon avatar + "+234 801 234 5678" + caption ("@ada" if registered, or "Not on Pay System — they'll get a link to claim it").
- After an escrow send to a phone: S8 shows a **Share link** MainButton (WhatsApp/SMS via the share sheet) instead of Done, plus a secondary "Done" link. Caption: "Send them this link so they can claim it".

### S20 — Verify phone (onboarding, after S2; skippable)
- Title "Add your phone number". Caption "Friends can pay you with it — it becomes your account number."
- Inside Telegram: MainButton **Share my number** → Telegram `requestContact`. Web: a phone field with a country picker (flag + dial code, defaulted from locale) → **Send code** → 6-digit boxes (same component as S1c).
- Success: Card "Your account number" `801 234 5678` with a copy icon. Caption "Kept private — only shown to people you pay." MainButton **Continue**.
- Link "Skip for now". Later reachable from Profile.
- Errors: "That number is already linked to another account", "That code isn't right".

### S18 — Add money (top-up)
- Entry: Home gets a third action under the balance. The row becomes **Add money** | **Send** | **Receive** (three equal buttons, Send stays the brand fill).
- Step 1: the amount keypad in local currency + "You'll get ≈ $62.50" + fee line + limit caption.
- Step 2: method list: Bank transfer (recommended pill), Card, Mobile money (shown only for countries that use it, per `currencies.ts`).
- Step 3 (bank transfer): Card with "Bank Demo Bank · Account 0123456789 · Reference PS-7F3K2" (each with copy), a countdown "Quote valid for 9:41", MainButton **I've sent the money**.
- Status screen: a vertical 3-step timeline (Waiting for payment → Payment received → Dollars added). Pending steps show a spinner, done steps `--success`. When it completes → S8 variant "₦100,000 added · $62.50".
- A "Demo" pill in the header on every ramp screen while running on the mock.

### S19 — Cash out (off-ramp)
- Entry: Home → balance card overflow (⋯) → Cash out. Also from Profile.
- Step 1: amount (max = balance; "Cash out all" chip). Step 2: destination: saved accounts, or "Add bank account" (bank picker with search → 10-digit account number → name lookup shows "ADA OBI" in a success-soft card for confirmation) or mobile money.
- Step 3: confirm (amount, fee, "You'll receive ₦99,850", destination). MainButton **Cash out ₦100,000** (single-flight, intent ID as for sends).
- Status timeline: Sending → Processing → Paid to your bank. Then S8 variant "₦99,850 is on its way to Access Bank ••4567".

### Settings → Currency
- A searchable list of currencies (flag, name, code). The selected one shows a check. Caption "Your money stays in dollars — this only changes how it's shown."

### Copy
| Case | Copy |
|---|---|
| Quote expired | "Rate updated: ≈ $6.24" |
| Over the limit | "Over your daily limit of ₦500,000" |
| Name lookup failed | "Couldn't find that account. Check the number and bank." |
| Phone already used | "That number is already linked to another account" |
| Incoming swap row | "Received 5.00 USDT → $4.99" |

## 5b. Tickets (v1.1)

Entry point: on Home, below the Send/Receive pair and above any claim banner, add a full-width Card row with a ticket icon, "Tickets" (headline) and the caption "2 upcoming" or "Find events", plus a chevron. → S11.

### S11 — Events
- Title "Tickets". Segmented control: **Events** | **My tickets** (My tickets badge = count).
- Events: EventCards. Each card has a gradient-free colour block (brand-soft) with a date badge ("NOV 7"), event name (headline), venue · time (caption), price "$25" on the right, and a "Sold out" or "12 left" pill when fewer than 20 remain. Empty: "No events yet."
- My tickets: TicketRows (event name, date, ticket number "#014", status pill: `Upcoming` / `Listed $27.50` / `Used`). Empty: "No tickets yet. Find an event."

### S12 — Event detail
- Large colour block header with the date badge, event name (title), venue, date and time.
- Info rows: "Price $25.00", "Resale cap $27.50 (110%)" with an info icon. Tapping the icon opens a sheet: "To stop scalping, tickets can only be resold for up to 110% of face value."
- Resale section (if listings exist): "Resale from $26.00" with up to 3 rows (seller @name, price, Buy), cheapest first.
- MainButton: **Buy ticket · $25.00** → confirm sheet (event, price, "Network fee — Free", balance after) → progress "Buying…" → S8 variant "You're going to Solana Night Live" + caption "Ticket #014 · Settled in 0.8 s".
- Not enough balance: MainButton disabled + danger-text caption "Not enough balance". Sold out: MainButton hidden, banner "Sold out — check resale below".

### S13 — My ticket
- A ticket-shaped card: notched sides (radial-gradient cut-outs), event name, date, venue, "#014", and the holder "@sakz".
- **QR code** (≥ 200 px, white quiet zone even in dark mode). Caption "Refreshes every 30 s · Screenshots won't work" with a small countdown ring.
- Actions under the card: **Gift** and **Resell** (brand-soft buttons, like Receive). Disabled states show their reason in a caption: "Already gifted once", "Transfers lock 24 h before the show", "Listed for $27.50 — Cancel listing".
- Used ticket: QR replaced by a muted "Checked in · Nov 7, 8:14 PM".
- No MainButton on this screen. The QR is the point.

### S14 — Gift ticket
- Reuses S4's recipient picker (registered users only; unregistered handles show "@newfriend needs a Pay System account first").
- Confirm: recipient card + ticket summary + warning banner "You can only gift this ticket once". MainButton **Gift ticket** → S8 variant "Ticket sent to @newfriend".

### S15 — Resell
- Price entry reuses the keypad (S5). Under the amount: "Max $27.50" (muted). Typing above the cap shakes the amount, gives an error haptic, and the caption turns danger-text "Max resale price is $27.50". The MainButton is disabled.
- MainButton **List for $26.00** → S13 with the pill "Listed $26.00" and a "Cancel listing" link.

### S16 — Check-in (organizer only)
- Shown on S12 to the event's organizer as an extra MainButton: **Scan tickets**. It opens Telegram `showScanQrPopup` ("Scan a ticket").
- Result as a full-screen state, auto-closing after 2 s and then reopening the scanner:
  - **Admit:** `--success` full background, big check, "Admit", "@newfriend · #014", success haptic.
  - **Already used:** `--danger` background, "Already used", "Checked in at 8:14 PM", error haptic.
  - **Not valid:** `--danger` background, "Not valid", with the reason ("Wrong event" / "Expired code" / "Not the owner"), error haptic.
- Counter at the top: "Checked in 37 / 120".

### Ticket copy
| Case | Copy |
|---|---|
| Over the cap | "Max resale price is $27.50" |
| Second gift | "Already gifted once" |
| Lock window | "Transfers lock 24 h before the show" |
| Recipient unregistered | "@newfriend needs a Pay System account first" |
| Sold out | "Sold out — check resale below" |
| Bot DM on gift | "🎟 @sakz sent you a ticket to **Solana Night Live** (Nov 7)" + button **View ticket** |

## 6. UX copy

### 6.1 Voice
Short, friendly and specific, written in the second person. Say "dollars" or "$", never "USDC" except in the balance caption and detail views. Say "username", not "domain". Never say "transaction failed". Say what happened and what to do next.

### 6.2 Error messages
| Case | Copy |
|---|---|
| Taken | "@alex is taken" |
| Lookalike | "Too similar to @alex — pick something more distinct" |
| Invalid | "3–20 characters: letters, numbers and _" |
| Reserved | "That name is reserved" |
| One per account | "You already have @sakz" |
| Not enough balance | "Not enough balance" |
| Network error (we know it didn't land) | "Payment didn't go through. Your money hasn't moved — try again." |
| Network error (unknown yet) | Banner info: "Checking your payment…" with a spinner. No Try again until it resolves. |
| Turned out it did land | Go straight to S8 Success. Don't show an error. |
| Resale listing changed | "This listing just changed. Check the new price and try again." |
| Claim expired | "This payment expired and was returned to @sakz." |
| Claim wrong user | "This payment was sent to @newfriend. You're signed in as @other." |

### 6.3 Bot messages
- Payment to a member: "💸 @sakz sent you **$10.00**" + note + inline button **Open**.
- Escrow in a group: "💸 @newfriend, @sakz sent you **$10.00**. Tap to claim — it's free." + inline button **Claim $10**.
- Sender DM after an escrow: "Sent $10 to @newfriend. They have 7 days to claim it, or it comes back to you."
- Refund available: "@newfriend didn't claim your $10. Tap to get it back." + button **Refund**.
- `/send` with a bad format: "Try: /send @alex 5"
(The bot may use one emoji, 💸, at the start of payment messages. Nowhere else.)

### 6.4 Decisions from review 1 (v1.1)
- S2 disabled MainButton: "Claim". Show "Claim @name" only when the name is available.
- S8 escrow: extra caption "They have 7 days to claim it".
- S8 refund: title "Refunded $5.00", caption "It's back in your balance"; pill "Refunded".
- S9 share text: "Pay me on Pay System: @sakz" + link.
- Invalid or claimed link: "This payment link isn't valid anymore." + "If you think this is wrong, ask the sender to resend it."
- S10 labels: Date, Note, Status, Fee, Transaction.
- Plurals: "Paid 1 time" / "Paid 6 times"; "Expires in 1 day" / "Expires in 6 days"; under 24 h "Expires today".
- Keypad keys shrink to 56 px when the viewport height is under 600 px.

## 7. States checklist (every screen)
Loading (skeleton) · Empty · Error (Banner + retry) · Success · Offline ("You're offline" toast; disable the MainButton) · Light and dark theme · 360 px width · Reduced motion.

## 8. Accessibility
- Every icon-only control has an `aria-label`.
- Amounts are read as "10 dollars", e.g. via `aria-label` on AmountDisplay.
- Focus ring: 2 px `--brand` outline, 2 px offset, visible on keyboard focus.
- Status is never conveyed by colour alone: always pair it with a text pill or icon.
- Live validation messages use `aria-live="polite"`.

## 9. Demo polish (must look right on stage)
- Seed the demo accounts `@sakz` and `@newfriend` with avatars and a few past activity rows.
- Show the real settle time on S8.
- S2 lookalike rejection (`@5akz`) must show the warning copy instantly (client-side skeleton check), before the chain call.
