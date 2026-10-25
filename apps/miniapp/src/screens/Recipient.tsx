import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { normalize } from "@pay-system/shared";
import { Screen } from "../components/Screen";
import { Avatar, Banner } from "../components/primitives";
import { UserRow, UserSummaryRow } from "../components/rows";
import { didYouMean } from "../lib/didYouMean";
import { NETWORK_ERROR } from "../lib/errors";
import { plural } from "../lib/plural";
import { useApp, useAsync } from "../state/app";
import { useNav } from "../state/nav";
import { useToast } from "../state/toast";
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
  const q = normalize(input.trim().replace(/^@/, ""));
  const debounced = useDebounced(q, 200);

  const recent = useAsync(() => api.getRecentRecipients());
  const results = useAsync(() => (debounced ? api.searchUsers(debounced) : Promise.resolve([])), [debounced]);
  const searching = q !== debounced || results.loading;

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

  return (
    <Screen label="Choose recipient">
      <label className="search">
        <Search size={20} strokeWidth={2} aria-hidden="true" className="search__icon" />
        <input
          type="search"
          className="search__input"
          placeholder="Username or @handle"
          aria-label="Username or @handle"
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </label>

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
    </Screen>
  );
}
