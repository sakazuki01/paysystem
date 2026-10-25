import { useCallback, useRef, useState } from "react";
import { AlertCircle, Check, Info } from "lucide-react";
import { canBuy } from "@pay-system/shared";
import { PayApiError, type Listing } from "../api/PayApi";
import { Screen } from "../components/Screen";
import { Banner, Skeleton, Spinner } from "../components/primitives";
import { DateBadge, Sheet } from "../components/tickets";
import { errorCopy, NETWORK_ERROR, NOT_LANDED } from "../lib/errors";
import { formatUsd } from "../lib/format";
import { payExactlyOnce } from "../lib/payExactlyOnce";
import { capCaption, eventDate, eventTime } from "../lib/ticketsUi";
import { newIntentId, useSingleFlight } from "../lib/useSingleFlight";
import { useApp, useAsync } from "../state/app";
import { useNav } from "../state/nav";
import { haptic, useMainButton } from "../telegram/telegram";

const LISTING_CHANGED = "This listing just changed. Check the new price and try again.";

type Purchase = { kind: "primary" } | { kind: "resale"; listing: Listing };
type Phase = { kind: "idle" } | { kind: "buying" } | { kind: "checking" } | { kind: "failed"; message: string };

/** S12 — Event detail: buy, resale, and (for the organizer) Scan tickets. */
export function EventDetail({ id }: { id: string }) {
  const { api, invalidate } = useApp();
  const nav = useNav();
  const event = useAsync(() => api.getEvent(id), [id]);
  const balance = useAsync(() => api.getBalance());
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [capInfo, setCapInfo] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const intentId = useRef<string | null>(null);

  const e = event.data;
  const price = purchase?.kind === "resale" ? purchase.listing.priceCents : (e?.priceCents ?? 0);
  const soldOut = !!e && canBuy(e, Date.now()) === "SoldOut";
  const short = balance.data !== undefined && price > balance.data;

  const open = (p: Purchase) => {
    haptic.tap();
    intentId.current = newIntentId(); // one intent per confirm sheet, kept across Try again
    setNotice(null);
    setPhase({ kind: "idle" });
    setPurchase(p);
  };
  const close = useCallback(() => {
    if (phase.kind === "buying" || phase.kind === "checking") return;
    intentId.current = null;
    setPurchase(null);
  }, [phase.kind]);

  const confirm = useSingleFlight(async () => {
    if (!e || !purchase || !intentId.current) return;
    const intent = intentId.current;
    setPhase({ kind: "buying" });
    const outcome = await payExactlyOnce({
      attempt: () =>
        purchase.kind === "primary"
          ? api.buyTicket(e.id, intent)
          : api.buyListed(purchase.listing.ticketId, intent, purchase.listing.seller, purchase.listing.priceCents),
      status: () => api.getPaymentStatus(intent),
      onChecking: () => setPhase({ kind: "checking" }),
    });
    if (outcome.kind === "done" || outcome.kind === "landed") {
      const ticket = outcome.kind === "done" ? outcome.value.ticket : await api.getTicket(outcome.receipt.activityId);
      const settleMs = outcome.kind === "done" ? outcome.value.settleMs : outcome.receipt.settleMs;
      const signature = outcome.kind === "done" ? outcome.value.signature : outcome.receipt.signature;
      invalidate();
      nav.reset([
        { name: "home" },
        {
          name: "success",
          info: { kind: "ticket", amountCents: price, counterparty: e.name, settleMs, signature, ticketNo: ticket?.ticketNo },
        },
      ]);
      return;
    }
    haptic.error();
    if (outcome.kind === "notLanded") return setPhase({ kind: "failed", message: NOT_LANDED });
    const err = outcome.error;
    if (err instanceof PayApiError && (err.code === "listing_changed" || err.code === "not_listed")) {
      // Nothing was charged. Show the fresh listings so the buyer sees the new price.
      intentId.current = null;
      setPurchase(null);
      setPhase({ kind: "idle" });
      setNotice(LISTING_CHANGED);
      event.reload();
      return;
    }
    setPhase({ kind: "failed", message: ticketErrorCopy(err) });
  });

  const busy = phase.kind === "buying" || phase.kind === "checking";
  useMainButton(
    purchase
      ? {
          text: phase.kind === "buying" ? "Buying…" : phase.kind === "checking" ? "Checking…" : phase.kind === "failed" ? "Try again" : `Buy ticket · ${formatUsd(price)}`,
          progress: busy,
          disabled: busy || short,
          onClick: confirm,
        }
      : e?.isOrganizer
        ? { text: "Scan tickets", onClick: () => nav.push({ name: "checkin", eventId: e.id }) }
        : {
            text: `Buy ticket · ${formatUsd(e?.priceCents ?? 0)}`,
            visible: !!e && !soldOut,
            disabled: !e || short || balance.data === undefined,
            onClick: () => open({ kind: "primary" }),
          },
  );

  if (!e) {
    return (
      <Screen label="Event" className="event">
        {event.loading ? (
          <div className="event-hero" aria-busy="true">
            <Skeleton width={56} height={56} radius={12} />
            <Skeleton width="70%" height={28} />
          </div>
        ) : (
          <Banner variant="danger" action={{ label: "Try again", onClick: event.reload }}>
            {NETWORK_ERROR}
          </Banner>
        )}
      </Screen>
    );
  }

  const listings = e.listings.slice(0, 3);
  return (
    <Screen label={e.name} className="event">
      <div className="event-hero">
        <DateBadge ts={e.startsAt} />
        <h1 className="title">{e.name}</h1>
        <p className="body caption--muted">
          {e.venue} · {eventDate(e.startsAt)}, {eventTime(e.startsAt)}
        </p>
      </div>

      <div className="detail-list">
        <div className="detail-row">
          <span className="detail-row__label">Price</span>
          <span className="tabular">{formatUsd(e.priceCents)}</span>
        </div>
        <div className="detail-row">
          <span>{capCaption(e)}</span>
          <button type="button" className="icon-button" aria-label="About the resale cap" onClick={() => setCapInfo(true)}>
            <Info size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>

      {notice && <Banner variant="danger">{notice}</Banner>}
      {soldOut && !e.isOrganizer && <Banner variant="warning">Sold out — check resale below</Banner>}
      {short && !soldOut && !e.isOrganizer && (
        <p className="helper helper--danger">
          <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
          Not enough balance
        </p>
      )}

      {listings.length > 0 && (
        <section className="section" aria-labelledby="resale-title">
          <h2 id="resale-title" className="section__title">
            Resale from {formatUsd(listings[0]!.priceCents)}
          </h2>
          <div className="list">
            {listings.map((l) => (
              <div className="row row--static" key={l.ticketId}>
                <span className="row__main">
                  <span className="row__title">@{l.seller}</span>
                  <span className="row__caption">Ticket #{String(l.ticketNo).padStart(3, "0")}</span>
                </span>
                <span className="headline tabular">{formatUsd(l.priceCents)}</span>
                <button
                  type="button"
                  className="btn btn--soft btn--small"
                  aria-label={`Buy from @${l.seller} for ${formatUsd(l.priceCents)}`}
                  onClick={() => open({ kind: "resale", listing: l })}
                >
                  Buy
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {purchase && (
        <Sheet title="Confirm purchase" onClose={close}>
          <div className="detail-list detail-list--flat">
            <div className="detail-row">
              <span className="detail-row__label">Event</span>
              <span>{e.name}</span>
            </div>
            {purchase.kind === "resale" && (
              <div className="detail-row">
                <span className="detail-row__label">Seller</span>
                <span>@{purchase.listing.seller}</span>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-row__label">Price</span>
              <span className="tabular">{formatUsd(price)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-row__label">Network fee</span>
              <span className="fee-row__value">
                <Check size={16} strokeWidth={2} aria-hidden="true" />
                Free
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-row__label">Balance after</span>
              <span className="tabular">{balance.data === undefined ? "…" : formatUsd(balance.data - price)}</span>
            </div>
          </div>
          {phase.kind === "checking" && (
            <Banner variant="info" icon={<Spinner size={18} />}>
              Checking your payment…
            </Banner>
          )}
          {phase.kind === "failed" && <Banner variant="danger">{phase.message}</Banner>}
          {short && (
            <p className="helper helper--danger">
              <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
              Not enough balance
            </p>
          )}
        </Sheet>
      )}

      {capInfo && (
        <Sheet title="Resale cap" onClose={() => setCapInfo(false)}>
          <p className="body">
            To stop scalping, tickets can only be resold for up to {e.maxResaleBps / 100}% of face value.
          </p>
        </Sheet>
      )}
    </Screen>
  );
}

export function ticketErrorCopy(e: unknown): string {
  if (e instanceof PayApiError) {
    switch (e.code) {
      case "sold_out":
        return "Sold out — check resale below";
      case "transfer_locked":
        return "Transfers lock 24 h before the show";
      case "already_gifted":
        return "Already gifted once";
      case "listing_changed":
      case "not_listed":
        return LISTING_CHANGED;
    }
  }
  return errorCopy(e);
}
