import { describe, expect, it } from "vitest";
import { applyKey, amountStatus, rawToCents, MAX_RAW_INT_DIGITS } from "./amount";
import { selectSafetyBanners } from "./banners";
import { didYouMean, editDistance } from "./didYouMean";
import { formatUsd, signedUsd, amountAria, fingerprint, settledCaption, sinceCaption, expiresInCaption } from "./format";

describe("amount entry rules (spec §4 AmountDisplay / Keypad)", () => {
  it("builds amounts digit by digit", () => {
    let raw = "";
    for (const k of ["1", "0", ".", "5"] as const) raw = applyKey(raw, k).raw;
    expect(raw).toBe("10.5");
    expect(rawToCents(raw)).toBe(1050);
  });

  it("allows at most 2 decimals and rejects a third", () => {
    expect(applyKey("10.50", "1")).toEqual({ raw: "10.50", rejected: true });
  });

  it("rejects a second decimal point", () => {
    expect(applyKey("1.5", ".")).toEqual({ raw: "1.5", rejected: true });
  });

  it("turns a leading '.' into '0.' and drops leading zeros", () => {
    expect(applyKey("", ".").raw).toBe("0.");
    expect(applyKey("0", "5").raw).toBe("5");
    expect(applyKey("0", "0")).toEqual({ raw: "0", rejected: true });
  });

  it("caps the integer part", () => {
    const max = "9".repeat(MAX_RAW_INT_DIGITS);
    expect(applyKey(max, "9")).toEqual({ raw: max, rejected: true });
  });

  it("backspace removes the last character and is rejected on empty", () => {
    expect(applyKey("10.5", "back").raw).toBe("10.");
    expect(applyKey("", "back")).toEqual({ raw: "", rejected: true });
  });

  it("status: empty / zero / over balance / ok", () => {
    expect(amountStatus("", 12450)).toBe("empty");
    expect(amountStatus("0.", 12450)).toBe("empty");
    expect(amountStatus("124.51", 12450)).toBe("insufficient");
    expect(amountStatus("124.50", 12450)).toBe("ok");
  });
});

describe("S6 safety banners (max 2, spec order)", () => {
  const now = Date.UTC(2026, 9, 25, 12);
  const H = 3600_000;

  it("first-time payee", () => {
    const b = selectSafetyBanners({ handle: "maya", exists: true, timesPaid: 0, createdAt: now - 100 * 24 * H }, now);
    expect(b.map((x) => x.text)).toEqual(["First time paying @maya"]);
    expect(b[0]!.variant).toBe("warning");
  });

  it("new account paid before shows only the age warning", () => {
    const b = selectSafetyBanners({ handle: "x", exists: true, timesPaid: 3, createdAt: now - 2 * H }, now);
    expect(b.map((x) => x.text)).toEqual(["This account was created today"]);
  });

  it("first time + created today shows both, in order", () => {
    const b = selectSafetyBanners({ handle: "alex2", exists: true, timesPaid: 0, createdAt: now - 3 * H }, now);
    expect(b.map((x) => x.text)).toEqual(["First time paying @alex2", "This account was created today"]);
  });

  it("escrow recipient: first-time warning + escrow info", () => {
    const b = selectSafetyBanners({ handle: "newfriend", exists: false, timesPaid: 0 }, now);
    expect(b.map((x) => x.variant)).toEqual(["warning", "info"]);
    expect(b[1]!.text).toBe(
      "@newfriend isn't on Pay System yet. They have 7 days to claim, or you get it back.",
    );
  });

  it("never more than 2", () => {
    const b = selectSafetyBanners({ handle: "z", exists: false, timesPaid: 0, createdAt: now }, now);
    expect(b.length).toBeLessThanOrEqual(2);
  });

  it("trusted payee: no banners", () => {
    expect(selectSafetyBanners({ handle: "alex", exists: true, timesPaid: 6, createdAt: now - 90 * 24 * H }, now)).toEqual([]);
  });
});

describe("did you mean", () => {
  const past = [{ username: "alex", timesPaid: 6 }, { username: "maya", timesPaid: 2 }];
  it("edit distance", () => {
    expect(editDistance("alx", "alex")).toBe(1);
    expect(editDistance("a1ex", "alex")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBe(3);
  });
  it("suggests a past recipient within distance 1-2", () => {
    expect(didYouMean("alx", past)?.username).toBe("alex");
    expect(didYouMean("@a1ex", past)?.username).toBe("alex");
    expect(didYouMean("alex2", past)?.username).toBe("alex");
  });
  it("is silent for exact matches, prefixes being typed, and far inputs", () => {
    expect(didYouMean("alex", past)).toBeNull();
    expect(didYouMean("ale", past)).toBeNull();
    expect(didYouMean("zzzzzz", past)).toBeNull();
    expect(didYouMean("", past)).toBeNull();
  });
});

describe("format", () => {
  it("dollars", () => {
    expect(formatUsd(12450)).toBe("$124.50");
    expect(formatUsd(123456789)).toBe("$1,234,567.89");
    expect(signedUsd(1000, "in")).toBe("+$10.00");
    expect(signedUsd(500, "out")).toBe("−$5.00");
  });
  it("aria amounts read as dollars", () => {
    expect(amountAria(1000)).toBe("10 dollars");
    expect(amountAria(1050)).toBe("10 dollars and 50 cents");
    expect(amountAria(100)).toBe("1 dollar");
  });
  it("fingerprint", () => {
    expect(fingerprint("7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU9fQz")).toBe("7xKX…9fQz");
  });
  it("captions", () => {
    expect(settledCaption(912)).toBe("Settled in 0.9 s · Free");
    expect(sinceCaption(Date.UTC(2026, 9, 3))).toBe("On Pay System since Oct 2026");
    const now = Date.UTC(2026, 9, 25);
    expect(expiresInCaption(now + 6 * 24 * 3600_000 - 1000, now)).toBe("Expires in 6 days");
  });
});
