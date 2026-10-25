import { Screen } from "../components/Screen";
import { Logo } from "../components/primitives";
import { useNav } from "../state/nav";
import { useMainButton } from "../telegram/telegram";

/** S1 — Welcome (first open only). Sign-in already happened at boot via initData. */
export function Welcome() {
  const nav = useNav();
  useMainButton({ text: "Get started", onClick: () => nav.push({ name: "username" }) });

  return (
    <Screen label="Welcome" className="welcome">
      <Logo size={88} />
      <h1 className="title welcome__title">Send dollars to any @username</h1>
      <p className="body caption--muted">No seed phrase, no fees. Just Telegram.</p>
    </Screen>
  );
}
