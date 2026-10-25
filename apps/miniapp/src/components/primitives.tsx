import { useState, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Link2 } from "lucide-react";
import type { ActivityStatus } from "../api/PayApi";
import { fingerprint as toFingerprint } from "../lib/format";
import { useToast } from "../state/toast";
import { haptic } from "../telegram/telegram";

// ---------- Avatar ----------

export function initials(name: string): string {
  const parts = name.replace(/^@/, "").split(/[\s_]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

export function Avatar({
  name,
  src,
  size = 40,
  link = false,
}: {
  name: string;
  src?: string;
  size?: 24 | 40 | 64;
  /** Escrow recipient (not on Pay System): brand-soft circle with a link icon. */
  link?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (link) {
    return (
      <span className="avatar avatar--initials" style={style} aria-hidden="true">
        <Link2 size={size >= 64 ? 28 : size >= 40 ? 20 : 14} strokeWidth={2} />
      </span>
    );
  }
  if (src && !broken) {
    return <img className="avatar" style={style} src={src} alt="" onError={() => setBroken(true)} />;
  }
  return (
    <span
      className="avatar avatar--initials"
      style={{ ...style, fontSize: size >= 64 ? 22 : size >= 40 ? 15 : 11 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

// ---------- Card ----------

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

// ---------- Chip ----------

export function Chip({ label, selected, onClick }: { label: string; selected?: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      className={`chip ${selected ? "is-selected" : ""}`}
      aria-pressed={!!selected}
      onClick={() => {
        haptic.tap();
        onClick();
      }}
    >
      {label}
    </button>
  );
}

// ---------- Banner ----------

export type BannerVariant = "info" | "warning" | "success" | "danger";

const BANNER_ICONS = { info: Info, warning: AlertTriangle, success: CheckCircle2, danger: AlertCircle };

export function Banner({
  variant,
  children,
  action,
  onClick,
  label,
}: {
  variant: BannerVariant;
  children: ReactNode;
  /** Optional trailing link, e.g. "Try again". */
  action?: { label: string; onClick(): void };
  /** Makes the whole banner a button (e.g. "Did you mean"). */
  onClick?: () => void;
  /** Accessible name when the whole banner is a button. */
  label?: string;
}) {
  const Icon = BANNER_ICONS[variant];
  const body = (
    <>
      <Icon className="banner__icon" size={20} strokeWidth={2} aria-hidden="true" />
      <span className="banner__text">{children}</span>
      {action && (
        <button type="button" className="banner__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={`banner banner--${variant} banner--button`} onClick={onClick} aria-label={label}>
        {body}
      </button>
    );
  }
  return (
    <div className={`banner banner--${variant}`} role={variant === "danger" ? "alert" : undefined}>
      {body}
    </div>
  );
}

// ---------- StatusPill ----------

const PILL: Record<ActivityStatus, { label: string; tone: string }> = {
  sent: { label: "Sent", tone: "muted" },
  received: { label: "Received", tone: "success" },
  pending: { label: "Pending", tone: "pending" },
  refundable: { label: "Refundable", tone: "warning" },
  refunded: { label: "Refunded", tone: "muted" },
  failed: { label: "Failed", tone: "danger" },
};

export function StatusPill({ status }: { status: ActivityStatus }) {
  const { label, tone } = PILL[status];
  return <span className={`pill pill--${tone}`}>{label}</span>;
}

// ---------- Skeleton ----------

export function Skeleton({ width = "100%", height = 16, radius }: { width?: number | string; height?: number; radius?: number }) {
  return <span className="skeleton" style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden="true" />;
}

// ---------- Logo ----------

export function Logo({ size = 72 }: { size?: number }) {
  return (
    <span className="logo" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden="true">
      →$
    </span>
  );
}

// ---------- Fingerprint ----------

export function Fingerprint({ address }: { address: string }) {
  const toast = useToast();
  const fp = toFingerprint(address);
  return (
    <button
      type="button"
      className="fingerprint"
      aria-label={`Wallet address ${fp}. Copy`}
      onClick={async () => {
        haptic.tap();
        try {
          await navigator.clipboard.writeText(address);
        } catch {
          // Clipboard can be blocked in some webviews; the toast still confirms the tap.
        }
        toast("Address copied");
      }}
    >
      {fp}
    </button>
  );
}
