import { useEffect, useState } from "react";
import { Delete } from "lucide-react";
import type { KeypadKey } from "../lib/amount";
import { rawToCents } from "../lib/amount";
import { amountAria } from "../lib/format";
import { haptic } from "../telegram/telegram";

/** Groups the integer part while keeping exactly what was typed after the dot. */
function displayRaw(raw: string): string {
  if (!raw) return "0";
  const [int = "0", dec] = raw.split(".");
  const grouped = Number(int).toLocaleString("en-US");
  return dec === undefined ? grouped : `${grouped}.${dec}`;
}

/** `$` at 60% in muted + value in --type-amount-xl. Shakes when `shakeSignal` changes. */
export function AmountDisplay({ raw, shakeSignal = 0 }: { raw: string; shakeSignal?: number }) {
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    if (!shakeSignal) return;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 240);
    return () => clearTimeout(t);
  }, [shakeSignal]);

  return (
    <div className={`amount-display ${shaking ? "is-shaking" : ""}`} aria-label={amountAria(rawToCents(raw))} role="img">
      <span className="amount-display__currency" aria-hidden="true">$</span>
      <span className="amount-display__value" aria-hidden="true">{displayRaw(raw)}</span>
    </div>
  );
}

const KEYS: { key: KeypadKey; label: string; content?: JSX.Element }[] = [
  { key: "1", label: "1" }, { key: "2", label: "2" }, { key: "3", label: "3" },
  { key: "4", label: "4" }, { key: "5", label: "5" }, { key: "6", label: "6" },
  { key: "7", label: "7" }, { key: "8", label: "8" }, { key: "9", label: "9" },
  { key: ".", label: "Decimal point", content: <>.</> },
  { key: "0", label: "0" },
  { key: "back", label: "Delete", content: <Delete size={24} strokeWidth={2} aria-hidden="true" /> },
];

export function Keypad({ onKey }: { onKey(key: KeypadKey): void }) {
  // Physical keyboard support (desktop dev, accessibility).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^[0-9]$/.test(e.key)) onKey(e.key as KeypadKey);
      else if (e.key === "." || e.key === ",") onKey(".");
      else if (e.key === "Backspace") onKey("back");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKey]);

  return (
    <div className="keypad" role="group" aria-label="Keypad">
      {KEYS.map(({ key, label, content }) => (
        <button
          key={key}
          type="button"
          className="keypad__key"
          aria-label={content ? label : undefined}
          onClick={() => {
            haptic.tap();
            onKey(key);
          }}
        >
          {content ?? label}
        </button>
      ))}
    </div>
  );
}
