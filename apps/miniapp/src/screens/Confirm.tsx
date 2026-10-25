import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { PayApiError, type RecipientInfo, type SendResult } from "../api/PayApi";
import { Screen } from "../components/Screen";
import { Avatar, Banner, Card, Fingerprint, Spinner } from "../components/primitives";
import { rawToCents } from "../lib/amount";
import { selectSafetyBanners } from "../lib/banners";
import { errorCopy, NOT_LANDED } from "../lib/errors";
import { amountAria, formatUsd, sinceCaption } from "../lib/format";
import { waitForPayment } from "../lib/paymentStatus";
import { newIntentId, useSingleFlight } from "../lib/useSingleFlight";
import { useApp } from "../state/app";
import { useNav } from "../state/nav";
import { haptic, useMainButton } from "../telegram/telegram";

type Phase =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "checking" } // timed out: we don't know yet whether it landed
  | { kind: "failed"; message: string };

/** S6 — Confirm: the safety screen. Every send is exactly-once (LOGIC §7.5). */
export function Confirm({ recipient }: { recipient: RecipientInfo }) {
  const { api, me, draft, setDraft, invalidate } = useApp();
  const nav = useNav();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // One intent per visit to S6: kept across Try again, dropped when the screen unmounts.
  const intentId = useRef(newIntentId());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const cents = rawToCents(draft.raw);
  const banners = selectSafetyBanners(recipient);

  function succeed(res: SendResult) {
    setDraft({ raw: "", note: "" });
    invalidate();
    nav.reset([
      { name: "home" },
      {
        name: "success",
        info: {
          kind: "sent",
          amountCents: cents,
          counterparty: recipient.handle,
          settleMs: res.settleMs,
          signature: res.signature,
          escrow: !!res.escrowId,
        },
      },
    ]);
  }

  function fail(message: string) {
    haptic.error();
    setPhase({ kind: "failed", message });
  }

  const send = useSingleFlight(async () => {
    setPhase({ kind: "sending" });
    try {
      const res = await api.send({
        to: recipient.handle,
        amountCents: cents,
        note: draft.note || undefined,
        intentId: intentId.current,
      });
      if (mounted.current) succeed(res);
    } catch (e) {
      if (!mounted.current) return;
      if (!(e instanceof PayApiError && e.code === "network")) {
        fail(errorCopy(e, { username: me.username }));
        return;
      }
      // A timeout is not a failure: the payment may have landed. Never re-send blindly.
      setPhase({ kind: "checking" });
      const status = await waitForPayment(() => api.getPaymentStatus(intentId.current));
      if (!mounted.current) return;
      if (status.status === "landed") succeed(status.receipt);
      else fail(NOT_LANDED);
    }
  });

  const busy = phase.kind === "sending" || phase.kind === "checking";
  useMainButton({
    text:
      phase.kind === "sending"
        ? "Sending…"
        : phase.kind === "checking"
          ? "Checking…"
          : phase.kind === "failed"
            ? "Try again"
            : `Send ${formatUsd(cents)}`,
    progress: busy,
    disabled: cents <= 0 || busy,
    onClick: send,
  });

  return (
    <Screen label="Confirm payment" className="confirm">
      <Card className="confirm__card">
        <Avatar
          name={recipient.displayName ?? recipient.handle}
          src={recipient.avatarUrl}
          size={64}
          link={!recipient.exists}
        />
        <span className="headline">@{recipient.handle}</span>
        {recipient.displayName && <span className="body">{recipient.displayName}</span>}
        {recipient.createdAt !== undefined && (
          <span className="caption caption--muted">{sinceCaption(recipient.createdAt)}</span>
        )}
        {recipient.address && <Fingerprint address={recipient.address} />}
      </Card>

      <div className="confirm__amount">
        <span className="amount-xl tabular" aria-label={amountAria(cents)}>
          {formatUsd(cents)}
        </span>
        {draft.note && <span className="body caption--muted">{draft.note}</span>}
      </div>

      {/* Max 2 banners, always: a failure or the status check replaces the safety banners. */}
      {phase.kind === "failed" ? (
        <Banner variant="danger">{phase.message}</Banner>
      ) : phase.kind === "checking" ? (
        <Banner variant="info" icon={<Spinner size={18} />}>
          Checking your payment…
        </Banner>
      ) : (
        banners.map((b) => (
          <Banner key={b.id} variant={b.variant}>
            {b.text}
          </Banner>
        ))
      )}

      <div className="fee-row">
        <span>Network fee</span>
        <span className="fee-row__value">
          <Check size={16} strokeWidth={2} aria-hidden="true" />
          Free
        </span>
      </div>

      <p className="visually-hidden" aria-live="polite">
        {phase.kind === "sending" ? "Sending…" : ""}
      </p>
    </Screen>
  );
}
