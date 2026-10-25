import { useEffect, useState } from "react";
import { Copy, Gift, Tag } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { TicketQr } from "../api/PayApi";
import { Screen } from "../components/Screen";
import { Banner, Skeleton } from "../components/primitives";
import { CountdownRing } from "../components/tickets";
import { NETWORK_ERROR } from "../lib/errors";
import { QR_TTL_MS } from "../lib/ticketQr";
import { checkedInLabel, eventDate, eventTime, giftBlocker, resellBlocker, ticketNo, ticketPill } from "../lib/ticketsUi";
import { useSingleFlight } from "../lib/useSingleFlight";
import { useApp, useAsync } from "../state/app";
import { useNav } from "../state/nav";
import { useToast } from "../state/toast";
import { haptic, tg } from "../telegram/telegram";

const TTL_S = QR_TTL_MS / 1000;

/** A fresh signed QR every 30 s, so screenshots go stale (LOGIC §10.4). */
function useRotatingQr(ticketId: string, active: boolean) {
  const { api } = useApp();
  const [qr, setQr] = useState<TicketQr | null>(null);
  const [now, setNow] = useState(Date.now());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const next = await api.getTicketQr(ticketId);
        if (!live) return;
        setQr(next);
        setFailed(false);
        timer = setTimeout(refresh, Math.max(1000, next.expiresAt - Date.now()));
      } catch {
        if (!live) return;
        setFailed(true);
        timer = setTimeout(refresh, 3000);
      }
    };
    void refresh();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      live = false;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [api, ticketId, active]);

  const secondsLeft = qr ? Math.max(0, Math.min(TTL_S, Math.ceil((qr.expiresAt - now) / 1000))) : TTL_S;
  return { qr, secondsLeft, failed };
}

/** S13 — My ticket. No MainButton: the QR is the point. */
export function MyTicket({ id }: { id: string }) {
  const { api, me, invalidate } = useApp();
  const nav = useNav();
  const toast = useToast();
  const ticket = useAsync(() => api.getTicket(id), [id]);
  const t = ticket.data;
  const { qr, secondsLeft, failed } = useRotatingQr(id, !!t && !t.checkedIn);
  const devShim = tg().platform === "dev-shim";

  const cancelListing = useSingleFlight(async () => {
    try {
      await api.cancelListing(id);
      haptic.success();
      invalidate();
    } catch {
      haptic.error();
      toast(NETWORK_ERROR);
    }
  });

  if (!t) {
    return (
      <Screen label="My ticket" className="my-ticket">
        {ticket.loading ? (
          <Skeleton width="100%" height={420} radius={16} />
        ) : (
          <Banner variant="danger" action={{ label: "Try again", onClick: ticket.reload }}>
            {NETWORK_ERROR}
          </Banner>
        )}
      </Screen>
    );
  }

  const gift = giftBlocker(t);
  const resell = resellBlocker(t);
  const pill = ticketPill(t);
  const holder = me.username ?? me.telegramHandle;

  return (
    <Screen label="My ticket" className="my-ticket">
      <article className="ticket-card" aria-label={`Ticket ${ticketNo(t.ticketNo)} for ${t.eventName}`}>
        <div className="ticket-card__top">
          <span className={`pill pill--${pill.tone}`}>{pill.label}</span>
          <h1 className="title">{t.eventName}</h1>
          <p className="body caption--muted">
            {eventDate(t.startsAt)}, {eventTime(t.startsAt)} · {t.venue}
          </p>
          <p className="ticket-card__meta">
            <span className="tabular">{ticketNo(t.ticketNo)}</span>
            <span>@{holder}</span>
          </p>
        </div>
        <div className="ticket-card__tear" aria-hidden="true" />
        <div className="ticket-card__bottom">
          {t.checkedIn ? (
            <p className="ticket-card__used">{checkedInLabel(t.checkedInAt ?? t.startsAt)}</p>
          ) : (
            <>
              <div className="ticket-qr" role="img" aria-label="Ticket QR code">
                {qr ? (
                  <QRCodeSVG value={qr.payload} size={208} level="M" bgColor="#FFFFFF" fgColor="#0F1115" marginSize={0} />
                ) : (
                  <Skeleton width={208} height={208} radius={4} />
                )}
              </div>
              <p className="ticket-qr__caption">
                <CountdownRing secondsLeft={secondsLeft} total={TTL_S} />
                Refreshes every 30 s · Screenshots won't work
              </p>
              {failed && <p className="helper helper--danger">{NETWORK_ERROR}</p>}
              {devShim && qr && (
                <button
                  type="button"
                  className="link-button"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(qr.payload).catch(() => {});
                    toast("QR text copied (dev)");
                  }}
                >
                  <Copy size={16} strokeWidth={2} aria-hidden="true" />
                  Copy QR text (dev only)
                </button>
              )}
            </>
          )}
        </div>
      </article>

      {!t.checkedIn && (
        <div className="ticket-actions">
          <div className="ticket-actions__item">
            <button
              type="button"
              className="btn btn--soft"
              disabled={!!gift}
              onClick={() => nav.push({ name: "gift", ticketId: t.id })}
            >
              <Gift size={20} strokeWidth={2} aria-hidden="true" />
              Gift
            </button>
            {gift && !t.listedCents && <p className="caption caption--muted">{gift}</p>}
          </div>
          <div className="ticket-actions__item">
            <button
              type="button"
              className="btn btn--soft"
              disabled={!!resell}
              onClick={() => nav.push({ name: "resell", ticketId: t.id })}
            >
              <Tag size={20} strokeWidth={2} aria-hidden="true" />
              Resell
            </button>
            {resell && !t.listedCents && <p className="caption caption--muted">{resell}</p>}
          </div>
        </div>
      )}
      {t.listedCents > 0 && !t.checkedIn && (
        <p className="caption caption--muted ticket-actions__listed">
          {resell} —{" "}
          <button type="button" className="link-inline" onClick={cancelListing}>
            Cancel listing
          </button>
        </p>
      )}
    </Screen>
  );
}
