import { test } from "node:test";
import assert from "node:assert/strict";
import { Keypair, PublicKey } from "@solana/web3.js";
import { parseRecipient, validateAddress } from "../src/index.ts";

const wallet = Keypair.generate().publicKey.toBase58(); // on the ed25519 curve
const [pda] = PublicKey.findProgramAddressSync([Buffer.from("escrow")], new PublicKey("11111111111111111111111111111112")); // off-curve

test("validateAddress: a real wallet is ok", () => {
  assert.equal(validateAddress(wallet), "ok");
});

test("validateAddress: wrong length is invalid", () => {
  assert.equal(validateAddress(wallet.slice(0, 20)), "invalid");
  assert.equal(validateAddress(wallet + wallet.slice(0, 6)), "invalid");
});

test("validateAddress: non-base58 characters (0 O I l) are invalid", () => {
  for (const bad of ["0", "O", "I", "l"]) {
    assert.equal(validateAddress(bad + wallet.slice(1)), "invalid", bad);
  }
});

test("validateAddress: a program-derived (off-curve) address can't receive", () => {
  assert.equal(validateAddress(pda.toBase58()), "offCurve");
});

test("validateAddress: trims whitespace and accepts a solana: URI", () => {
  assert.equal(validateAddress(`  ${wallet}\n`), "ok");
  assert.equal(validateAddress(`solana:${wallet}`), "ok");
  assert.equal(validateAddress(`solana:${wallet}?amount=5&label=Pizza`), "ok");
});

test("parseRecipient: addresses (raw, URI, whitespace)", () => {
  assert.deepEqual(parseRecipient(wallet), { kind: "address", address: wallet, validity: "ok" });
  assert.deepEqual(parseRecipient(` solana:${wallet}?amount=1 `), { kind: "address", address: wallet, validity: "ok" });
  assert.deepEqual(parseRecipient(pda.toBase58()), { kind: "address", address: pda.toBase58(), validity: "offCurve" });
});

test("parseRecipient: a long base58-looking string that isn't 32 bytes is an invalid address", () => {
  const bad = "0" + wallet.slice(1);
  assert.deepEqual(parseRecipient(bad), { kind: "address", address: bad, validity: "invalid" });
});

test("parseRecipient: usernames (normalized, @ stripped)", () => {
  assert.deepEqual(parseRecipient("@Alex"), { kind: "username", username: "alex" });
  assert.deepEqual(parseRecipient("sakz"), { kind: "username", username: "sakz" });
});

test("parseRecipient: Telegram handles too long to be usernames", () => {
  assert.deepEqual(parseRecipient("@a_very_long_telegram_handle"), { kind: "handle", handle: "a_very_long_telegram_handle" });
});

test("parseRecipient: anything else is invalid", () => {
  assert.deepEqual(parseRecipient("al ex"), { kind: "invalid" });
  assert.deepEqual(parseRecipient(""), { kind: "invalid" });
});
