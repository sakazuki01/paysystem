import { useState } from "react";
import { Clock, UserX } from "lucide-react";
import { PayApiError } from "../api/PayApi";
import { Screen } from "../components/Screen";
import { Avatar, Banner, Card, Skeleton } from "../components/primitives";
import { errorCopy, NETWORK_ERROR } from "../lib/errors";
import { amountAria, formatUsd } from "../lib/format";
import { useApp, useAsync } from "../state/app";
import { useNav } from "../state/nav";
import { haptic, useMainButton } from "../telegram/telegram";

/** S7 — Claim (incoming escrow), opened via startapp=claim_<id> or the Home banner. */
export function Claim({ id }: { id: string }) {
  const { api, me, invalidate } = useApp();
  const nav = useNav();
  const escrow = useAsync(() => api.getEscrow(id), [id]);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const e = escrow.data;
  const signedInAs = me.username ?? me.telegramHandle;
  const variant = !e
    ? "none"
    : e.status === "refunded" || (e.status === "pending" && Date.now() >= e.expiresAt)
      ? "expired"
      : e.status !== "pending"
        ? "none"
        : e.recipientHandle !== me.telegramHandle
          ? "wrong-user"
          : "claimable";

  async function claim() {
    if (!e) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await api.claimEscrow(e.id);
      invalidate();
      nav.reset([
        { name: "home" },
        {
          name: "success",
          info: {
            kind: "received",
            amountCents: e.amountCents,
            counterparty: e.sender,
            settleMs: res.settleMs,
            signature: res.signature,
            next: me.username ? "home" : "username",
          },
        },
      ]);
    } catch (err) {
      haptic.error();
      setClaiming(false);
      if (err instanceof PayApiError && err.code.startsWith("escrow_")) escrow.reload();
      else setError(errorCopy(err));
    }
  }

  useMainButton({
    text: claiming ? "Claiming…" : error ? "Try again" : e ? `Claim ${formatUsd(e.amountCents)}` : "Claim",
    progress: claiming,
    visible: variant === "claimable",
    onClick: claim,
  });

  if (e === undefined) {
    return (
      <Screen label="Claim payment" className="claim">
        {escrow.loading ? (
          <div className="claim__hero" aria-busy="true">
            <Skeleton width={64} height={64} radius={999} />
            <Skeleton width={140} height={22} />
            <Skeleton width={180} height={56} />
          </div>
        ) : (
          <Banner variant="danger" action={{ label: "Try again", onClick: escrow.reload }}>
            {NETWORK_ERROR}
          </Banner>
        )}
      </Screen>
    );
  }

  return (
    <Screen label="Claim payment" className="claim">
      {variant === "claimable" && e && (
        <>
          <div className="claim__hero">
            <Avatar name={e.senderName ?? e.sender} size={64} />
            <span className="headline">@{e.sender} sent you</span>
            <span className="amount-xl" aria-label={amountAria(e.amountCents)}>
              {formatUsd(e.amountCents)}
            </span>
            {e.note && <span className="body caption--muted">{e.note}</span>}
          </div>
          {!me.username && <p className="caption caption--muted claim__setup">We'll set up your wallet — takes a second.</p>}
          {error && <Banner variant="danger">{error}</Banner>}
        </>
      )}

      {variant === "expired" && e && (
        <Card className="claim__muted">
          <Clock size={24} strokeWidth={2} aria-hidden="true" />
          <p className="body">This payment expired and was returned to @{e.sender}.</p>
        </Card>
      )}

      {variant === "wrong-user" && e && (
        <Card className="claim__muted">
          <UserX size={24} strokeWidth={2} aria-hidden="true" />
          <p className="body">
            This payment was sent to @{e.recipientHandle}. You're signed in as @{signedInAs}.
          </p>
        </Card>
      )}

      {variant === "none" && (
        // COPY-TBD: unknown / already-claimed link isn't in spec §6.2; asked the design lead.
        <Card className="claim__muted">
          <Clock size={24} strokeWidth={2} aria-hidden="true" />
          <p className="body">This payment link isn't valid anymore.</p>
        </Card>
      )}
    </Screen>
  );
}
