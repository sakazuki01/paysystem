import { useEffect } from "react";
import { Check, ExternalLink } from "lucide-react";
import { Screen } from "../components/Screen";
import { explorerTxUrl, formatUsd, recipientLabel, settledCaption } from "../lib/format";
import { useNav, type SuccessInfo } from "../state/nav";
import { haptic, tg, useMainButton } from "../telegram/telegram";

function headline({ kind, amountCents, counterparty, toAddress }: SuccessInfo): string {
  const amount = formatUsd(amountCents);
  if (kind === "received") return `You received ${amount} from @${counterparty}`;
  if (kind === "refunded") return `Refunded ${amount}`;
  if (kind === "ticket") return `You're going to ${counterparty}`;
  if (kind === "gift") return `Ticket sent to @${counterparty}`;
  return `Sent ${amount} to ${recipientLabel({ handle: counterparty, toAddress })}`;
}

/** S8 — Success. The one celebratory moment. */
export function Success({ info }: { info: SuccessInfo }) {
  const nav = useNav();

  useEffect(() => {
    haptic.success();
  }, []);

  useMainButton({
    text: "Done",
    onClick: () =>
      info.next === "username"
        ? nav.reset([{ name: "home" }, { name: "username", afterClaim: true }])
        : nav.reset([{ name: "home" }]),
  });

  return (
    <Screen label="Success" className="success">
      <div className="success__mark" aria-hidden="true">
        <Check size={44} strokeWidth={3} />
      </div>
      <h1 className="title success__title" aria-live="polite">{headline(info)}</h1>
      {info.kind === "refunded" && <p className="body caption--muted">It's back in your balance</p>}
      {info.escrow && <p className="body caption--muted">They have 7 days to claim it</p>}
      <p className="caption caption--muted tabular">
        {info.kind === "ticket" && info.ticketNo !== undefined
          ? `Ticket #${String(info.ticketNo).padStart(3, "0")} · ${settledCaption(info.settleMs).replace(" · Free", "")}`
          : settledCaption(info.settleMs)}
      </p>
      <button type="button" className="link-button" onClick={() => tg().openLink(explorerTxUrl(info.signature))}>
        View on explorer
        <ExternalLink size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    </Screen>
  );
}
