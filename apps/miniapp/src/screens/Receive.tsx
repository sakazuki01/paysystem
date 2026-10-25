import { QRCodeSVG } from "qrcode.react";
import { Screen } from "../components/Screen";
import { Fingerprint } from "../components/primitives";
import { payLink } from "../config";
import { useApp } from "../state/app";
import { haptic, tg, useMainButton } from "../telegram/telegram";

/** S9 — Receive. */
export function Receive() {
  const { me } = useApp();
  const username = me.username ?? me.telegramHandle;
  const link = payLink(username);

  useMainButton({
    text: "Share",
    onClick: () => {
      haptic.tap();
      const text = `Pay me on Pay System: @${username}`;
      tg().openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
    },
  });

  return (
    <Screen label="Receive" className="receive">
      <h1 className="receive__name">@{username}</h1>
      {/* Always dark-on-white: scanners need the contrast regardless of theme. */}
      <div className="receive__qr" role="img" aria-label={`QR code for ${link}`}>
        <QRCodeSVG value={link} size={208} level="M" bgColor="#FFFFFF" fgColor="#0F1115" marginSize={0} />
      </div>
      <div className="detail-list">
        <div className="detail-row">
          <span className="detail-row__label">Wallet address</span>
          <Fingerprint address={me.walletAddress} />
        </div>
      </div>
    </Screen>
  );
}
