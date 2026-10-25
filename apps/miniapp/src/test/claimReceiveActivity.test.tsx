import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { MockPayApi } from "../api/MockPayApi";

const mainButton = () => document.querySelector<HTMLButtonElement>(".tg-shim-main")!;

function openWith(search: string, me = "sakz") {
  window.history.replaceState({}, "", `/${search}`);
  const api = new MockPayApi({ latencyMs: 0, me });
  const user = userEvent.setup();
  render(<App api={api} />);
  return { api, user };
}

afterEach(() => window.history.replaceState({}, "", "/"));

describe("S7 claim", () => {
  it("normal: new user claims, sees the received success, then picks a username", async () => {
    const { user } = openWith("?startapp=claim_esc_newfriend", "newfriend");
    expect(await screen.findByText("@sakz sent you")).toBeInTheDocument();
    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("Welcome to Pay System")).toBeInTheDocument();
    expect(screen.getByText("We'll set up your wallet — takes a second.")).toBeInTheDocument();
    expect(mainButton()).toHaveTextContent("Claim $10.00");

    await user.click(mainButton());
    expect(await screen.findByText("You received $10.00 from @sakz")).toBeInTheDocument();
    await user.click(mainButton());
    expect(await screen.findByText("Pick a username so friends can pay you directly")).toBeInTheDocument();
  });

  it("expired", async () => {
    openWith("?startapp=claim_esc_expired");
    expect(await screen.findByText("This payment expired and was returned to @maya.")).toBeInTheDocument();
    expect(mainButton()).not.toBeVisible();
  });

  it("wrong user", async () => {
    openWith("?startapp=claim_esc_newfriend");
    expect(
      await screen.findByText("This payment was sent to @newfriend. You're signed in as @sakz."),
    ).toBeInTheDocument();
    expect(mainButton()).not.toBeVisible();
  });

  it("opens from the Home banner", async () => {
    const { user } = openWith("");
    await user.click(await screen.findByRole("button", { name: "@alex sent you $10. Claim" }));
    expect(await screen.findByText("@alex sent you")).toBeInTheDocument();
    await user.click(mainButton());
    expect(await screen.findByText("You received $10.00 from @alex")).toBeInTheDocument();
  });
});

describe("S9 receive", () => {
  it("shows the username, a QR of the deep link, the wallet fingerprint and a Share button", async () => {
    const { user } = openWith("");
    await user.click(await screen.findByRole("button", { name: "Receive" }));
    expect(await screen.findByRole("img", { name: /QR code/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "@sakz" })).toBeInTheDocument();
    expect(screen.getByText("Wallet address")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Wallet address 7xKX…9fQz/ })).toBeInTheDocument();
    expect(mainButton()).toHaveTextContent("Share");
  });
});

describe("S10 activity detail", () => {
  it("pending escrow: expires in 6 days, Refund disabled", async () => {
    const { user } = openWith("");
    await user.click(await screen.findByRole("button", { name: /to @newfriend, pending/ }));
    expect(await screen.findByText("Expires in 6 days")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(mainButton()).toHaveTextContent("Refund");
    expect(mainButton()).toBeDisabled();
  });

  it("expired escrow: Refundable, Refund enabled, refunds to balance", async () => {
    const { user } = openWith("");
    await user.click(await screen.findByRole("button", { name: /to @oldpal, refundable/ }));
    expect(await screen.findByText("Refundable")).toBeInTheDocument();
    expect(mainButton()).toBeEnabled();
    await user.click(mainButton());
    expect(await screen.findByText("$5.00 is back in your balance")).toBeInTheDocument();
    await user.click(mainButton());
    expect(await screen.findByText("$129.50")).toBeInTheDocument();
  });

  it("completed payment shows amount, counterparty, fee and note", async () => {
    const { user } = openWith("");
    await user.click(await screen.findByRole("button", { name: /Received 10 dollars from @alex/ }));
    expect(await screen.findByText("+$10.00")).toBeInTheDocument();
    expect(screen.getByText("Pizza night")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View on explorer/ })).toBeInTheDocument();
    expect(mainButton()).not.toBeVisible();
  });
});
