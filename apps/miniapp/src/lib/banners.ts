// S6 Confirm safety banners: design/DESIGN_SPEC.md §5 S6. At most 2, in spec order.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SafetyInput {
  handle: string;
  exists: boolean;
  timesPaid: number;
  createdAt?: number;
}

export interface SafetyBanner {
  id: "first-time" | "new-account" | "escrow";
  variant: "warning" | "info";
  text: string;
}

export function selectSafetyBanners(r: SafetyInput, now: number = Date.now()): SafetyBanner[] {
  const out: SafetyBanner[] = [];
  // Warnings are about registered accounts; an escrow recipient gets only the info banner.
  if (r.exists && r.timesPaid === 0) {
    out.push({ id: "first-time", variant: "warning", text: `First time paying @${r.handle}` });
  }
  if (r.exists && r.createdAt !== undefined && now - r.createdAt < DAY_MS) {
    out.push({ id: "new-account", variant: "warning", text: "This account was created today" });
  }
  if (!r.exists) {
    out.push({
      id: "escrow",
      variant: "info",
      text: `@${r.handle} isn't on Pay System yet. They have 7 days to claim, or you get it back.`,
    });
  }
  return out.slice(0, 2);
}
