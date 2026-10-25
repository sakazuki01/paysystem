import type { ReactNode } from "react";
import type { Activity, UserSummary } from "../api/PayApi";
import { amountAria, shortTime, signedUsd } from "../lib/format";
import { plural } from "../lib/plural";
import { haptic } from "../telegram/telegram";
import { Avatar, StatusPill } from "./primitives";

const DAY_MS = 86_400_000;

/** UserRow caption: "Paid 6 times", else "New" for accounts under a day old, else the display name. */
export function userCaption(u: Pick<UserSummary, "timesPaid" | "createdAt" | "displayName">, now = Date.now()) {
  if (u.timesPaid > 0) return `Paid ${plural(u.timesPaid, "time")}`;
  if (now - u.createdAt < DAY_MS) return "New";
  return u.displayName;
}

export function UserRow({
  title,
  caption,
  avatar,
  onClick,
  disabled,
  captionMono = false,
}: {
  title: string;
  caption: string;
  avatar: ReactNode;
  onClick(): void;
  disabled?: boolean;
  /** Caption is an address fingerprint (--type-mono). */
  captionMono?: boolean;
}) {
  return (
    <button
      type="button"
      className="row"
      disabled={disabled}
      aria-label={`${title}, ${caption}`}
      onClick={() => {
        haptic.tap();
        onClick();
      }}
    >
      {avatar}
      <span className="row__main">
        <span className="row__title">{title}</span>
        <span className={`row__caption ${captionMono ? "mono" : ""}`}>{caption}</span>
      </span>
    </button>
  );
}

export function UserSummaryRow({ user, onClick, disabled }: { user: UserSummary; onClick(): void; disabled?: boolean }) {
  return (
    <UserRow
      title={`@${user.username}`}
      caption={userCaption(user)}
      avatar={<Avatar name={user.displayName || user.username} src={user.avatarUrl} />}
      onClick={onClick}
      disabled={disabled}
    />
  );
}

export function ActivityRow({ item, onClick }: { item: Activity; onClick(): void }) {
  const out = item.direction === "out";
  const label = item.toAddress ? item.counterparty : `@${item.counterparty}`;
  return (
    <button
      type="button"
      className="row"
      onClick={() => {
        haptic.tap();
        onClick();
      }}
      aria-label={`${out ? "Sent" : "Received"} ${amountAria(item.amountCents)} ${out ? "to" : "from"} ${label}, ${item.status}, ${shortTime(item.createdAt)}`}
    >
      <Avatar
        name={item.counterpartyName ?? item.counterparty}
        link={!!item.escrowId && out && item.status !== "sent"}
        wallet={!!item.toAddress}
      />
      <span className="row__main">
        <span className="row__title">{label}</span>
        <span className="row__caption row__caption--meta">
          {shortTime(item.createdAt)}
          <StatusPill status={item.status} />
        </span>
      </span>
      <span className="row__trail">
        <span className={`amount-signed ${out ? "" : "amount-signed--in"}`}>
          {signedUsd(item.amountCents, item.direction)}
        </span>
        {item.status === "refundable" && <span className="row__action">Refund</span>}
      </span>
    </button>
  );
}
