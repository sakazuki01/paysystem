import { useCallback, useRef, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { RecipientInfo } from "../api/PayApi";
import { Screen } from "../components/Screen";
import { AmountDisplay, Keypad } from "../components/amount";
import { Avatar, Chip, Skeleton } from "../components/primitives";
import { amountStatus, applyKey, centsToRaw, rawToCents, type KeypadKey } from "../lib/amount";
import { formatUsd } from "../lib/format";
import { useApp, useAsync } from "../state/app";
import { useNav } from "../state/nav";
import { haptic, useMainButton } from "../telegram/telegram";

const QUICK = [500, 1000, 2000, 5000];
const NOTE_MAX = 60;

/** S5 — Send: amount. */
export function Amount({ recipient }: { recipient: RecipientInfo }) {
  const { api, draft, setDraft } = useApp();
  const nav = useNav();
  const balance = useAsync(() => api.getBalance());
  const [shake, setShake] = useState(0);
  const { raw, note } = draft;
  // Taps can land before React re-renders; read the latest amount from a ref so none are dropped.
  const rawRef = useRef(raw);
  rawRef.current = raw;

  const status = balance.data === undefined ? "empty" : amountStatus(raw, balance.data);

  const onKey = useCallback(
    (key: KeypadKey) => {
      const next = applyKey(rawRef.current, key);
      if (next.rejected) {
        haptic.error();
        setShake((s) => s + 1);
        return;
      }
      rawRef.current = next.raw;
      setDraft((d) => ({ ...d, raw: next.raw }));
    },
    [setDraft],
  );

  useMainButton({
    text: "Review",
    disabled: status !== "ok",
    onClick: () => nav.push({ name: "confirm", recipient }),
  });

  return (
    <Screen label="Amount" className="amount">
      <div className="recipient-pill" aria-label={`Sending to @${recipient.handle}`} role="note">
        <Avatar name={recipient.displayName ?? recipient.handle} src={recipient.avatarUrl} size={24} link={!recipient.exists} />
        <span>@{recipient.handle}</span>
      </div>

      <AmountDisplay raw={raw} shakeSignal={shake} />

      <div className="chips" role="group" aria-label="Quick amounts">
        {QUICK.map((c) => (
          <Chip
            key={c}
            label={`$${c / 100}`}
            selected={rawToCents(raw) === c}
            onClick={() => setDraft((d) => ({ ...d, raw: centsToRaw(c) }))}
          />
        ))}
      </div>

      <input
        className="note-input"
        type="text"
        placeholder="What's it for?"
        aria-label="What's it for?"
        maxLength={NOTE_MAX}
        value={note}
        onChange={(e) => {
          const note = e.target.value.slice(0, NOTE_MAX);
          setDraft((d) => ({ ...d, note }));
        }}
      />

      <p className={`balance-caption ${status === "insufficient" ? "is-danger" : ""}`} aria-live="polite">
        {balance.data === undefined ? (
          <Skeleton width={120} height={14} />
        ) : status === "insufficient" ? (
          <>
            <AlertCircle size={16} strokeWidth={2} aria-hidden="true" /> Not enough balance
          </>
        ) : (
          `Balance ${formatUsd(balance.data)}`
        )}
      </p>

      <Keypad onKey={onKey} />
    </Screen>
  );
}
