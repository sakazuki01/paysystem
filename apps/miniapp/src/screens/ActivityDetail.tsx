import { useState } from "react";
import { useSingleFlight } from "../lib/useSingleFlight";
import { Check, ExternalLink } from "lucide-react";
import { Screen } from "../components/Screen";
import { Avatar, Banner, Skeleton, StatusPill } from "../components/primitives";
import { errorCopy, LOAD_ERROR } from "../lib/errors";
import { amountAria, expiresInCaption, explorerTxUrl, fullTime, signedUsd } from "../lib/format";
import { useApp, useAsync } from "../state/app";
import { useNav } from "../state/nav";
import { haptic, tg, useMainButton } from "../telegram/telegram";

/** S10 — Activity detail. Pending escrows get a Refund MainButton that unlocks at expiry. */
export function ActivityDetail({ id }: { id: string }) {
  const { api, invalidate } = useApp();
  const nav = useNav();
  const item = useAsync(() => api.getActivityItem(id), [id]);
  const [refunding, setRefunding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = item.data;
  const isEscrow = !!a?.escrowId && (a.status === "pending" || a.status === "refundable");

  const refund = useSingleFlight(async () => {
    if (!a?.escrowId) return;
    setRefunding(true);
    setError(null);
    try {
      const res = await api.refundEscrow(a.escrowId);
      invalidate();
      nav.reset([
        { name: "home" },
        {
          name: "success",
          info: { kind: "refunded", amountCents: a.amountCents, counterparty: a.counterparty, settleMs: res.settleMs, signature: res.signature },
        },
      ]);
    } catch (e) {
      haptic.error();
      setRefunding(false);
      setError(errorCopy(e));
    }
  });

  useMainButton({
    text: refunding ? "Refunding…" : error ? "Try again" : "Refund",
    progress: refunding,
    visible: isEscrow,
    disabled: a?.status !== "refundable",
    onClick: refund,
  });

  if (!a) {
    return (
      <Screen label="Payment details" className="detail">
        {item.loading ? (
          <div className="detail__hero" aria-busy="true">
            <Skeleton width={180} height={56} />
            <Skeleton width={80} height={20} />
          </div>
        ) : (
          <Banner variant="danger" action={{ label: "Try again", onClick: item.reload }}>
            {LOAD_ERROR}
          </Banner>
        )}
      </Screen>
    );
  }

  const out = a.direction === "out";
  return (
    <Screen label="Payment details" className="detail">
      <div className="detail__hero">
        <span className={`amount-xl ${out ? "" : "amount-signed--in"}`} aria-label={`${out ? "Sent" : "Received"} ${amountAria(a.amountCents)}`}>
          {signedUsd(a.amountCents, a.direction)}
        </span>
        {a.status === "pending" && a.expiresAt && (
          <span className="caption caption--muted">{expiresInCaption(a.expiresAt)}</span>
        )}
      </div>

      <div className="row row--static">
        <Avatar
          name={a.counterpartyName ?? a.counterparty}
          link={!!a.escrowId && out && a.status !== "sent"}
          wallet={!!a.toAddress}
        />
        <span className="row__main">
          <span className={`row__title ${a.toAddress ? "mono" : ""}`}>{a.toAddress ? a.counterparty : `@${a.counterparty}`}</span>
          {a.counterpartyName && <span className="row__caption">{a.counterpartyName}</span>}
          {a.toAddress && <span className="row__caption">Wallet address</span>}
        </span>
      </div>

      {error && <Banner variant="danger">{error}</Banner>}

      <div className="detail-list">
        <div className="detail-row">
          <span className="detail-row__label">Status</span>
          <StatusPill status={a.status} />
        </div>
        <div className="detail-row">
          <span className="detail-row__label">Date</span>
          <span>{fullTime(a.createdAt)}</span>
        </div>
        {a.note && (
          <div className="detail-row">
            <span className="detail-row__label">Note</span>
            <span>{a.note}</span>
          </div>
        )}
        <div className="detail-row">
          <span className="detail-row__label">Fee</span>
          <span className="fee-row__value">
            <Check size={16} strokeWidth={2} aria-hidden="true" />
            Free
          </span>
        </div>
        {a.signature && (
          <div className="detail-row">
            <span className="detail-row__label">Transaction</span>
            <button type="button" className="link-button detail__explorer" onClick={() => tg().openLink(explorerTxUrl(a.signature!))}>
              View on explorer
              <ExternalLink size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </Screen>
  );
}
