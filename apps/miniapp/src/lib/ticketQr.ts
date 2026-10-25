/** A ticket QR is valid this long; the holder's screen refreshes it every 30 s (LOGIC §10.4). */
export const QR_TTL_MS = 30_000;

/** The exact bytes the holder's wallet signs. The real scanner verifies an ed25519 signature over it. */
export const ticketQrMessage = (ticketId: string, ts: number) => `paysystem-ticket:${ticketId}:${ts}`;
