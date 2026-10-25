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
| `--brand-text` | `#6A45F5` | `#8F74FF` | brand TEXT and icons: links, selected chip text, Receive button text |
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
| **Avatar** | Circle, 40 px in lists and 64 px on the confirm card. Uses the Telegram photo if available, otherwise initials on `--brand-soft` with `--brand-text` text. |
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

### S5 — Send: amount
- Recipient pill at the top (avatar + @name).
- AmountDisplay + quick Chips + Keypad.
- Optional note field "What's it for?" (max 60 characters, one line).
- Balance caption: "Balance $124.50". If amount > balance: the caption turns danger "Not enough balance" and the MainButton is disabled.
- MainButton: **Review**.

### S6 — Confirm (the safety screen)
- Large Card, centred: 64 px avatar, `@alex` (headline), display name, caption "On Pay System since Oct 2026", Fingerprint.
- Amount `--type-amount-xl` "$10.00", note below.
- Safety banners, at most 2, shown in this order:
  1. Warning: "First time paying @alex2" (if never paid before)
  2. Warning: "This account was created today" (if age < 24 h)
  3. Info: "@newfriend isn't on Pay System yet. They have 7 days to claim, or you get it back." (escrow case)
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
| Network error | "Couldn't reach Solana. Your money hasn't moved — try again." |
| Claim expired | "This payment expired and was returned to @sakz." |
| Claim wrong user | "This payment was sent to @newfriend. You're signed in as @other." |

### 6.3 Bot messages
- Payment to a member: "💸 @sakz sent you **$10.00**" + note + inline button **Open**.
- Escrow in a group: "💸 @newfriend, @sakz sent you **$10.00**. Tap to claim — it's free." + inline button **Claim $10**.
- Sender DM after an escrow: "Sent $10 to @newfriend. They have 7 days to claim it, or it comes back to you."
- Refund available: "@newfriend didn't claim your $10. Tap to get it back." + button **Refund**.
- `/send` with a bad format: "Try: /send @alex 5"
(The bot may use one emoji, 💸, at the start of payment messages. Nowhere else.)

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
