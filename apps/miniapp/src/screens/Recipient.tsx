import { useEffect, useState } from "react";
import { AlertCircle, ClipboardPaste, ScanLine, Search } from "lucide-react";
import { normalize, parseRecipient } from "@pay-system/shared";
import { Screen } from "../components/Screen";
import { Avatar, Banner } from "../components/primitives";
import { UserRow, UserSummaryRow } from "../components/rows";
import { didYouMean } from "../lib/didYouMean";
import { NETWORK_ERROR } from "../lib/errors";
import { fingerprint } from "../lib/format";
import { plural } from "../lib/plural";
import { useApp, useAsync } from "../state/app";
import { useNav } from "../state/nav";
import { useToast } from "../state/toast";
import { haptic, tg } from "../telegram/telegram";
import { RowSkeletons } from "./Home";

const HANDLE_RE = /^[a-z0-9_]{3,32}$/;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** S4 — Send: choose recipient. No MainButton: tapping a row is the action. */
export function Recipient() {
  const { api, me } = useApp();
  const nav = useNav();
  const toast = useToast();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  // Addresses are case-sensitive: parse the raw input; usernames/handles use the lowercased query.
  const parsed = parseRecipient(input);
  const address = parsed.kind === "address" ? parsed : null;
  const q = address ? "" : normalize(input.trim().replace(/^@/, ""));
  const debounced = useDebounced(q, 200);

  const recent = useAsync(() => api.getRecentRecipients());
  const results = useAsync(() => (debounced ? api.searchUsers(debounced) : Promise.resolve([])), [debounced]);
  const searching = q !== debounced || results.loading;

  const ownWallet = address?.address === me.walletAddress;
  const checkable = address?.validity === "ok" && !ownWallet ? address.address : null;
  const owner = useAsync(
    async () => {
      if (!checkable) return null;
      const { username } = await api.resolveAddress(checkable);
      return username ? api.getRecipientInfo(username) : null;
    },
    [checkable],
  );

  const suggestion = q ? didYouMean(q, recent.data ?? []) : null;
  const exact = results.data?.some((u) => u.username === q);
  const self = q === me.username;
  const showEscrow = !searching && debounced === q && HANDLE_RE.test(q) && !exact && !self;

  async function choose(handle: string) {
    if (busy) return;
    setBusy(true);
    try {
      const recipient = await api.getRecipientInfo(handle);
      nav.push({ name: "amount", recipient });
    } catch {
      toast(NETWORK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  function chooseWallet(addr: string) {
    haptic.tap();
    nav.push({ name: "amount", recipient: { handle: "", exists: false, timesPaid: 0, toAddress: addr } });
  }

  async function paste() {
    haptic.tap();
    try {
      setInput((await navigator.clipboard.readText()).trim());
    } catch {
      toast("Couldn't read clipboard");
    }
  }

  function scan() {
    haptic.tap();
    tg().showScanQrPopup({ text: "Scan a wallet address" }, (data) => {
      setInput(data.trim());
      return true;
    });
  }

  const addressError = !address
    ? null
    : address.validity === "invalid"
      ? "That's not a valid Solana address"
      : address.validity === "offCurve"
        ? "This address can't receive payments"
        : ownWallet
          ? "That's your own wallet"
          : null;

  return (
    <Screen label="Choose recipient">
      <div className="search">
        <Search size={20} strokeWidth={2} aria-hidden="true" className="search__icon" />
        <input
          type="search"
          className="search__input"
          placeholder="Username, @handle or wallet address"
          aria-label="Username, @handle or wallet address"
          aria-describedby={addressError ? "address-error" : undefined}
          aria-invalid={addressError ? true : undefined}
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="button" className="search__tool" aria-label="Paste" onClick={paste}>
          <ClipboardPaste size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        <button type="button" className="search__tool" aria-label="Scan QR code" onClick={scan}>
          <ScanLine size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {address ? (
        addressError ? (
          <p id="address-error" className="helper helper--danger" role="alert">
            <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
            {addressError}
          </p>
        ) : owner.loading && owner.data === undefined ? (
          <RowSkeletons count={1} />
        ) : owner.data ? (
          <div className="list">
            <UserRow
              title={`@${owner.data.handle}`}
              caption={`Wallet of @${owner.data.handle}`}
              avatar={<Avatar name={owner.data.displayName ?? owner.data.handle} src={owner.data.avatarUrl} />}
              disabled={busy}
              onClick={() => choose(owner.data!.handle)}
            />
          </div>
        ) : (
          <div className="list">
            <UserRow
              title="Send to wallet"
              caption={fingerprint(address.address)}
              captionMono
              avatar={<Avatar name="" wallet />}
              onClick={() => chooseWallet(address.address)}
            />
          </div>
        )
      ) : (
        <>
          {suggestion && (
            <Banner
              variant="warning"
              onClick={() => choose(suggestion.username)}
              label={`Did you mean @${suggestion.username}? You've paid them ${plural(suggestion.timesPaid, "time")}.`}
            >
              Did you mean <strong>@{suggestion.username}</strong>? You've paid them {plural(suggestion.timesPaid, "time")}.
            </Banner>
          )}

          {!q ? (
            recent.data === undefined && recent.loading ? (
              <RowSkeletons />
            ) : recent.data === undefined ? (
              <Banner variant="danger" action={{ label: "Try again", onClick: recent.reload }}>
                {NETWORK_ERROR}
              </Banner>
            ) : recent.data.length > 0 ? (
              <section className="section" aria-labelledby="recent-title">
                <h2 id="recent-title" className="section__title">Recent</h2>
                <div className="list">
                  {recent.data.map((u) => (
                    <UserSummaryRow key={u.username} user={u} disabled={busy} onClick={() => choose(u.username)} />
                  ))}
                </div>
              </section>
            ) : null
          ) : (
            <div className="list" aria-busy={searching}>
              {results.error !== undefined && !searching ? (
                <Banner variant="danger" action={{ label: "Try again", onClick: results.reload }}>
                  {NETWORK_ERROR}
                </Banner>
              ) : null}
              {(results.data ?? []).map((u) => (
                <UserSummaryRow key={u.username} user={u} disabled={busy} onClick={() => choose(u.username)} />
              ))}
              {showEscrow && (
                <UserRow
                  title={`Send to @${q} on Telegram`}
                  caption="They'll get a link to claim it"
                  avatar={<Avatar name={q} link />}
                  disabled={busy}
                  onClick={() => choose(q)}
                />
              )}
              {searching && !results.data?.length && <RowSkeletons count={2} />}
            </div>
          )}
        </>
      )}
    </Screen>
  );
}
