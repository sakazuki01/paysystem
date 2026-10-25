import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { MockPayApi } from "./api/MockPayApi";
import type { PayApi } from "./api/PayApi";
import "./styles/tokens.css";
import "./styles/app.css";

// Swap MockPayApi for the real backend client here (Brief 3).
// Dev: ?as=newfriend signs in as a user with no username (S1/S2, claim → S2).
const params = new URLSearchParams(window.location.search);
const api: PayApi = new MockPayApi({ me: params.get("as") ?? "sakz" });
if (import.meta.env.DEV) Object.assign(window, { payApi: api });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App api={api} />
  </StrictMode>,
);
