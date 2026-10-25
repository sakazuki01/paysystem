import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import anchor from "@coral-xyz/anchor";
import { createMint } from "@solana/spl-token";
import type { PaySystem } from "../target/types/pay_system.ts";
import { validateUsername } from "../packages/shared/src/index.ts";

const { BN, web3 } = anchor;
type Keypair = InstanceType<typeof web3.Keypair>;
type PublicKey = InstanceType<typeof web3.PublicKey>;

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.PaySystem as InstanceType<typeof anchor.Program<PaySystem>>;
// The provider wallet plays the backend: config authority + fee payer.
const authority: Keypair = (provider.wallet as unknown as { payer: Keypair }).payer;

const vectors = JSON.parse(
  readFileSync(new URL("../shared/username-vectors.json", import.meta.url), "utf8"),
);

// ---------- helpers ----------

const seed = (s: string) => Buffer.from(s, "utf8");

function pda(...seeds: Buffer[]): PublicKey {
  return web3.PublicKey.findProgramAddressSync(seeds, program.programId)[0];
}

function tgSeed(telegramId: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(telegramId);
  return b;
}

function pdas(name: string, skeleton: string, telegramId: bigint) {
  return {
    config: pda(seed("config")),
    usernameRecord: pda(seed("username"), seed(name)),
    skeletonRecord: pda(seed("skeleton"), seed(skeleton)),
    telegramIndex: pda(seed("tg"), tgSeed(telegramId)),
  };
}

let nextTelegramId = 1_000_000n;
const freshTelegramId = () => nextTelegramId++;

/** Sends register_username exactly as given: no client-side normalization or checks. */
function registerRaw(
  name: string,
  skeleton: string,
  telegramId: bigint,
  owner: Keypair = web3.Keypair.generate(),
  signer: Keypair = authority,
) {
  return program.methods
    .registerUsername(name, skeleton, new BN(telegramId.toString()))
    .accountsPartial({
      ...pdas(name, skeleton, telegramId),
      authority: signer.publicKey,
      owner: owner.publicKey,
    })
    .signers(signer === authority ? [owner] : [owner, signer])
    .rpc();
}

/** What a client (backend / Mini App) would tell the user before sending. */
async function diagnose(input: string, telegramId: bigint) {
  const v = validateUsername(input);
  if (!v.ok) return v.error;
  const p = pdas(v.normalized, v.skeleton, telegramId);
  const exists = async (k: PublicKey) => (await provider.connection.getAccountInfo(k)) !== null;
  if (await exists(p.usernameRecord)) return "UsernameTaken";
  if (await exists(p.skeletonRecord)) return "UsernameTooSimilar";
  if (await exists(p.telegramIndex)) return "TelegramIdAlreadyRegistered";
  return null;
}

/** Client path: normalize + compute skeleton with packages/shared, then send. */
function register(input: string, telegramId: bigint, owner?: Keypair) {
  const v = validateUsername(input);
  if (!v.ok) throw new Error(v.error);
  return registerRaw(v.normalized, v.skeleton, telegramId, owner);
}

async function expectFail(p: Promise<unknown>, match: string) {
  try {
    await p;
  } catch (e: any) {
    const code = e?.error?.errorCode?.code ?? "";
    const logs = (e?.logs ?? e?.transactionLogs ?? []).join("\n");
    const text = `${code}\n${e?.message ?? ""}\n${logs}`;
    assert.ok(text.includes(match), `expected "${match}", got:\n${text}`);
    return;
  }
  assert.fail(`expected transaction to fail with "${match}"`);
}

const ALREADY_IN_USE = "already in use";

// ---------- setup ----------

let usdcMint: PublicKey;

before(async () => {
  usdcMint = await createMint(provider.connection, authority, authority.publicKey, null, 6);
  await program.methods.initialize(usdcMint).accounts({ authority: authority.publicKey }).rpc();
});

test("initialize stores authority and mint", async () => {
  const config = await program.account.config.fetch(pda(seed("config")));
  assert.ok(config.authority.equals(authority.publicKey));
  assert.ok(config.usdcMint.equals(usdcMint));
});

