import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { Me, PayApi } from "../api/PayApi";

interface AppState {
  api: PayApi;
  me: Me;
  setMe(me: Me): void;
  /** Bumped after any write so screens refetch balance/activity. */
  dataVersion: number;
  invalidate(): void;
  /** S5 draft survives S6 failures and back-navigation. */
  draft: { raw: string; note: string };
  setDraft: Dispatch<SetStateAction<{ raw: string; note: string }>>;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ api, me: initialMe, children }: { api: PayApi; me: Me; children: ReactNode }) {
  const [me, setMe] = useState(initialMe);
  const [dataVersion, setDataVersion] = useState(0);
  const [draft, setDraft] = useState({ raw: "", note: "" });
  const invalidate = useCallback(() => setDataVersion((v) => v + 1), []);
  return (
    <AppContext.Provider value={{ api, me, setMe, dataVersion, invalidate, draft, setDraft }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppState {
  const app = useContext(AppContext);
  if (!app) throw new Error("useApp outside AppProvider");
  return app;
}

export interface Async<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload(): void;
}

/** Fetch on mount and whenever deps or the app's dataVersion change. Keeps stale data while reloading. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): Async<T> {
  const { dataVersion } = useApp();
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let live = true;
    setState((s) => ({ data: s.data, loading: true }));
    fnRef.current().then(
      (data) => live && setState({ data, loading: false }),
      (error) => live && setState((s) => ({ data: s.data, error, loading: false })),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion, nonce, ...deps]);

  return { data: state.data, error: state.error, loading: state.loading, reload: () => setNonce((n) => n + 1) };
}
