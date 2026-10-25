import { useEffect, useState } from "react";
import { AlertCircle, Search } from "lucide-react";
import { normalize } from "@pay-system/shared";
import type { UserSummary } from "../api/PayApi";
import { Screen } from "../components/Screen";
import { Avatar, Banner, Card } from "../components/primitives";
import { UserSummaryRow } from "../components/rows";
import { NETWORK_ERROR } from "../lib/errors";
import { eventDate, ticketNo } from "../lib/ticketsUi";
import { useSingleFlight } from "../lib/useSingleFlight";
import { useApp, useAsync } from "../state/app";
import { useNav } from "../state/nav";
import { haptic, useMainButton } from "../telegram/telegram";
import { ticketErrorCopy } from "./EventDetail";
import { RowSkeletons } from "./Home";

const HANDLE_RE = /^[a-z0-9_]{3,32}$/;

/** S14 — Gift ticket: pick a registered user, then confirm. One gift per ticket. */
export function GiftTicket({ ticketId }: { ticketId: string }) {
  const { api, me, invalidate } = useApp();
  const nav = useNav();
  const ticket = useAsync(() => api.getTicket(ticketId), [ticketId]);
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [to, setTo] = useState<UserSummary | null>(null);
  const [phase, setPhase] = useState<{ kind: "idle" } | { kind: "sending" } | { kind: "failed"; message: string }>({ kind: "idle" });

  useEffect(() => {
    const t = setTimeout(() => setQ(normalize(input.trim().replace(/^@/, ""))), 200);
    return () => clearTimeout(t);
  }, [input]);
  const results = useAsync(() => (q ? api.searchUsers(q) : Promise.resolve([])), [q]);
  const users = (results.data ?? []).filter((u) => u.username !== me.username);
  const unregistered = !!q && HANDLE_RE.test(q) && !results.loading && !users.some((u) => u.username === q);

  const gift = useSingleFlight(async () => {
    if (!to) return;
    setPhase({ kind: "sending" });
    try {
      const res = await api.giftTicket(ticketId, to.username);
      invalidate();
      nav.reset([
        { name: "home" },
        { name: "success", info: { kind: "gift", amountCents: 0, counterparty: to.username, settleMs: res.settleMs, signature: res.signature } },
      ]);
    } catch (e) {
      haptic.error();
      setPhase({ kind: "failed", message: ticketErrorCopy(e) });
    }
  });

  useMainButton({
    text: phase.kind === "sending" ? "Sending…" : phase.kind === "failed" ? "Try again" : "Gift ticket",
    visible: !!to,
    progress: phase.kind === "sending",
    disabled: phase.kind === "sending",
    onClick: gift,
  });

  const t = ticket.data;
  if (to && t) {
    return (
      <Screen label="Gift ticket" className="confirm">
        <Card className="confirm__card">
          <Avatar name={to.displayName || to.username} src={to.avatarUrl} size={64} />
          <span className="headline">@{to.username}</span>
          <span className="body">{to.displayName}</span>
        </Card>
        <div className="detail-list">
          <div className="detail-row">
            <span className="detail-row__label">Ticket</span>
            <span>
              {t.eventName} · {ticketNo(t.ticketNo)}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-row__label">Date</span>
            <span>{eventDate(t.startsAt)}</span>
          </div>
        </div>
        {phase.kind === "failed" ? (
          <Banner variant="danger">{phase.message}</Banner>
        ) : (
          <Banner variant="warning">You can only gift this ticket once</Banner>
        )}
      </Screen>
    );
  }

  return (
    <Screen label="Gift ticket">
      <h1 className="title">Gift ticket</h1>
      <div className="search">
        <Search size={20} strokeWidth={2} aria-hidden="true" className="search__icon" />
        <input
          type="search"
          className="search__input"
          placeholder="Username"
          aria-label="Username"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </div>
      {results.error !== undefined && (
        <Banner variant="danger" action={{ label: "Try again", onClick: results.reload }}>
          {NETWORK_ERROR}
        </Banner>
      )}
      {results.loading && q && !users.length ? (
        <RowSkeletons count={2} />
      ) : (
        <div className="list">
          {users.map((u) => (
            <UserSummaryRow key={u.username} user={u} onClick={() => setTo(u)} />
          ))}
        </div>
      )}
      {unregistered && (
        <p className="helper helper--danger">
          <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />@{q} needs a Pay System account first
        </p>
      )}
    </Screen>
  );
}
