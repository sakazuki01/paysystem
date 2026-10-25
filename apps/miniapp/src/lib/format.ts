const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const formatUsd = (cents: number) => usd.format(cents / 100);

/** "+$10.00" for money in, "−$5.00" (U+2212) for money out. */
export const signedUsd = (cents: number, direction: "in" | "out") =>
  `${direction === "in" ? "+" : "−"}${formatUsd(cents)}`;

/** Screen-reader text: "10 dollars", "10 dollars and 50 cents". */
export function amountAria(cents: number): string {
  const d = Math.floor(cents / 100);
  const c = cents % 100;
  const dollars = `${d.toLocaleString("en-US")} ${d === 1 ? "dollar" : "dollars"}`;
  return c ? `${dollars} and ${c} ${c === 1 ? "cent" : "cents"}` : dollars;
}

/** Wallet address fingerprint: 7xKX…9fQz. */
export const fingerprint = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

export const settledCaption = (settleMs: number) => `Settled in ${(settleMs / 1000).toFixed(1)} s · Free`;

const monthYear = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
export const sinceCaption = (createdAt: number) => `On Pay System since ${monthYear.format(createdAt)}`;

export function expiresInCaption(expiresAt: number, now: number = Date.now()): string {
  const days = Math.max(1, Math.ceil((expiresAt - now) / 86_400_000));
  return `Expires in ${days} ${days === 1 ? "day" : "days"}`;
}

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const fullFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

/** Activity row timestamp: time today, "Yesterday", else "Oct 20". */
export function shortTime(ts: number, now: number = Date.now()): string {
  const d = new Date(ts);
  const n = new Date(now);
  if (d.toDateString() === n.toDateString()) return timeFmt.format(d);
  const y = new Date(now - 86_400_000);
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return dateFmt.format(d);
}

export const fullTime = (ts: number) => fullFmt.format(ts);

export const explorerTxUrl = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
