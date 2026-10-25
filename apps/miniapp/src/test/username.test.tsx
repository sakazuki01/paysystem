import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { MockPayApi } from "../api/MockPayApi";

const mainButton = () => document.querySelector<HTMLButtonElement>(".tg-shim-main")!;

async function openPickUsername() {
  const api = new MockPayApi({ latencyMs: 0, me: "newfriend" });
  const user = userEvent.setup();
  render(<App api={api} />);
  expect(await screen.findByText("Send dollars to any @username")).toBeInTheDocument();
  expect(screen.getByText("No seed phrase, no fees. Just Telegram.")).toBeInTheDocument();
  expect(mainButton()).toHaveTextContent("Get started");
  await user.click(mainButton());
  expect(await screen.findByText("Pick your username")).toBeInTheDocument();
  return { api, user, input: screen.getByRole("textbox", { name: "Username" }) };
}

describe("S1 → S2 pick username", () => {
  it("prefills the Telegram handle when it's available", async () => {
    const { input } = await openPickUsername();
    expect(await screen.findByText("@newfriend is yours to claim")).toBeInTheDocument();
    expect(input).toHaveValue("newfriend");
    expect(mainButton()).toHaveTextContent("Claim @newfriend");
    expect(mainButton()).toBeEnabled();
  });

  it("rejects the lookalike @5akz with the warning copy", async () => {
    const { user, input } = await openPickUsername();
    await screen.findByText("@newfriend is yours to claim");
    await user.clear(input);
    await user.type(input, "5akz");
    expect(await screen.findByText("Too similar to @sakz — pick something more distinct")).toBeInTheDocument();
    expect(mainButton()).toBeDisabled();
    expect(mainButton()).toHaveTextContent(/^Claim$/);
  });

  it.each([
    ["alex", "@alex is taken"],
    ["ab", "3–20 characters: letters, numbers and _"],
    ["al-ex", "3–20 characters: letters, numbers and _"],
    ["admin", "That name is reserved"],
  ])("%s → %s", async (name, copy) => {
    const { user, input } = await openPickUsername();
    await screen.findByText("@newfriend is yours to claim");
    await user.clear(input);
    await user.type(input, name);
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(mainButton()).toBeDisabled();
  });

  it("lowercases as you type and shows Checking… before the result", async () => {
    const { user, input } = await openPickUsername();
    await screen.findByText("@newfriend is yours to claim");
    await user.clear(input);
    await user.type(input, "CoolName");
    expect(input).toHaveValue("coolname");
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(await screen.findByText("@coolname is yours to claim")).toBeInTheDocument();
  });

  it("validation lives in an aria-live region", async () => {
    await openPickUsername();
    const status = await screen.findByText("@newfriend is yours to claim");
    expect(status.closest("[aria-live='polite']")).not.toBeNull();
  });

  it("claims and lands on Home as the new username", async () => {
    const { user } = await openPickUsername();
    await screen.findByText("@newfriend is yours to claim");
    await user.click(mainButton());
    expect(await screen.findByRole("button", { name: "@newfriend, open Receive" })).toBeInTheDocument();
  });
});
