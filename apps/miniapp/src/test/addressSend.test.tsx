import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { MockPayApi, SEED_WALLETS } from "../api/MockPayApi";
import { selectSafetyBanners } from "../lib/banners";

const STRANGER = "6p27gS9SXs5NiV5uME9cXuveA3q3ACbXpac9VEbRn5Vx";
const OFF_CURVE = "J9FHmrdn2niaFZ5SkyFDsDPmssTAumMnNVZtVxVHhtRS"; // a PDA
const mainButton = () => document.querySelector<HTMLButtonElement>(".tg-shim-main")!;

async function openSearch() {
  const api = new MockPayApi({ latencyMs: 0 });
  const user = userEvent.setup();
  render(<App api={api} />);
  await screen.findByText("$124.50");
  await user.click(screen.getByRole("button", { name: "Send" }));
  const search = screen.getByRole("searchbox", { name: "Username, @handle or wallet address" });
  return { api, user, search };
}

describe("S4 wallet address rows", () => {
  it("an unknown valid address shows a single 'Send to wallet' row with its fingerprint", async () => {
    const { user, search } = await openSearch();
    await user.type(search, STRANGER);
    expect(await screen.findByRole("button", { name: "Send to wallet, 6p27…n5Vx" })).toBeInTheDocument();
  });

  it("an address owned by a registered user shows their row, captioned 'Wallet of @alex'", async () => {
    const { user, search } = await openSearch();
    await user.type(search, SEED_WALLETS.alex);
    expect(await screen.findByRole("button", { name: "@alex, Wallet of @alex" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Send to wallet/ })).not.toBeInTheDocument();
  });

  it.each([
    ["0" + STRANGER.slice(1), "That's not a valid Solana address"],
    [OFF_CURVE, "This address can't receive payments"],
    [SEED_WALLETS.sakz, "That's your own wallet"],
  ])("%s → %s", async (input, copy) => {
    const { user, search } = await openSearch();
    await user.type(search, input);
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Send to wallet/ })).not.toBeInTheDocument();
  });

  it("accepts a solana: URI from the Scan button", async () => {
    const { user } = await openSearch();
    vi.spyOn(window, "prompt").mockReturnValue(`solana:${STRANGER}?amount=3`);
    await user.click(screen.getByRole("button", { name: "Scan QR code" }));
    expect(await screen.findByRole("button", { name: "Send to wallet, 6p27…n5Vx" })).toBeInTheDocument();
  });

  it("Paste fills the field, and a denied clipboard shows a toast", async () => {
    const { user } = await openSearch();
    const read = vi.fn().mockResolvedValueOnce(STRANGER).mockRejectedValueOnce(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { readText: read, writeText: vi.fn() }, configurable: true });
    await user.click(screen.getByRole("button", { name: "Paste" }));
    expect(await screen.findByRole("button", { name: "Send to wallet, 6p27…n5Vx" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Paste" }));
    expect(await screen.findByText("Couldn't read clipboard")).toBeInTheDocument();
  });
});

describe("S6 wallet-address variant", () => {
  it("only the double-check warning; never first-time / new-account", () => {
    const b = selectSafetyBanners({ handle: "", exists: false, timesPaid: 0, toAddress: STRANGER });
    expect(b.map((x) => [x.variant, x.text])).toEqual([
      ["warning", "Double-check this address — payments can't be undone."],
    ]);
  });

  it("send to an address: full grouped address on S6, success, activity shows the fingerprint", async () => {
    const { api, user, search } = await openSearch();
    await user.type(search, STRANGER);
    await user.click(await screen.findByRole("button", { name: "Send to wallet, 6p27…n5Vx" }));
    expect(await screen.findByLabelText("Sending to 6p27…n5Vx")).toBeInTheDocument();
    const pad = screen.getByRole("group", { name: "Keypad" });
    await user.click(within(pad).getByRole("button", { name: "5" }));
    await user.click(mainButton());

    expect(await screen.findByText("Wallet address")).toBeInTheDocument();
    const full = screen.getByLabelText(`Full address ${STRANGER}`);
    expect(full.textContent!.replace(/\s/g, "")).toBe(STRANGER);
    expect(full.querySelectorAll(".address-full__line")).toHaveLength(3);
    expect(screen.getByText("Double-check this address — payments can't be undone.")).toBeInTheDocument();
    expect(screen.queryByText(/First time paying/)).not.toBeInTheDocument();

    const send = vi.spyOn(api, "send");
    await user.click(mainButton());
    expect(await screen.findByText("Sent $5.00 to 6p27…n5Vx")).toBeInTheDocument();
    expect(send.mock.calls[0]![0]).toMatchObject({ toAddress: STRANGER, amountCents: 500 });
    expect(await api.getBalance()).toBe(11950);
    await user.click(mainButton());
    expect(await screen.findByRole("button", { name: /Sent 5 dollars to 6p27…n5Vx/ })).toBeInTheDocument();
  });
});
