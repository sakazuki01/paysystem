import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ScanLine, X } from "lucide-react";
import type { CheckInResult } from "../api/PayApi";
import { Screen } from "../components/Screen";
import { Banner } from "../components/primitives";
import { ACTION_ERROR } from "../lib/errors";
import { eventTime, ticketNo } from "../lib/ticketsUi";
import { useApp, useAsync } from "../state/app";
import { haptic, tg, useMainButton } from "../telegram/telegram";

const RESULT_MS = 2000;

/** S16 — Check-in (organizer). Scan → full-screen result for 2 s → scanner reopens. */
export function CheckIn({ eventId }: { eventId: string }) {
  const { api } = useApp();
  const event = useAsync(() => api.getEvent(eventId), [eventId]);
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const scan = useCallback(() => {
    if (busy.current) return;
    tg().showScanQrPopup({ text: "Scan a ticket" }, (data) => {
      void handle(data);
      return true; // close the scanner while we show the result
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handle(payload: string) {
    if (busy.current) return;
    busy.current = true;
    try {
      const r = await api.checkIn(eventId, payload);
      if (!alive.current) return;
      setError(false);
      setResult(r);
      if (r.result === "admit") {
        setCount(r.checkedIn);
        haptic.success();
      } else {
        haptic.error();
      }
      setTimeout(() => {
        if (!alive.current) return;
        setResult(null);
        busy.current = false;
        scan();
      }, RESULT_MS);
    } catch {
      busy.current = false;
      if (alive.current) setError(true);
    }
  }

  // S12's "Scan tickets" lands here: open the scanner right away (once, even under StrictMode).
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    scan();
  }, [scan]);

  // If the organizer closes the scanner without scanning, this reopens it.
  useMainButton({ text: "Scan tickets", visible: !result, onClick: scan });

  const e = event.data;
  const checkedIn = count ?? e?.checkedIn ?? 0;
  const counter = e ? `Checked in ${checkedIn} / ${e.supply}` : "";

  if (result) {
    const ok = result.result === "admit";
    return (
      <main className={`checkin-result ${ok ? "is-admit" : "is-reject"}`} aria-live="assertive" aria-label="Scan result">
        <p className="checkin-result__counter">{counter}</p>
        <span className="checkin-result__mark" aria-hidden="true">
          {ok ? <Check size={64} strokeWidth={3} /> : <X size={64} strokeWidth={3} />}
        </span>
        {result.result === "admit" && (
          <>
            <h1 className="checkin-result__title">Admit</h1>
            <p className="checkin-result__detail">
              @{result.holder} · {ticketNo(result.ticketNo)}
            </p>
          </>
        )}
        {result.result === "used" && (
          <>
            <h1 className="checkin-result__title">Already used</h1>
            <p className="checkin-result__detail">Checked in at {eventTime(result.checkedInAt)}</p>
          </>
        )}
        {result.result === "invalid" && (
          <>
            <h1 className="checkin-result__title">Not valid</h1>
            <p className="checkin-result__detail">{result.reason}</p>
          </>
        )}
      </main>
    );
  }

  return (
    <Screen label="Check-in" className="checkin">
      <p className="checkin__counter tabular">{counter}</p>
      <span className="checkin__icon" aria-hidden="true">
        <ScanLine size={48} strokeWidth={1.5} />
      </span>
      <h1 className="title">{e?.name ?? "Check-in"}</h1>
      {error && <Banner variant="danger">{ACTION_ERROR}</Banner>}
    </Screen>
  );
}
