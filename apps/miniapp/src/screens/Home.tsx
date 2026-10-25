import { ArrowDownLeft, ArrowUpRight, ChevronRight, Ticket } from "lucide-react";
import { Screen } from "../components/Screen";
import { Avatar, Banner, Card, Skeleton } from "../components/primitives";
import { ActivityRow } from "../components/rows";
import { formatUsd } from "../lib/format";
import { LOAD_ERROR, shortUsd } from "../lib/errors";
import { useApp, useAsync } from "../state/app";
import { useNav } from "../state/nav";
import { haptic } from "../telegram/telegram";

/** S3 — Home. The one screen with in-page primary buttons; the MainButton stays hidden. */
export function Home() {
  const { api, me, setDraft } = useApp();
  const nav = useNav();
  const balance = useAsync(() => api.getBalance());
  const activity = useAsync(() => api.getActivity());
  const incoming = useAsync(() => api.getIncomingEscrows());
  const myTickets = useAsync(() => api.getMyTickets());
  const upcoming = myTickets.data?.filter((t) => !t.checkedIn && t.startsAt > Date.now()).length ?? 0;
  const ticketsCaption = upcoming ? `${upcoming} upcoming` : "Find events";
  const username = me.username ?? me.telegramHandle;

  return (
    <Screen label="Home" className="home">
      <header className="home__header">
        <button
          type="button"
          className="home__me"
          onClick={() => nav.push({ name: "receive" })}
          aria-label={`@${username}, open Receive`}
        >
          <Avatar name={me.displayName} src={me.avatarUrl} />
          <span className="home__handle">@{username}</span>
        </button>
      </header>

      <Card className="balance">
        <span className="caption caption--muted">Balance</span>
        {balance.data === undefined && balance.loading ? (
          <Skeleton width={160} height={40} radius={8} />
        ) : balance.data === undefined ? (
          <Banner variant="danger" action={{ label: "Try again", onClick: balance.reload }}>
            {LOAD_ERROR}
          </Banner>
        ) : (
          <span className="balance__value tabular">{formatUsd(balance.data)}</span>
        )}
        <span className="caption caption--muted">USDC on Solana</span>
      </Card>

      <div className="home__actions">
        <button
          type="button"
          className="btn btn--brand"
          onClick={() => {
            haptic.tap();
            setDraft({ raw: "", note: "" });
            nav.push({ name: "recipient" });
          }}
        >
          <ArrowUpRight size={24} strokeWidth={2} aria-hidden="true" />
          Send
        </button>
        <button
          type="button"
          className="btn btn--soft"
          onClick={() => {
            haptic.tap();
            nav.push({ name: "receive" });
          }}
        >
          <ArrowDownLeft size={24} strokeWidth={2} aria-hidden="true" />
          Receive
        </button>
      </div>

      <button
        type="button"
        className="card entry-row"
        aria-label={`Tickets, ${ticketsCaption}`}
        onClick={() => {
          haptic.tap();
          nav.push({ name: "events" });
        }}
      >
        <span className="entry-row__icon" aria-hidden="true">
          <Ticket size={24} strokeWidth={2} />
        </span>
        <span className="row__main">
          <span className="row__title">Tickets</span>
          <span className="row__caption">{ticketsCaption}</span>
        </span>
        <ChevronRight size={20} strokeWidth={2} aria-hidden="true" className="row__chevron" />
      </button>

      {incoming.data?.map((e) => (
        <Banner
          key={e.id}
          variant="success"
          onClick={() => nav.push({ name: "claim", id: e.id })}
          label={`@${e.sender} sent you ${shortUsd(e.amountCents)}. Claim`}
        >
          @{e.sender} sent you {shortUsd(e.amountCents)} — <span className="link">Claim</span>
        </Banner>
      ))}

      <section className="section" aria-labelledby="activity-title">
        <h2 id="activity-title" className="section__title">Activity</h2>
        {activity.data === undefined && activity.loading ? (
          <RowSkeletons />
        ) : activity.data === undefined ? (
          <Banner variant="danger" action={{ label: "Try again", onClick: activity.reload }}>
            {LOAD_ERROR}
          </Banner>
        ) : activity.data.length === 0 ? (
          <p className="empty">No payments yet. Send your first $1 to a friend.</p>
        ) : (
          <div className="list">
            {activity.data.map((a) => (
              <ActivityRow key={a.id} item={a} onClick={() => nav.push({ name: "activity", id: a.id })} />
            ))}
          </div>
        )}
      </section>
    </Screen>
  );
}

export function RowSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="list" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="row row--skeleton" key={i}>
          <Skeleton width={40} height={40} radius={999} />
          <span className="row__main">
            <Skeleton width="45%" height={16} />
            <Skeleton width="30%" height={12} />
          </span>
        </div>
      ))}
    </div>
  );
}
