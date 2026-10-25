import { useEffect, useRef, type ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";
import type { EventSummary, Ticket } from "../api/PayApi";
import { formatUsd } from "../lib/format";
import { availabilityPill, dateBadge, eventDate, eventTime, ticketNo, ticketPill } from "../lib/ticketsUi";
import { haptic } from "../telegram/telegram";

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; badge?: number }[];
  onChange(v: T): void;
  label: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={`segmented__option ${value === o.value ? "is-selected" : ""}`}
          onClick={() => {
            haptic.tap();
            onChange(o.value);
          }}
        >
          {o.label}
          {o.badge ? <span className="segmented__badge">{o.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function DateBadge({ ts }: { ts: number }) {
  const [month, day] = dateBadge(ts).split(" ");
  return (
    <span className="date-badge" aria-hidden="true">
      <span className="date-badge__month">{month}</span>
      <span className="date-badge__day">{day}</span>
    </span>
  );
}

export function EventCard({ event, onClick }: { event: EventSummary; onClick(): void }) {
  const pill = availabilityPill(event);
  const when = `${eventDate(event.startsAt)}, ${eventTime(event.startsAt)}`;
  return (
    <button
      type="button"
      className="event-card"
      aria-label={`${event.name}, ${event.venue}, ${when}, ${formatUsd(event.priceCents)}${pill ? `, ${pill}` : ""}`}
      onClick={() => {
        haptic.tap();
        onClick();
      }}
    >
      <span className="event-card__block">
        <DateBadge ts={event.startsAt} />
      </span>
      <span className="event-card__body">
        <span className="headline">{event.name}</span>
        <span className="caption caption--muted">
          {event.venue} · {eventTime(event.startsAt)}
        </span>
      </span>
      <span className="event-card__side">
        <span className="headline tabular">{formatUsd(event.priceCents).replace(/\.00$/, "")}</span>
        {pill && <span className={`pill ${pill === "Sold out" ? "pill--danger" : "pill--warning"}`}>{pill}</span>}
      </span>
    </button>
  );
}

export function TicketRow({ ticket, onClick }: { ticket: Ticket; onClick(): void }) {
  const pill = ticketPill(ticket);
  return (
    <button
      type="button"
      className="row"
      aria-label={`${ticket.eventName}, ${eventDate(ticket.startsAt)}, ${ticketNo(ticket.ticketNo)}, ${pill.label}`}
      onClick={() => {
        haptic.tap();
        onClick();
      }}
    >
      <DateBadge ts={ticket.startsAt} />
      <span className="row__main">
        <span className="row__title">{ticket.eventName}</span>
        <span className="row__caption row__caption--meta">
          {eventDate(ticket.startsAt)} · {ticketNo(ticket.ticketNo)}
          <span className={`pill pill--${pill.tone}`}>{pill.label}</span>
        </span>
      </span>
      <ChevronRight size={20} strokeWidth={2} aria-hidden="true" className="row__chevron" />
    </button>
  );
}

/** Bottom sheet (the only elevated surface, spec §3.3). Focus moves in; Escape closes. */
export function Sheet({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__head">
          <span className="headline">{title}</span>
          <button type="button" className="sheet__close" aria-label="Close" onClick={onClose}>
            <X size={20} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Seconds-left ring for the ticket QR. Under reduced motion CSS freezes it; the number still counts. */
export function CountdownRing({ secondsLeft, total }: { secondsLeft: number; total: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <span className="countdown" aria-label={`Refreshes in ${secondsLeft} seconds`} role="timer">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r={r} className="countdown__track" />
        <circle
          cx="11"
          cy="11"
          r={r}
          className="countdown__progress"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - secondsLeft / total)}
        />
      </svg>
      <span className="countdown__text tabular" aria-hidden="true">
        {secondsLeft}
      </span>
    </span>
  );
}
