#!/usr/bin/env bash
# Build the program and run the Anchor integration tests on a throwaway local validator.
# Works from a clean checkout. Run inside WSL/Linux from the repo root:
#
#   bash scripts/anchor-test.sh
#
# Why not plain `anchor test`:
#  - Current crates need edition 2024; Agave's default platform-tools ship Cargo 1.84,
#    so the SBF build is pinned to platform-tools v1.58 (Cargo 1.95).
#  - Extra build-sbf args also reach the IDL build (host `cargo test`), so IDL is built separately.
#  - CARGO_TARGET_DIR / the ledger can live off a slow or synced filesystem (e.g. /mnt/c on WSL).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
TOOLS_VERSION="${TOOLS_VERSION:-v1.58}"
LEDGER="${LEDGER:-$HOME/.cache/pay-system/test-ledger}"
TARGET="${CARGO_TARGET_DIR:-$ROOT/target}"

echo "== keys (program id from target/deploy/pay_system-keypair.json; never committed)"
anchor keys sync

echo "== build (platform-tools $TOOLS_VERSION)"
anchor build --no-idl -- --tools-version "$TOOLS_VERSION"
mkdir -p target/deploy target/idl target/types
if [ "$TARGET" != "$ROOT/target" ]; then
  cp "$TARGET/deploy/pay_system.so" target/deploy/pay_system.so
fi

echo "== idl"
anchor idl build -o target/idl/pay_system.json -t target/types/pay_system.ts

echo "== validator (ledger: $LEDGER)"
mkdir -p "$(dirname "$LEDGER")"
solana-test-validator --ledger "$LEDGER" --reset --quiet >/dev/null 2>&1 &
VALIDATOR=$!
trap 'kill $VALIDATOR 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do
  solana cluster-version --url http://127.0.0.1:8899 >/dev/null 2>&1 && break
  sleep 1
done

echo "== anchor test"
anchor test --skip-build --skip-local-validator
