import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { normalize } from "@pay-system/shared";
import { Spinner } from "./primitives";

export type UsernameStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; name: string }
  | { state: "taken"; name: string }
  | { state: "lookalike"; of: string }
  | { state: "invalid" }
  | { state: "reserved" }
  | { state: "error"; message: string };

/** Spec §5 S2 / §6.2 copy. */
function statusLine(s: UsernameStatus) {
  switch (s.state) {
    case "idle":
      return null;
    case "checking":
      return { tone: "muted", icon: <Spinner size={14} />, text: "Checking…" };
    case "available":
      return { tone: "success", icon: <CheckCircle2 size={16} aria-hidden="true" />, text: `@${s.name} is yours to claim` };
    case "taken":
      return { tone: "danger", icon: <AlertCircle size={16} aria-hidden="true" />, text: `@${s.name} is taken` };
    case "lookalike":
      return {
        tone: "warning",
        icon: <AlertTriangle size={16} aria-hidden="true" />,
        text: `Too similar to @${s.of} — pick something more distinct`,
      };
    case "invalid":
      return { tone: "danger", icon: <AlertCircle size={16} aria-hidden="true" />, text: "3–20 characters: letters, numbers and _" };
    case "reserved":
      return { tone: "danger", icon: <AlertCircle size={16} aria-hidden="true" />, text: "That name is reserved" };
    case "error":
      return { tone: "danger", icon: <AlertCircle size={16} aria-hidden="true" />, text: s.message };
  }
}

/** `@` prefix fixed, lowercases as you type, live status line (aria-live polite). */
export function UsernameInput({
  value,
  onChange,
  status,
  disabled,
}: {
  value: string;
  onChange(v: string): void;
  status: UsernameStatus;
  disabled?: boolean;
}) {
  const line = statusLine(status);
  return (
    <div className="username-input">
      <label className={`username-input__box ${line ? `is-${line.tone}` : ""}`}>
        <span className="username-input__at" aria-hidden="true">@</span>
        <input
          className="username-input__field"
          type="text"
          aria-label="Username"
          aria-describedby="username-status"
          aria-invalid={line ? line.tone === "danger" || line.tone === "warning" : undefined}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(normalize(e.target.value.replace(/^@+/, "")))}
        />
      </label>
      <p id="username-status" className={`username-input__status is-${line?.tone ?? "muted"}`} aria-live="polite">
        {line && (
          <>
            {line.icon}
            <span>{line.text}</span>
          </>
        )}
      </p>
    </div>
  );
}
