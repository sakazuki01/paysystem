import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { MockPayApi } from "../api/MockPayApi";

function setup(opts: ConstructorParameters<typeof MockPayApi>[0] = {}) {
  const api = new MockPayApi({ latencyMs: 0, ...opts });
  const user = userEvent.setup();
  render(<App api={api} />);
  return { api, user };
}

/** The Telegram MainButton (the dev shim renders it outside the React tree). */
const mainButton = () => document.querySelector<HTMLButtonElement>(".tg-shim-main")!;

async function tapKeys(user: ReturnType<typeof userEvent.setup>, keys: string) {
  const pad = screen.getByRole("group", { name: "Keypad" });
  for (const k of keys) {
    await user.click(within(pad).getByRole("button", { name: k === "." ? "Decimal point" : k }));
  }
}

describe("send flow (S3 → S4 → S5 → S6 → S8)", () => {
  it("pays @alex $10 and returns home with the new balance", async () => {
    const { user } = setup();
    expect(await screen.findByText("$124.50")).toBeInTheDocument();
    expect(mainButton()).not.toBeVisible(); // Home uses in-page Send/Receive

    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.type(screen.getByRole("searchbox", { name: "Username, @handle or wallet address" }), "alex");
    await user.click(await screen.findByRole("button", { name: /@alex\b.*Paid 6 times/ }));

    await tapKeys(user, "10");
    expect(screen.getByLabelText("10 dollars")).toBeInTheDocument();
    expect(mainButton()).toHaveTextContent("Review");
    await user.click(mainButton());

    // S6: trusted payee, no warnings
    expect(await screen.findByText("Network fee")).toBeInTheDocument();
    expect(screen.queryByText(/First time paying/)).not.toBeInTheDocument();
    expect(mainButton()).toHaveTextContent("Send $10.00");
    await user.click(mainButton());

    expect(await screen.findByText("Sent $10.00 to @alex")).toBeInTheDocument();
    expect(screen.getByText(/^Settled in \d\.\d s · Free$/)).toBeInTheDocument();
    expect(mainButton()).toHaveTextContent("Done");
    await user.click(mainButton());

    expect(await screen.findByText("$114.50")).toBeInTheDocument();
  });

  it("sends to an unregistered handle through escrow with only the escrow banner", async () => {
    const { user } = setup();
    await screen.findByText("$124.50");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.type(screen.getByRole("searchbox", { name: "Username, @handle or wallet address" }), "@newfriend");
    await user.click(await screen.findByRole("button", { name: /Send to @newfriend on Telegram/ }));
    await user.click(screen.getByRole("button", { name: "$5" }));
    await user.click(mainButton());

    expect(
      await screen.findByText("@newfriend isn't on Pay System yet. They have 7 days to claim, or you get it back."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/First time paying/)).not.toBeInTheDocument();
    await user.click(mainButton());
    expect(await screen.findByText("Sent $5.00 to @newfriend")).toBeInTheDocument();
    expect(screen.getByText("They have 7 days to claim it")).toBeInTheDocument();
  });

  it("warns 'Did you mean @alex?' for a near-miss and selects alex on tap", async () => {
    const { user } = setup();
    await screen.findByText("$124.50");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.type(screen.getByRole("searchbox", { name: "Username, @handle or wallet address" }), "a1ex");
    await user.click(await screen.findByRole("button", { name: "Did you mean @alex? You've paid them 6 times." }));
    expect(await screen.findByLabelText("Sending to @alex")).toBeInTheDocument();
  });

  it("shows both warnings for @alex2 (first time + created today)", async () => {
    const { user } = setup();
    await screen.findByText("$124.50");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.type(screen.getByRole("searchbox", { name: "Username, @handle or wallet address" }), "alex2");
    await user.click(await screen.findByRole("button", { name: /^@alex2\b/ }));
    await tapKeys(user, "1");
    await user.click(mainButton());
    expect(await screen.findByText("First time paying @alex2")).toBeInTheDocument();
    expect(screen.getByText("This account was created today")).toBeInTheDocument();
  });

  it("keeps the amount and offers Try again when sending fails", async () => {
    const { api, user } = setup();
    await screen.findByText("$124.50");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.type(screen.getByRole("searchbox", { name: "Username, @handle or wallet address" }), "alex");
    await user.click(await screen.findByRole("button", { name: /@alex\b.*Paid 6 times/ }));
    await tapKeys(user, "7");
    await user.click(mainButton());
    await screen.findByText("Network fee");
    api.failNext("network");
    await user.click(mainButton());
    expect(
      await screen.findByText("Payment didn't go through. Your money hasn't moved — try again."),
    ).toBeInTheDocument();
    expect(mainButton()).toHaveTextContent("Try again");
    expect(screen.getByText("$7.00")).toBeInTheDocument();
    await user.click(mainButton());
    expect(await screen.findByText("Sent $7.00 to @alex")).toBeInTheDocument();
  });

  it("a failure banner replaces the safety banners until Try again", async () => {
    const { api, user } = setup({ latencyMs: 150 });
    await screen.findByText("$124.50");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.type(screen.getByRole("searchbox", { name: "Username, @handle or wallet address" }), "alex2");
    await user.click(await screen.findByRole("button", { name: /^@alex2\b/ }));
    await screen.findByRole("group", { name: "Keypad" });
    await screen.findByText(/^Balance \$/); // Review stays disabled until the balance loads
    await tapKeys(user, "1");
    await user.click(mainButton());
    await screen.findByText("First time paying @alex2");

    api.failNext("network");
    await user.click(mainButton());
    expect(
      await screen.findByText("Payment didn't go through. Your money hasn't moved — try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("First time paying @alex2")).not.toBeInTheDocument();
    expect(screen.queryByText("This account was created today")).not.toBeInTheDocument();

    // Hold the retried send open so the "sending" state can be inspected deterministically.
    let release!: () => void;
    const realSend = api.send.bind(api);
    vi.spyOn(api, "send").mockImplementationOnce(async (input) => {
      await new Promise<void>((r) => (release = r));
      return realSend(input);
    });
    await user.click(mainButton()); // Try again: failure clears, safety banners return while sending
    expect(screen.queryByText(/Payment didn't go through/)).not.toBeInTheDocument();
    expect(await screen.findByText("First time paying @alex2")).toBeInTheDocument();
    release();
    expect(await screen.findByText("Sent $1.00 to @alex2")).toBeInTheDocument();
  });
});

describe("S5 amount rules in the UI", () => {
  it("disables Review and says 'Not enough balance' above the balance", async () => {
    const { user } = setup();
    await screen.findByText("$124.50");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.type(screen.getByRole("searchbox", { name: "Username, @handle or wallet address" }), "alex");
    await user.click(await screen.findByRole("button", { name: /@alex\b.*Paid 6 times/ }));

    expect(screen.getByText("Balance $124.50")).toBeInTheDocument();
    await tapKeys(user, "200");
    expect(screen.getByText("Not enough balance")).toBeInTheDocument();
    expect(mainButton()).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(mainButton()).toBeEnabled();
  });

  it("doesn't drop keys tapped faster than React re-renders", async () => {
    const { user } = setup();
    await screen.findByText("$124.50");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.type(screen.getByRole("searchbox", { name: "Username, @handle or wallet address" }), "alex");
    await user.click(await screen.findByRole("button", { name: /@alex\b.*Paid 6 times/ }));
    const pad = screen.getByRole("group", { name: "Keypad" });
    act(() => {
      for (const k of ["1", "2", "3"]) fireEvent.click(within(pad).getByRole("button", { name: k }));
    });
    expect(screen.getByLabelText("123 dollars")).toBeInTheDocument();
  });

  it("rejects a third decimal with a shake", async () => {
    const { user } = setup();
    await screen.findByText("$124.50");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await user.type(screen.getByRole("searchbox", { name: "Username, @handle or wallet address" }), "alex");
    await user.click(await screen.findByRole("button", { name: /@alex\b.*Paid 6 times/ }));
    await tapKeys(user, "1.259");
    expect(screen.getByLabelText("1 dollar and 25 cents")).toHaveClass("is-shaking");
  });
});
