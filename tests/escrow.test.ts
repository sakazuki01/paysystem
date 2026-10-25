import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import anchor from "@coral-xyz/anchor";
import {
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import {
  ALREADY_IN_USE,
  authority,
  configPda,
  ensureConfig,
  expectFail,
  pda,
  program,
  provider,
  seed,
  TEST_ESCROW_TTL_SECS,
} from "./setup.ts";

const { BN, web3 } = anchor;
type Keypair = InstanceType<typeof web3.Keypair>;
type PublicKey = InstanceType<typeof web3.PublicKey>;

const USDC = 1_000_000; // base units per dollar
let usdcMint: PublicKey;

// ---------- helpers ----------

const intent = () => [...randomBytes(16)];
const alias = () => [...randomBytes(32)];
const ata = (owner: PublicKey, mint = usdcMint) => getAssociatedTokenAddressSync(mint, owner, true);
const balance = async (owner: PublicKey) => {
  try {
    return Number((await getAccount(provider.connection, ata(owner))).amount);
  } catch {
    return 0;
  }
};
const exists = async (k: PublicKey) => (await provider.connection.getAccountInfo(k)) !== null;

/** A wallet with a USDC account holding `dollars`. No SOL needed: the authority pays everything. */
async function user(dollars = 0): Promise<Keypair> {
  const kp = web3.Keypair.generate();
  const acct = await getOrCreateAssociatedTokenAccount(provider.connection, authority, usdcMint, kp.publicKey);
  if (dollars) await mintTo(provider.connection, authority, usdcMint, acct.address, authority, dollars * USDC);
  return kp;
}

const receiptPda = (sender: PublicKey, intentId: number[]) => pda(seed("receipt"), sender.toBuffer(), Buffer.from(intentId));
const escrowPda = (aliasHash: number[], sender: PublicKey, intentId: number[]) =>
  pda(seed("escrow"), Buffer.from(aliasHash), sender.toBuffer(), Buffer.from(intentId));

function pay(sender: Keypair, recipient: PublicKey, amount: number, intentId = intent(), opts: { authority?: Keypair; mint?: PublicKey } = {}) {
  const auth = opts.authority ?? authority;
  const mint = opts.mint ?? usdcMint;
  return program.methods
    .pay(intentId, new BN(amount))
    .accountsPartial({
      config: configPda(),
      authority: auth.publicKey,
      sender: sender.publicKey,
      recipient,
      usdcMint: mint,
      senderAta: ata(sender.publicKey, mint),
      recipientAta: ata(recipient, mint),
      receipt: receiptPda(sender.publicKey, intentId),
    })
    .signers(auth === authority ? [sender] : [sender, auth])
    .rpc();
}

function sendToEscrow(sender: Keypair, aliasHash: number[], amount: number, intentId = intent()) {
  const escrow = escrowPda(aliasHash, sender.publicKey, intentId);
  const tx = program.methods
    .sendToEscrow(intentId, aliasHash, new BN(amount))
    .accountsPartial({
      config: configPda(),
      authority: authority.publicKey,
      sender: sender.publicKey,
      usdcMint,
      senderAta: ata(sender.publicKey),
      escrow,
      vault: ata(escrow),
      receipt: receiptPda(sender.publicKey, intentId),
    })
    .signers([sender])
    .rpc();
  return { escrow, tx, intentId };
}

function claim(escrow: PublicKey, claimer: Keypair, auth: Keypair = authority) {
  return program.methods
    .claimEscrow()
    .accountsPartial({
      config: configPda(),
      authority: auth.publicKey,
      claimer: claimer.publicKey,
      usdcMint,
      escrow,
      vault: ata(escrow),
      claimerAta: ata(claimer.publicKey),
    })
    .signers(auth === authority ? [claimer] : [claimer, auth])
    .rpc();
}

function refund(escrow: PublicKey, sender: Keypair) {
  return program.methods
    .refundEscrow()
    .accountsPartial({
      config: configPda(),
      authority: authority.publicKey,
      sender: sender.publicKey,
      usdcMint,
      escrow,
      vault: ata(escrow),
      senderAta: ata(sender.publicKey),
    })
    .signers([sender])
    .rpc();
}

/** Wait until the validator's clock passes the escrow's expiry. */
async function waitForExpiry(expiresAt: number) {
  for (;;) {
    const t = await provider.connection.getBlockTime(await provider.connection.getSlot("confirmed"));
    if (t !== null && t > expiresAt) return;
    await new Promise((r) => setTimeout(r, 500));
  }
}

before(async () => {
  ({ usdcMint } = await ensureConfig());
  const config = await program.account.config.fetch(configPda());
  assert.equal(config.escrowTtlSecs.toNumber(), TEST_ESCROW_TTL_SECS, "test validator must use the short TTL");
});

// ---------- pay (exactly once) ----------

test("pay: moves USDC, creates the recipient's account, writes a Receipt", async () => {
  const sender = await user(20);
  const recipient = web3.Keypair.generate().publicKey; // no token account yet
  const intentId = intent();
  await pay(sender, recipient, 5 * USDC, intentId);
  assert.equal(await balance(sender.publicKey), 15 * USDC);
  assert.equal(await balance(recipient), 5 * USDC);
  const r = await program.account.receipt.fetch(receiptPda(sender.publicKey, intentId));
  assert.ok(r.sender.equals(sender.publicKey));
  assert.ok(r.recipient.equals(recipient));
  assert.equal(r.amount.toNumber(), 5 * USDC);
});

test("pay: the same intent twice fails and debits once", async () => {
  const sender = await user(20);
  const recipient = (await user()).publicKey;
  const intentId = intent();
  await pay(sender, recipient, 3 * USDC, intentId);
  await expectFail(pay(sender, recipient, 3 * USDC, intentId), ALREADY_IN_USE);
  assert.equal(await balance(sender.publicKey), 17 * USDC);
  assert.equal(await balance(recipient), 3 * USDC);
});

test("pay: zero amount, wrong authority and wrong mint are rejected", async () => {
  const sender = await user(5);
  const recipient = (await user()).publicKey;
  await expectFail(pay(sender, recipient, 0), "InvalidAmount");

  const impostor = web3.Keypair.generate();
  await provider.connection.confirmTransaction(await provider.connection.requestAirdrop(impostor.publicKey, web3.LAMPORTS_PER_SOL), "confirmed");
  await expectFail(pay(sender, recipient, 1, intent(), { authority: impostor }), "Unauthorized");

  const fake = await createMint(provider.connection, authority, authority.publicKey, null, 6);
  await getOrCreateAssociatedTokenAccount(provider.connection, authority, fake, sender.publicKey);
  await expectFail(pay(sender, recipient, 1, intent(), { mint: fake }), "WrongMint");
  assert.equal(await balance(sender.publicKey), 5 * USDC);
});

// ---------- escrow ----------

test("escrow: send then claim moves the money and closes escrow + vault (rent back to the authority)", async () => {
  const sender = await user(30);
  const claimer = web3.Keypair.generate();
  const { escrow, tx, intentId } = sendToEscrow(sender, alias(), 10 * USDC);
  await tx;
  assert.equal(await balance(sender.publicKey), 20 * USDC);
  assert.equal(await balance(escrow), 10 * USDC);
  const e = await program.account.escrow.fetch(escrow);
  assert.equal(e.expiresAt.toNumber() - e.createdAt.toNumber(), TEST_ESCROW_TTL_SECS);
  assert.ok(await exists(receiptPda(sender.publicKey, intentId)), "escrow sends write a receipt too");

  const before = await provider.connection.getBalance(authority.publicKey);
  await claim(escrow, claimer);
  assert.equal(await balance(claimer.publicKey), 10 * USDC);
  assert.equal(await exists(escrow), false);
  assert.equal(await exists(ata(escrow)), false);
  assert.ok((await provider.connection.getBalance(authority.publicKey)) > before - 2_100_000, "rent returned (minus the claimer ATA)");
});

test("escrow: a claim without the authority's co-signature fails", async () => {
  const sender = await user(5);
  const { escrow, tx } = sendToEscrow(sender, alias(), 1 * USDC);
  await tx;
  const impostor = web3.Keypair.generate();
  await provider.connection.confirmTransaction(await provider.connection.requestAirdrop(impostor.publicKey, web3.LAMPORTS_PER_SOL), "confirmed");
  await expectFail(claim(escrow, web3.Keypair.generate(), impostor), "Unauthorized");
});

test("escrow: the same intent twice fails and debits once", async () => {
  const sender = await user(10);
  const a = alias();
  const intentId = intent();
  await sendToEscrow(sender, a, 2 * USDC, intentId).tx;
  await expectFail(sendToEscrow(sender, a, 2 * USDC, intentId).tx, ALREADY_IN_USE);
  assert.equal(await balance(sender.publicKey), 8 * USDC);
});

test("escrow: two escrows to the same alias with different intents don't collide", async () => {
  const sender = await user(10);
  const a = alias();
  const one = sendToEscrow(sender, a, 1 * USDC);
  const two = sendToEscrow(sender, a, 2 * USDC);
  await Promise.all([one.tx, two.tx]);
  assert.notEqual(one.escrow.toBase58(), two.escrow.toBase58());
  assert.equal(await balance(one.escrow), 1 * USDC);
  assert.equal(await balance(two.escrow), 2 * USDC);
});

test("escrow: claim twice fails; claim then refund fails", async () => {
  const sender = await user(5);
  const { escrow, tx } = sendToEscrow(sender, alias(), 1 * USDC);
  await tx;
  const claimer = web3.Keypair.generate();
  await claim(escrow, claimer);
  await expectFail(claim(escrow, claimer), "AccountNotInitialized");
  await expectFail(refund(escrow, sender), "AccountNotInitialized");
  assert.equal(await balance(claimer.publicKey), 1 * USDC);
});

test("escrow: expiry rules — no early refund, no late claim, refund works, only the sender, then no claim", async () => {
  const sender = await user(10);
  const stranger = web3.Keypair.generate();
  const a = sendToEscrow(sender, alias(), 2 * USDC); // refund path
  const b = sendToEscrow(sender, alias(), 3 * USDC); // late-claim path
  const c = sendToEscrow(sender, alias(), 1 * USDC); // race at expiry
  await Promise.all([a.tx, b.tx, c.tx]);

  await expectFail(refund(a.escrow, sender), "EscrowNotExpired");
  const expiresAt = Math.max(...(await Promise.all([a, b, c].map(async (x) => (await program.account.escrow.fetch(x.escrow)).expiresAt.toNumber()))));

  // c: submit a claim and a refund together around expiry → exactly one wins.
  const claimer = web3.Keypair.generate();
  const cExp = (await program.account.escrow.fetch(c.escrow)).expiresAt.toNumber();
  for (;;) {
    const t = await provider.connection.getBlockTime(await provider.connection.getSlot("confirmed"));
    if (t !== null && t >= cExp - 1) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const race = await Promise.allSettled([claim(c.escrow, claimer), refund(c.escrow, sender)]);
  assert.equal(race.filter((r) => r.status === "fulfilled").length, 1, "exactly one of claim/refund lands");

  await waitForExpiry(expiresAt);
  await expectFail(claim(b.escrow, web3.Keypair.generate()), "EscrowExpired");
  await expectFail(refund(a.escrow, stranger), "NotSender");
  const beforeRefund = await balance(sender.publicKey);
  await refund(a.escrow, sender);
  assert.equal(await balance(sender.publicKey), beforeRefund + 2 * USDC);
  await expectFail(claim(a.escrow, web3.Keypair.generate()), "AccountNotInitialized"); // refund then claim
  assert.equal(await exists(a.escrow), false);
});
