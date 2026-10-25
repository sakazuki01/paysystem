import { useCallback, useRef } from "react";

/**
 * Wraps a money-moving action so it can run at most once at a time (LOGIC §7.5.3).
 * The lock is a ref set synchronously before any await, so two taps in the same tick
 * (or Telegram's MainButton double events) can't both get through; React state would be too late.
 */
export function useSingleFlight<A extends unknown[]>(fn: (...args: A) => Promise<void>): (...args: A) => Promise<void> {
  const busy = useRef(false);
  const latest = useRef(fn);
  latest.current = fn;
  return useCallback(async (...args: A) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await latest.current(...args);
    } finally {
      busy.current = false;
    }
  }, []);
}

/** 16 random bytes, hex: one per payment attempt, reused across Try again (LOGIC §7.5.1). */
export function newIntentId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
