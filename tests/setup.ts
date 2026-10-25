// Shared test setup. Test files run as separate processes against ONE validator, so the
// one-time `initialize` happens in whichever file runs first; the others read the config.

import anchor from "@coral-xyz/anchor";
import { createMint } from "@solana/spl-token";
import type { PaySystem } from "../target/types/pay_system.ts";

const { BN, web3 } = anchor;
type Keypair = InstanceType<typeof web3.Keypair>;
type PublicKey = InstanceType<typeof web3.PublicKey>;

/** Short escrow window so expiry paths are testable on a real validator (production: 7 days). */
export const TEST_ESCROW_TTL_SECS = 6;

export const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
export const program = anchor.workspace.PaySystem as InstanceType<typeof anchor.Program<PaySystem>>;
/** The provider wallet plays the backend: config authority, fee payer and USDC mint authority. */
export const authority: Keypair = (provider.wallet as unknown as { payer: Keypair }).payer;

export const seed = (s: string) => Buffer.from(s, "utf8");
export const pda = (...seeds: Buffer[]): PublicKey => web3.PublicKey.findProgramAddressSync(seeds, program.programId)[0];
export const configPda = () => pda(seed("config"));

/** Initializes the program once per validator (mock USDC, 6 decimals) and returns the mint. */
export async function ensureConfig(): Promise<{ usdcMint: PublicKey; createdHere: boolean }> {
  const existing = await program.account.config.fetchNullable(configPda());
  if (existing) return { usdcMint: existing.usdcMint, createdHere: false };
  const usdcMint = await createMint(provider.connection, authority, authority.publicKey, null, 6);
  await program.methods
    .initialize(usdcMint, new BN(TEST_ESCROW_TTL_SECS))
    .accounts({ authority: authority.publicKey })
    .rpc();
  return { usdcMint, createdHere: true };
}

export async function expectFail(p: Promise<unknown>, match: string) {
  try {
    await p;
  } catch (e: any) {
    const code = e?.error?.errorCode?.code ?? "";
    const logs = (e?.logs ?? e?.transactionLogs ?? []).join("\n");
    const text = `${code}\n${e?.message ?? ""}\n${logs}`;
    if (!text.includes(match)) throw new Error(`expected "${match}", got:\n${text}`);
    return;
  }
  throw new Error(`expected transaction to fail with "${match}"`);
}

export const ALREADY_IN_USE = "already in use";
