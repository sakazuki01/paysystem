import { useEffect, useLayoutEffect, useState } from "react";
import type { Me, PayApi } from "./api/PayApi";
import { Banner, Logo, Skeleton } from "./components/primitives";
import { LOAD_ERROR } from "./lib/errors";
import { AppProvider, useApp } from "./state/app";
import { NavProvider, useNav, type Route } from "./state/nav";
import { ToastProvider } from "./state/toast";
import { applyTheme, brandColor, tg } from "./telegram/telegram";
import { ActivityDetail } from "./screens/ActivityDetail";
import { CheckIn } from "./screens/CheckIn";
import { EventDetail } from "./screens/EventDetail";
import { Events } from "./screens/Events";
import { GiftTicket } from "./screens/GiftTicket";
import { MyTicket } from "./screens/MyTicket";
import { Resell } from "./screens/Resell";
import { Amount } from "./screens/Amount";
import { Claim } from "./screens/Claim";
import { Confirm } from "./screens/Confirm";
import { Home } from "./screens/Home";
import { PickUsername } from "./screens/PickUsername";
import { Receive } from "./screens/Receive";
import { Recipient } from "./screens/Recipient";
import { Success } from "./screens/Success";
import { Welcome } from "./screens/Welcome";

/** Deep link → starting stack. `startapp=claim_<escrowId>` opens S7 directly. */
export function initialStack(me: Me, startParam?: string): Route[] {
  const claim = startParam?.match(/^claim_(.+)$/);
  if (claim) return me.username ? [{ name: "home" }, { name: "claim", id: claim[1]! }] : [{ name: "claim", id: claim[1]! }];
  if (!me.username) return [{ name: "welcome" }];
  return [{ name: "home" }];
}

export function App({ api }: { api: PayApi }) {
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const app = tg();
    app.ready();
    app.expand();
    applyTheme(app);
    const onTheme = () => {
      applyTheme(app);
      app.MainButton.setParams({ color: brandColor() });
    };
    app.onEvent("themeChanged", onTheme);
    return () => app.offEvent("themeChanged", onTheme);
  }, []);

  // Dev menu: "Sign in as …" re-boots the app as another user of the same mock world.
  useEffect(() => {
    const relogin = () => {
      setMe(null);
      setAttempt((a) => a + 1);
    };
    window.addEventListener("pay:relogin", relogin);
    return () => window.removeEventListener("pay:relogin", relogin);
  }, []);

  useEffect(() => {
    let live = true;
    setFailed(false);
    api.getMe().then(
      (m) => live && setMe(m),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, attempt]);

  return (
    <ToastProvider>
      {me ? (
        <AppProvider api={api} me={me}>
          <NavProvider initial={initialStack(me, tg().initDataUnsafe.start_param)}>
            <Shell />
          </NavProvider>
        </AppProvider>
      ) : (
        <Boot failed={failed} retry={() => setAttempt((a) => a + 1)} />
      )}
    </ToastProvider>
  );
}

/** Sign-in via initData + embedded wallet (spec S1: skeleton + "Setting up your wallet…"). */
function Boot({ failed, retry }: { failed: boolean; retry(): void }) {
  return (
    <main className="screen boot" aria-label="Loading" aria-busy={!failed}>
      <Logo />
      {failed ? (
        <Banner variant="danger" action={{ label: "Try again", onClick: retry }}>
          {LOAD_ERROR}
        </Banner>
      ) : (
        <>
          <Skeleton width={200} height={22} />
          <p className="caption caption--muted" aria-live="polite">Setting up your wallet…</p>
        </>
      )}
    </main>
  );
}

function Shell() {
  const nav = useNav();
  const { invalidate } = useApp();
  useEffect(() => {
    window.addEventListener("pay:refresh", invalidate);
    return () => window.removeEventListener("pay:refresh", invalidate);
  }, [invalidate]);
  const route = nav.current;
  const canGoBack = nav.stack.length > 1 && route.name !== "success";

  useLayoutEffect(() => {
    const back = tg().BackButton;
    if (!canGoBack) {
      back.hide();
      return;
    }
    back.show();
    back.onClick(nav.pop);
    return () => {
      back.offClick(nav.pop);
    };
  }, [canGoBack, nav.pop]);

  return (
    <div className="stack" key={`${nav.stack.length}-${route.name}`}>
      {renderRoute(route)}
    </div>
  );
}

function renderRoute(route: Route) {
  switch (route.name) {
    case "home":
      return <Home />;
    case "welcome":
      return <Welcome />;
    case "username":
      return <PickUsername afterClaim={route.afterClaim} />;
    case "recipient":
      return <Recipient />;
    case "amount":
      return <Amount recipient={route.recipient} />;
    case "confirm":
      return <Confirm recipient={route.recipient} />;
    case "success":
      return <Success info={route.info} />;
    case "claim":
      return <Claim id={route.id} />;
    case "receive":
      return <Receive />;
    case "activity":
      return <ActivityDetail id={route.id} />;
    case "events":
      return <Events tab={route.tab} />;
    case "event":
      return <EventDetail id={route.id} />;
    case "ticket":
      return <MyTicket id={route.id} />;
    case "gift":
      return <GiftTicket ticketId={route.ticketId} />;
    case "resell":
      return <Resell ticketId={route.ticketId} />;
    case "checkin":
      return <CheckIn eventId={route.eventId} />;
  }
}
