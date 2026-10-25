# Pay System

Venmo inside Telegram: send dollars (USDC on Solana) to any @username, even if they've never touched crypto.
Spec: [`PAY_SYSTEM_LOGIC.md`](PAY_SYSTEM_LOGIC.md) · Design: [`design/DESIGN_SPEC.md`](design/DESIGN_SPEC.md)

| Path | What |
|---|---|
| `programs/pay_system/` | Anchor program (usernames; escrow next) |
| `tests/` | Anchor integration tests (localnet), Node's built-in test runner |
| `packages/shared/` | TS `normalize` / `skeleton` / `validateUsername`, shared by backend + Mini App |
| `shared/username-vectors.json` | One fixture both the Rust and TS tests load |
| `apps/miniapp/` | Telegram Mini App (Vite + React), mocked data layer |

## Prerequisites

- Node ≥ 22.18 (runs `.ts` tests natively)
- For the program (Linux, or WSL + Ubuntu on Windows). Verified with:
  rustc 1.99.1 · Agave/Solana CLI **4.2.2** · anchor-cli **0.32.1** (via avm) · Node 24.22.1 · platform-tools **v1.58** (Cargo 1.95).
  Agave's default platform-tools ship Cargo 1.84, which can't parse current edition-2024 crates, so the build pins v1.58 (`scripts/anchor-test.sh` does this).
  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  sh -c "$(curl -sSfL https://release.anza.xyz/v4.2.2/install)"
  cargo install --git https://github.com/coral-xyz/anchor avm --locked && avm install 0.32.1 && avm use 0.32.1
  solana-keygen new --no-bip39-passphrase   # local wallet for the validator (never committed)
  ```

## Build and test

```bash
npm install                      # Windows/host side (Mini App + shared + anchor TS deps)
npm run test:shared              # username + recipient rules vs shared vectors
cargo test -p pay_system         # same username vectors, Rust side
bash scripts/anchor-test.sh      # keys sync → SBF build → IDL → local validator → anchor tests
npm test -w @pay-system/miniapp  # Mini App
```

On WSL with the repo under `/mnt/c`: set `CARGO_TARGET_DIR=/root/target/pay_system` so build output stays off the Windows/OneDrive filesystem. The script copies the `.so` back into `target/deploy` and keeps the validator ledger in `~/.cache/pay-system`. Don't run `npm install` inside WSL against the Windows `node_modules`; the anchor tests only need pure-JS packages, which work from either side.

The program id comes from `target/deploy/pay_system-keypair.json` (gitignored, generated on first run). `anchor keys sync` (run by the script) rewrites `declare_id!` and `Anchor.toml` to match your local keypair.

## Program: accounts

| Account | Seeds | Fields |
|---|---|---|
| `Config` | `["config"]` | `authority` (backend key + fee payer), `usdc_mint`, `bump` |
| `UsernameRecord` | `["username", name]` | `owner`, `telegram_id`, `name` (≤ 20), `created_at`, `bump` |
| `SkeletonRecord` | `["skeleton", skeleton(name)]` | `username` (→ UsernameRecord), `bump` |
| `TelegramIndex` | `["tg", telegram_id as u64 LE]` | `username` (→ UsernameRecord), `bump` |

`register_username(name, skeleton, telegram_id)` needs signatures from `owner` and `authority` (the authority pays and attests it verified the Telegram ID). `name` must already be normalized (lowercase), because the PDA seed comes from the raw argument. The program recomputes the skeleton and rejects a mismatch. Uniqueness of name, lookalike and Telegram ID comes from `init` on the three PDAs.

Skeleton: remove `_` → `rn`→`m` → map `0→o 1→l i→l 5→s 3→e 8→b` → collapse repeated characters.

## Program: error codes

| Code | When |
|---|---|
| `InvalidUsername` | not 3–20 chars of `[a-z0-9_]`, or not pre-normalized |
| `ReservedUsername` | admin, support, help, official, solana, telegram, paysystem, pay_system, wallet, root, system, mod, moderator, usdc |
| `SkeletonMismatch` | `skeleton` arg ≠ recomputed skeleton |
| `Unauthorized` | signer isn't `config.authority` |
| *(system)* "already in use" | name taken / too similar / Telegram ID already has a name. Clients diagnose which by checking the three PDAs (`tests/username.test.ts` → `diagnose`) |

## Before devnet

- [ ] **Gate `initialize` to the program's upgrade authority** (check `program_data.upgrade_authority_address`). Today the first caller becomes the authority. Fine on localnet, front-runnable on devnet.
- [ ] Replace the placeholder program id in `declare_id!` / `Anchor.toml` with a real keypair (never committed).

## Mini App

```bash
npm run dev -w @pay-system/miniapp   # http://localhost:5173
```

Outside Telegram, a dev shim (`src/telegram/devShim.ts`) fakes `themeParams`, the **MainButton** (fixed bottom), the **BackButton** (top-left) and haptics (logged with `console.debug`). Inside Telegram the real `window.Telegram.WebApp` is used.

| Query param | Effect |
|---|---|
| `?theme=dark` / `?theme=light` | starting theme (default: OS preference). The **Light/Dark** pill top-right toggles it live. |
| `?as=newfriend` | sign in as a Telegram user with no username (S1 Welcome → S2) |
| `?startapp=claim_<id>` | open S7 Claim. Seeded ids: `esc_for_sakz` (normal), `esc_expired`, `esc_newfriend` (wrong user as @sakz; normal as `?as=newfriend`) |

**Mock seed** (`src/api/MockPayApi.ts`): @sakz (you, $124.50), @alex (paid 6 times), @maya, @alex2 (created today, never paid), @newfriend (on Telegram, no account), recent activity, a pending escrow to @newfriend (6 days left), an expired, refundable one to @oldpal, and two incoming escrows to @sakz. Writes take ~900 ms and return a `settleMs` between 700 and 1200. In dev, `window.payApi.failNext("network")` makes the next write fail.

**Design-review screenshots:** with the dev server running, `npm run screenshots -w @pay-system/miniapp` drives a locally installed Chrome/Edge (puppeteer-core, no browser download; override with `BROWSER=`) and writes PNGs to `design/review/`.

**Real API:** implement the `PayApi` interface (`src/api/PayApi.ts`) and swap it in at `src/main.tsx`. Screens only ever talk to `PayApi`.
