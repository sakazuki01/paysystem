import { useEffect, useRef, useState } from "react";
import { validateUsername } from "@pay-system/shared";
import { PayApiError, type UsernameCheck } from "../api/PayApi";
import { Screen } from "../components/Screen";
import { Banner } from "../components/primitives";
import { UsernameInput, type UsernameStatus } from "../components/UsernameInput";
import { errorCopy, LOAD_ERROR } from "../lib/errors";
import { useApp } from "../state/app";
import { useNav } from "../state/nav";
import { haptic, useMainButton } from "../telegram/telegram";

const DEBOUNCE_MS = 300;

function fromCheck(name: string, c: UsernameCheck): UsernameStatus {
  switch (c.status) {
    case "available":
      return { state: "available", name };
    case "taken":
      return { state: "taken", name };
    case "lookalike":
      return { state: "lookalike", of: c.of };
    case "invalid":
      return { state: "invalid" };
    case "reserved":
      return { state: "reserved" };
  }
}

/** S2 — Pick your username. */
export function PickUsername({ afterClaim = false }: { afterClaim?: boolean }) {
  const { api, me, setMe, invalidate } = useApp();
  const nav = useNav();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<UsernameStatus>({ state: "idle" });
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  // Prefill with the Telegram handle, but only if it's valid and available.
  useEffect(() => {
    const handle = me.telegramHandle;
    const v = validateUsername(handle);
    if (!v.ok) return;
    const id = ++seq.current;
    api.checkUsername(v.normalized).then(
      (c) => {
        if (id !== seq.current || c.status !== "available") return;
        setValue(v.normalized);
        setStatus({ state: "available", name: v.normalized });
      },
      () => {},
    );
  }, [api, me.telegramHandle]);

  function onChange(next: string) {
    setValue(next);
    setError(null);
    const id = ++seq.current;
    if (!next) {
      setStatus({ state: "idle" });
      return;
    }
    setStatus({ state: "checking" });
    setTimeout(async () => {
      if (id !== seq.current) return;
      // Same rules the program enforces (packages/shared), so invalid/reserved never hit the network.
      const v = validateUsername(next);
      if (!v.ok) {
        setStatus({ state: v.error === "ReservedUsername" ? "reserved" : "invalid" });
        return;
      }
      try {
        const c = await api.checkUsername(v.normalized);
        if (id === seq.current) setStatus(fromCheck(v.normalized, c));
      } catch (e) {
        if (id === seq.current) setStatus({ state: "error", message: LOAD_ERROR });
      }
    }, DEBOUNCE_MS);
  }

  async function claim() {
    if (status.state !== "available") return;
    setClaiming(true);
    setError(null);
    try {
      const updated = await api.claimUsername(status.name);
      haptic.success();
      setMe(updated);
      invalidate();
      nav.reset([{ name: "home" }]);
    } catch (e) {
      haptic.error();
      setClaiming(false);
      if (e instanceof PayApiError && e.code === "username_unavailable") {
        // Someone took it (or a lookalike) between check and claim: re-check to show why.
        onChange(status.name);
      } else {
        setError(errorCopy(e, { username: me.username }));
      }
    }
  }

  useMainButton({
    text: claiming ? "Claiming…" : status.state === "available" ? `Claim @${status.name}` : "Claim",
    progress: claiming,
    disabled: status.state !== "available",
    onClick: claim,
  });

  return (
    <Screen label="Pick your username" className="pick">
      <div className="pick__head">
        <h1 className="title">Pick your username</h1>
        <p className="body caption--muted">
          {afterClaim ? "Pick a username so friends can pay you directly" : "This is how friends pay you."}
        </p>
      </div>
      <UsernameInput value={value} onChange={onChange} status={status} disabled={claiming} />
      {error && <Banner variant="danger">{error}</Banner>}
    </Screen>
  );
}
