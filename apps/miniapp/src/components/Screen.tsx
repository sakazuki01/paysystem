import type { ReactNode } from "react";

/** Page frame: gutters, safe areas, room for the MainButton, and the enter transition. */
export function Screen({ children, className = "", label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <main className={`screen ${className}`} aria-label={label}>
      {children}
    </main>
  );
}
