import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { MockPayApi, SEED_EVENTS } from "../api/MockPayApi";

const mainButton = () => document.querySelector<HTMLButtonElement>(".tg-shim-main")!;
const intent = (n: number) => n.toString(16).padStart(32, "0");

function renderApp(api: MockPayApi) {
  const user = userEvent.setup();
  render(<App api={api} />);
  return user;
}

async function openEvent(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(await screen.findByRole("button", { name: /^Tickets/ }));
  await user.click(await screen.findByRole("button", { name }));
}

describe("S11/S12 events", () => {
  it("Home has a Tickets entry; S11 lists events with Sold out pill", async () => {
    const user = renderApp(new MockPayApi({ latencyMs: 0 }));
    await user.click(await screen.findByRole("button", { name: "Tickets, Find events" }));
    expect(await screen.findByRole("button", { name: /Solana Night Live/ })).toBeInTheDocument();
    const hack = screen.getByRole("button", { name: /Hack Afterparty/ });
    expect(within(hack).getByText("Sold out")).toBeInTheDocument();
  });

  it("sold-out event: MainButton hidden, banner points to resale", async () => {
    const user = renderApp(new MockPayApi({ latencyMs: 0, me: "maya" }));
    await openEvent(user, /Hack Afterparty/);
    expect(await screen.findByText("Sold out — check resale below")).toBeInTheDocument();
    expect(mainButton()).not.toBeVisible();
    expect(screen.getByText("Resale from $11.00")).toBeInTheDocument();
  });

  it("buy a ticket → S8 'You're going…' → it appears in My tickets", async () => {
    const api = new MockPayApi({ latencyMs: 0, me: "alex" });
    const user = renderApp(api);
    await openEvent(user, /Solana Night Live/);
    expect(await screen.findByText("Resale cap $27.50 (110%)")).toBeInTheDocument();
    expect(mainButton()).toHaveTextContent("Buy ticket · $25.00");
    await user.click(mainButton()); // opens the confirm sheet
    const sheet = await screen.findByRole("dialog", { name: "Confirm purchase" });
    expect(within(sheet).getByText("Free")).toBeInTheDocument();
    expect(within(sheet).getByText("$55.00")).toBeInTheDocument(); // balance after: 80 − 25
    await user.click(mainButton());
    expect(await screen.findByText("You're going to Solana Night Live")).toBeInTheDocument();
    expect(screen.getByText(/^Ticket #084 · Settled in \d\.\d s$/)).toBeInTheDocument();
    await user.click(mainButton()); // Done
    await user.click(await screen.findByRole("button", { name: /^Tickets, 2 upcoming/ }));
    await user.click(await screen.findByRole("tab", { name: /My tickets/ }));
    expect(await screen.findByRole("button", { name: /Solana Night Live.*#084.*Upcoming/ })).toBeInTheDocument();
  });

  it("e. double-tap Buy makes one ticket", async () => {
    const api = new MockPayApi({ latencyMs: 0, me: "alex" });
    const buy = vi.spyOn(api, "buyTicket");
    const user = renderApp(api);
    await openEvent(user, /Solana Night Live/);
    await screen.findByText("Resale cap $27.50 (110%)");
    await user.click(mainButton());
    await screen.findByRole("dialog", { name: "Confirm purchase" });
    act(() => {
      fireEvent.click(mainButton());
      fireEvent.click(mainButton());
    });
    await screen.findByText("You're going to Solana Night Live");
    expect(buy).toHaveBeenCalledTimes(1);
    expect((await api.getMyTickets()).filter((t) => t.eventId === SEED_EVENTS.snl)).toHaveLength(2); // listed one + new
  });

  it("f. a resale whose price changed is refused with no charge, and the list reloads", async () => {
    const api = new MockPayApi({ latencyMs: 0 });
    const user = renderApp(api);
    await openEvent(user, /Solana Night Live/);
    const row = await screen.findByRole("button", { name: "Buy from @alex for $26.00" });
    // The seller bumps the price (still under the cap) after we loaded the page.
    const alex = api.as("alex");
    await alex.cancelListing("tkt_snl_031");
    await alex.listTicket("tkt_snl_031", 2700);
    await user.click(row);
    await screen.findByRole("dialog", { name: "Confirm purchase" });
    await user.click(mainButton());
    expect(await screen.findByText("This listing just changed. Check the new price and try again.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Buy from @alex for $27.00" })).toBeInTheDocument();
    expect(await api.getBalance()).toBe(12450);
  });
});

describe("S13–S15 my ticket", () => {
  async function ownTicket(eventId: string, me = "sakz") {
    const api = new MockPayApi({ latencyMs: 0, me });
    const { ticket } = await api.buyTicket(eventId, intent(1));
    return { api, ticket };
  }

  async function openMyTicket(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
    await user.click(await screen.findByRole("button", { name: /^Tickets/ }));
    await user.click(await screen.findByRole("tab", { name: /My tickets/ }));
    await user.click(await screen.findByRole("button", { name }));
  }

  it("shows a refreshing QR and no MainButton", async () => {
    const { api } = await ownTicket(SEED_EVENTS.snl);
    const user = renderApp(api);
    await openMyTicket(user, /Solana Night Live/);
    expect(await screen.findByRole("img", { name: /Ticket QR code/ })).toBeInTheDocument();
    expect(screen.getByText("Refreshes every 30 s · Screenshots won't work")).toBeInTheDocument();
    expect(mainButton()).not.toBeVisible();
  });

  it("S15: typing above the cap shakes, says the max, and disables List", async () => {
    const { api } = await ownTicket(SEED_EVENTS.snl);
    const user = renderApp(api);
    await openMyTicket(user, /Solana Night Live/);
    await user.click(await screen.findByRole("button", { name: "Resell" }));
    expect(await screen.findByText("Max $27.50")).toBeInTheDocument();
    const pad = screen.getByRole("group", { name: "Keypad" });
    for (const k of "40") await user.click(within(pad).getByRole("button", { name: k }));
    expect(screen.getByText("Max resale price is $27.50")).toBeInTheDocument();
    expect(screen.getByLabelText("40 dollars")).toHaveClass("is-shaking");
    expect(mainButton()).toBeDisabled();
    await user.click(within(pad).getByRole("button", { name: "Delete" }));
    await user.click(within(pad).getByRole("button", { name: "Delete" }));
    for (const k of "26") await user.click(within(pad).getByRole("button", { name: k }));
    expect(mainButton()).toHaveTextContent("List for $26.00");
    await user.click(mainButton());
    expect(await screen.findByText("Listed $26.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel listing" })).toBeInTheDocument();
  });

  it("gift once: after a gift the new owner sees 'Already gifted once'", async () => {
    const { api, ticket } = await ownTicket(SEED_EVENTS.snl);
    await api.giftTicket(ticket.id, "alex");
    const user = renderApp(api.as("alex"));
    await openMyTicket(user, /Solana Night Live.*#084/);
    expect(await screen.findByText("Already gifted once")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gift" })).toBeDisabled();
  });

  it("gift flow: unregistered handles are refused, registered users get it", async () => {
    const { api } = await ownTicket(SEED_EVENTS.snl);
    const user = renderApp(api);
    await openMyTicket(user, /Solana Night Live/);
    await user.click(await screen.findByRole("button", { name: "Gift" }));
    const search = await screen.findByRole("searchbox", { name: "Username" });
    await user.type(search, "newfriend");
    expect(await screen.findByText("@newfriend needs a Pay System account first")).toBeInTheDocument();
    await user.clear(search);
    await user.type(search, "maya");
    await user.click(await screen.findByRole("button", { name: /^@maya,/ }));
    expect(await screen.findByText("You can only gift this ticket once")).toBeInTheDocument();
    await user.click(mainButton());
    expect(await screen.findByText("Ticket sent to @maya")).toBeInTheDocument();
  });

  it("lock window: inside 24 h, Gift and Resell are disabled with the reason", async () => {
    const { api } = await ownTicket(SEED_EVENTS.soon);
    const user = renderApp(api);
    await openMyTicket(user, /Soundcheck Session/);
    expect(await screen.findAllByText("Transfers lock 24 h before the show")).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: "Gift" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Resell" })).toBeDisabled();
  });
});

describe("S16 check-in (organizer)", () => {
  it("admit, then already used", async () => {
    const api = new MockPayApi({ latencyMs: 0 });
    const { ticket } = await api.buyTicket(SEED_EVENTS.snl, intent(2));
    api.__travelTo((await api.getEvent(SEED_EVENTS.snl))!.startsAt);
    const { payload } = await api.getTicketQr(ticket.id);
    const prompt = vi.spyOn(window, "prompt").mockReturnValueOnce(payload).mockReturnValueOnce(payload).mockReturnValue(null);
    const user = renderApp(api);
    await openEvent(user, /Solana Night Live/);
    await screen.findByText("Resale cap $27.50 (110%)");
    expect(mainButton()).toHaveTextContent("Scan tickets");
    await user.click(mainButton());
    expect(await screen.findByText("Admit")).toBeInTheDocument();
    expect(screen.getByText("@sakz · #084")).toBeInTheDocument();
    expect(screen.getByText("Checked in 1 / 120")).toBeInTheDocument();
    // auto-closes after 2 s and reopens the scanner, which reads the same code again
    expect(await screen.findByText("Already used", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(prompt).toHaveBeenCalledTimes(2);
  });
});
