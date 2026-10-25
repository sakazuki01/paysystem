import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { RecipientInfo } from "../api/PayApi";

export interface SuccessInfo {
  kind: "sent" | "received" | "refunded";
  amountCents: number;
  counterparty: string;
  settleMs: number;
  signature: string;
  /** Sent to someone not on Pay System yet (shows the 7-day claim caption). */
  escrow?: boolean;
  /** Where Done goes. Default: home. */
  next?: "home" | "username";
}

export type Route =
  | { name: "home" }
  | { name: "welcome" }
  | { name: "username"; afterClaim?: boolean }
  | { name: "recipient" }
  | { name: "amount"; recipient: RecipientInfo }
  | { name: "confirm"; recipient: RecipientInfo }
  | { name: "success"; info: SuccessInfo }
  | { name: "claim"; id: string }
  | { name: "receive" }
  | { name: "activity"; id: string };

interface Nav {
  stack: Route[];
  current: Route;
  push(route: Route): void;
  pop(): void;
  reset(stack: Route[]): void;
}

const NavContext = createContext<Nav | null>(null);

/**
 * A plain stack: maps 1:1 onto Telegram's BackButton (visible whenever depth > 1).
 * No URLs; Mini Apps are opened through deep links (start_param), not paths.
 */
export function NavProvider({ initial, children }: { initial: Route[]; children: ReactNode }) {
  const [stack, setStack] = useState<Route[]>(initial);
  const push = useCallback((r: Route) => setStack((s) => [...s, r]), []);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const reset = useCallback((s: Route[]) => setStack(s), []);
  const value = useMemo(
    () => ({ stack, current: stack[stack.length - 1]!, push, pop, reset }),
    [stack, push, pop, reset],
  );
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error("useNav outside NavProvider");
  return nav;
}
