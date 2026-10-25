import { useCallback, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Screen } from "../components/Screen";
import { AmountDisplay, Keypad } from "../components/amount";
import { Banner, Skeleton } from "../components/primitives";
import { applyKey, rawToCents, type KeypadKey } from "../lib/amount";
import { formatUsd } from "../lib/format";
import { capFor, ticketNo } from "../lib/ticketsUi";
import { useSingleFlight } from "../lib/useSingleFlight";
import { useApp, useAsync } from "../state/app";
import { useNav } from "../state/nav";
import { haptic, useMainButton } from "../telegram/telegram";
import { ticketErrorCopy } from "./EventDetail";

/** S15 — Resell: keypad price entry, capped at face × max_resale_bps. */
export function Resell({ ticketId }: { ticketId: string }) {
  const { api, invalidate } = useApp();
  const nav = useNav();
  const ticket = useAsync(() => api.getTicket(ticketId), [ticketId]);
  const [raw, setRaw] = useState("");
  const rawRef = useRef(raw);
  rawRef.current = raw;
  const [shake, setShake] = useState(0);
  const [phase, setPhase] = useState<{ kind: "idle" } | { kind: "listing" } | { kind: "failed"; message: string }>({ kind: "idle" });

  const t = ticket.data;
  const cap = t ? capFor(t) : 0;
  const cents = rawToCents(raw);
  const over = cents > cap;

  const onKey = useCallback(
    (key: KeypadKey) => {
      const next = applyKey(rawRef.current, key);
      const crossesCap = !next.rejected && key !== "back" && rawToCents(next.raw) > cap;
      if (next.rejected || crossesCap) {
        haptic.error();
        setShake((s) => s + 1);
      }
      if (next.rejected) return;
      rawRef.current = next.raw;
      setRaw(next.raw);
    },
    [cap],
  );

  const list = useSingleFlight(async () => {
    setPhase({ kind: "listing" });
    try {
      await api.listTicket(ticketId, cents);
      haptic.success();
      invalidate();
      nav.pop(); // back to S13, which now shows "Listed $26.00"
    } catch (e) {
      haptic.error();
      setPhase({ kind: "failed", message: ticketErrorCopy(e) });
    }
  });

  useMainButton({
    text: phase.kind === "listing" ? "Listing…" : phase.kind === "failed" ? "Try again" : cents > 0 ? `List for ${formatUsd(cents)}` : "List",
    progress: phase.kind === "listing",
    disabled: !t || cents <= 0 || over || phase.kind === "listing",
    onClick: list,
  });

  return (
    <Screen label="Resell ticket" className="amount">
      <div className="recipient-pill" role="note">
        <span>{t ? `${t.eventName} · ${ticketNo(t.ticketNo)}` : "…"}</span>
      </div>
      <AmountDisplay raw={raw} shakeSignal={shake} />
      <p className={`balance-caption ${over ? "is-danger" : ""}`} aria-live="polite">
        {!t ? (
          <Skeleton width={90} height={14} />
        ) : over ? (
          <>
            <AlertCircle size={16} strokeWidth={2} aria-hidden="true" /> Max resale price is {formatUsd(cap)}
          </>
        ) : (
          `Max ${formatUsd(cap)}`
        )}
      </p>
      {phase.kind === "failed" && <Banner variant="danger">{phase.message}</Banner>}
      <Keypad onKey={onKey} />
    </Screen>
  );
}
