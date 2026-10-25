/** Telegram bot that hosts the Mini App (deep links: t.me/<bot>/app?startapp=...). */
export const BOT_USERNAME: string = import.meta.env.VITE_BOT_USERNAME ?? "PaySystemBot";

export const payLink = (username: string) => `https://t.me/${BOT_USERNAME}/app?startapp=pay_${username}`;
