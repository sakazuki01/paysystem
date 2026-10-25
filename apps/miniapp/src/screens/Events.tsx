import { Screen } from "../components/Screen";
import { Banner } from "../components/primitives";
import { EventCard, SegmentedControl, TicketRow } from "../components/tickets";
import { NETWORK_ERROR } from "../lib/errors";
import { useApp, useAsync } from "../state/app";
import { useNav } from "../state/nav";
import { RowSkeletons } from "./Home";

/** S11 — Tickets: Events | My tickets. */
export function Events({ tab = "events" }: { tab?: "events" | "mine" }) {
  const { api } = useApp();
  const nav = useNav();
  const events = useAsync(() => api.listEvents());
  const mine = useAsync(() => api.getMyTickets());
  // Keep the tab in the route so Back returns to the same tab.
  const setTab = (t: "events" | "mine") => {
    nav.pop();
    nav.push({ name: "events", tab: t });
  };

  return (
    <Screen label="Tickets" className="events">
      <h1 className="title">Tickets</h1>
      <SegmentedControl
        label="Tickets"
        value={tab}
        onChange={setTab}
        options={[
          { value: "events", label: "Events" },
          { value: "mine", label: "My tickets", badge: mine.data?.length },
        ]}
      />

      {tab === "events" ? (
        events.data === undefined && events.loading ? (
          <RowSkeletons />
        ) : events.data === undefined ? (
          <Banner variant="danger" action={{ label: "Try again", onClick: events.reload }}>
            {NETWORK_ERROR}
          </Banner>
        ) : events.data.length === 0 ? (
          <p className="empty">No events yet.</p>
        ) : (
          <div className="event-list">
            {events.data.map((e) => (
              <EventCard key={e.id} event={e} onClick={() => nav.push({ name: "event", id: e.id })} />
            ))}
          </div>
        )
      ) : mine.data === undefined && mine.loading ? (
        <RowSkeletons />
      ) : mine.data === undefined ? (
        <Banner variant="danger" action={{ label: "Try again", onClick: mine.reload }}>
          {NETWORK_ERROR}
        </Banner>
      ) : mine.data.length === 0 ? (
        <p className="empty">
          No tickets yet.{" "}
          <button type="button" className="link-inline" onClick={() => setTab("events")}>
            Find an event.
          </button>
        </p>
      ) : (
        <div className="list">
          {mine.data.map((t) => (
            <TicketRow key={t.id} ticket={t} onClick={() => nav.push({ name: "ticket", id: t.id })} />
          ))}
        </div>
      )}
    </Screen>
  );
}