test("initialize cannot be called twice", async () => {
  await expectFail(
    program.methods.initialize(usdcMint).accounts({ authority: authority.publicKey }).rpc(),
    ALREADY_IN_USE,
  );
});

// ---------- Milestone A ----------

const alexOwner = web3.Keypair.generate();
const alexTelegramId = freshTelegramId();

test("1. register alex creates all three PDAs with correct fields", async () => {
  await register("alex", alexTelegramId, alexOwner);
  const p = pdas("alex", "alex", alexTelegramId);

  const record = await program.account.usernameRecord.fetch(p.usernameRecord);
  assert.ok(record.owner.equals(alexOwner.publicKey));
  assert.equal(record.telegramId.toString(), alexTelegramId.toString());
  assert.equal(record.name, "alex");
  assert.ok(record.createdAt.toNumber() > 0);

  const skeletonRecord = await program.account.skeletonRecord.fetch(p.skeletonRecord);
  assert.ok(skeletonRecord.username.equals(p.usernameRecord));

  const telegramIndex = await program.account.telegramIndex.fetch(p.telegramIndex);
  assert.ok(telegramIndex.username.equals(p.usernameRecord));
});

test("2. another wallet + Telegram ID cannot take alex", async () => {
  const tg = freshTelegramId();
  assert.equal(await diagnose("alex", tg), "UsernameTaken");
  await expectFail(register("alex", tg), ALREADY_IN_USE);
});

test("3. lookalikes of alex are rejected", async () => {
  for (const [input, why] of [
    ["a1ex", "UsernameTooSimilar"],
    ["alex_", "UsernameTooSimilar"],
    ["ALEX", "UsernameTaken"],
    ["aalex", "UsernameTooSimilar"],
  ]) {
    const tg = freshTelegramId();
    assert.equal(await diagnose(input, tg), why, input);
    await expectFail(register(input, tg), ALREADY_IN_USE);
  }
  // Raw "ALEX" is refused too, but its skeleton PDA already exists, so `init` fails first.
  await expectFail(registerRaw("ALEX", "alex", freshTelegramId()), ALREADY_IN_USE);
  // With a fresh skeleton the handler is reached: un-normalized names are InvalidUsername.
  await expectFail(registerRaw("Zed99", "zed9", freshTelegramId()), "InvalidUsername");
});

test("4. a Telegram ID cannot register a second name", async () => {
  assert.equal(await diagnose("zed_99", alexTelegramId), "TelegramIdAlreadyRegistered");
  await expectFail(register("zed_99", alexTelegramId), ALREADY_IN_USE);
});

test("5. a signer that is not config.authority is rejected", async () => {
  const impostor = web3.Keypair.generate();
  const sig = await provider.connection.requestAirdrop(impostor.publicKey, web3.LAMPORTS_PER_SOL);
  await provider.connection.confirmTransaction(sig, "confirmed");
  await expectFail(
    registerRaw("impostor", "lmpostor", freshTelegramId(), web3.Keypair.generate(), impostor),
    "Unauthorized",
  );
});

test("6. a spoofed skeleton argument is rejected", async () => {
  await expectFail(registerRaw("spoofme", "nothingalike", freshTelegramId()), "SkeletonMismatch");
});

test("7. invalid and reserved names fail with the right error code", async () => {
  let i = 0;
  for (const v of vectors.invalid) {
    await expectFail(
      registerRaw(v.input, `unused${i++}`, freshTelegramId()),
      v.error,
    );
  }
});

test("8. two different valid names both succeed", async () => {
  await register("sakz", freshTelegramId());
  const record = await program.account.usernameRecord.fetch(pdas("sakz", "sakz", 0n).usernameRecord);
  assert.equal(record.name, "sakz");
  // alex (test 1) is still intact alongside it
  const alex = await program.account.usernameRecord.fetch(pdas("alex", "alex", 0n).usernameRecord);
  assert.equal(alex.name, "alex");
});
