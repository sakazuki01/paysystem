import { useState } from "react";
import { Check } from "lucide-react";
import type { RecipientInfo } from "../api/PayApi";
import { Screen } from "../components/Screen";
import { Avatar, Banner, Card, Fingerprint } from "../components/primitives";
import { rawToCents } from "../lib/amount";
import { selectSafetyBanners } from "../lib/banners";
import { errorCopy } from "../lib/errors";
import { amountAria, formatUsd, sinceCaption } from "../lib/format";
import { useApp } from "../state/app";
import { useNav } from "../state/nav";
import { haptic, useMainButton } from "../telegram/telegram";

/** S6 — Confirm: the safety screen. */
export function Confirm({ recipient }: { recipient: RecipientInfo }) {
  const { api, me, draft, setDraft, invalidate } = useApp();
  const nav = useNav();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cents = rawToCents(draft.raw);
  const banners = selectSafetyBanners(recipient);

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await api.send({ to: recipient.handle, amountCents: cents, note: draft.note || undefined });
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
    } catch (e) {
      haptic.error();
      setError(errorCopy(e, { username: me.username }));
      setSending(false);
    }
  }

  useMainButton({
    text: sending ? "Sending…" : error ? "Try again" : `Send ${formatUsd(cents)}`,
    progress: sending,
    disabled: cents <= 0,
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

      {/* Max 2 banners, always: a failure replaces the safety banners until Try again. */}
      {error ? (
        <Banner variant="danger">{error}</Banner>
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
        {sending ? "Sending…" : ""}
      </p>
    </Screen>
  );
}
