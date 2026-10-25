import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useOnline } from "./online";

const ToastContext = createContext<(text: string) => void>(() => {});

const TOAST_MS = 2500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback((t: string) => {
    clearTimeout(timer.current);
    setText(t);
    timer.current = setTimeout(() => setText(null), TOAST_MS);
  }, []);

  const online = useOnline();
  useEffect(() => {
    if (!online) show("You're offline");
  }, [online, show]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {text && <div className="toast">{text}</div>}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
