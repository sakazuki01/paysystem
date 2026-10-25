import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { MockPayApi, SEED_EVENTS } from "./api/MockPayApi";
import { registerDevAction } from "./telegram/devShim";
import { tg } from "./telegram/telegram";
import type { PayApi } from "./api/PayApi";
import "./styles/tokens.css";
import "./styles/app.css";

// Swap MockPayApi for the real backend client here (Brief 3).
// Dev: ?as=newfriend signs in as a user with no username (S1/S2, claim → S2).
const params = new URLSearchParams(window.location.search);
// statusUnknownPolls: 1 so a timed-out send visibly shows "Checking your payment…" first.
const mock = new MockPayApi({ me: params.get("as") ?? "sakz", statusUnknownPolls: 1 });
const api: PayApi = mock;
if (import.meta.env.DEV) {
  Object.assign(window, { payApi: mock });
  if (tg().platform === "dev-shim") {
    // Demo walkthrough helpers (LOGIC §10.5): gifting needs > 24 h before the show, check-in needs show time.
    const refresh = () => window.dispatchEvent(new Event("pay:refresh"));
    registerDevAction(
      () => `Organizer view: ${mock.organizerView ? "on" : "off"}`,
      () => {
        mock.organizerView = !mock.organizerView;
        refresh();
      },
    );
    registerDevAction(
      () => "Jump to show time (Solana Night Live)",
      async () => {
        const e = await mock.getEvent(SEED_EVENTS.snl);
        if (e) mock.__travelTo(e.startsAt + 30 * 60_000);
        refresh();
      },
    );
    registerDevAction(
      () => (mock.__me === "sakz" ? "Sign in as @newfriend" : "Sign in as @sakz"),
      () => {
        mock.__switchUser(mock.__me === "sakz" ? "newfriend" : "sakz");
        window.dispatchEvent(new Event("pay:relogin"));
      },
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
);
