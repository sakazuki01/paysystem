// Dev/test stand-in for window.Telegram.WebApp when running outside Telegram.
// Renders MainButton (fixed bottom) and BackButton (top-left) as plain DOM, styled like
// Telegram's, plus a light/dark toggle. Real Telegram APIs are used whenever present.

import type { BackButton, HapticFeedback, MainButton, MainButtonParams, ThemeParams, WebApp } from "./types";

export const SHIM_THEMES: Record<"light" | "dark", ThemeParams> = {
  light: {
    bg_color: "#ffffff",
    secondary_bg_color: "#f2f3f5",
    text_color: "#0f1115",
    hint_color: "#6b7280",
    link_color: "#6a45f5",
    button_color: "#6a45f5",
    button_text_color: "#ffffff",
    section_separator_color: "#e5e7eb",
  },
  dark: {
    bg_color: "#17181c",
    secondary_bg_color: "#1f2026",
    text_color: "#f4f5f7",
    hint_color: "#9097a3",
    link_color: "#8f74ff",
    button_color: "#6f52f0",
    button_text_color: "#ffffff",
    section_separator_color: "#2c2e36",
  },
};

/** True when we're inside a real Telegram client (telegram-web-app.js also loads in a plain browser). */
export function isRealTelegram(): boolean {
  const tg = window.Telegram?.WebApp;
  return !!tg && !!tg.initData && tg.platform !== "unknown";
}

let installed: { root: HTMLElement; webApp: WebApp } | null = null;

export function installDevShim(opts: { scheme?: "light" | "dark"; startParam?: string } = {}): WebApp {
  if (installed) return installed.webApp;

  const root = document.createElement("div");
  root.className = "tg-shim";
  root.setAttribute("data-tg-shim", "");

  const topBar = document.createElement("div");
  topBar.className = "tg-shim-top";

  const backEl = document.createElement("button");
  backEl.type = "button";
  backEl.className = "tg-shim-back";
  backEl.setAttribute("aria-label", "Back");
  backEl.innerHTML =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  backEl.hidden = true;

  const themeEl = document.createElement("button");
  themeEl.type = "button";
  themeEl.className = "tg-shim-theme";

  topBar.append(backEl, themeEl);

  const mainEl = document.createElement("button");
  mainEl.type = "button";
  mainEl.className = "tg-shim-main";
  mainEl.hidden = true;
  const mainLabel = document.createElement("span");
  const mainSpinner = document.createElement("span");
  mainSpinner.className = "tg-shim-spinner";
  mainSpinner.setAttribute("aria-hidden", "true");
  mainSpinner.hidden = true;
  mainEl.append(mainSpinner, mainLabel);

  root.append(topBar, mainEl);
  document.body.append(root);

  // ---- MainButton ----
  const mainClicks = new Set<() => void>();
  const main: MainButton = {
    text: "",
    isVisible: false,
    isActive: true,
    isProgressVisible: false,
    setParams(p: MainButtonParams) {
      if (p.text !== undefined) main.text = p.text;
      if (p.color) mainEl.style.background = p.color;
      if (p.text_color) mainEl.style.color = p.text_color;
      if (p.is_active !== undefined) main.isActive = p.is_active;
      if (p.is_visible !== undefined) main.isVisible = p.is_visible;
      render();
      return main;
    },
    show: () => main.setParams({ is_visible: true }),
    hide: () => main.setParams({ is_visible: false }),
    enable: () => main.setParams({ is_active: true }),
    disable: () => main.setParams({ is_active: false }),
    showProgress() {
      main.isProgressVisible = true;
      render();
      return main;
    },
    hideProgress() {
      main.isProgressVisible = false;
      render();
      return main;
    },
    onClick(cb) {
      mainClicks.add(cb);
      return main;
    },
    offClick(cb) {
      mainClicks.delete(cb);
      return main;
    },
  };
  mainEl.addEventListener("click", () => {
    if (!main.isActive || main.isProgressVisible) return;
    mainClicks.forEach((cb) => cb());
  });

  function render() {
    mainEl.hidden = !main.isVisible;
    mainLabel.textContent = main.text;
    mainSpinner.hidden = !main.isProgressVisible;
    mainLabel.style.visibility = main.isProgressVisible ? "hidden" : "visible";
    mainEl.disabled = !main.isActive;
    mainEl.setAttribute("aria-busy", String(main.isProgressVisible));
    document.documentElement.style.setProperty("--shim-bottom", main.isVisible ? "72px" : "0px");
  }

  // ---- BackButton ----
  const backClicks = new Set<() => void>();
  const back: BackButton = {
    isVisible: false,
    show() {
      back.isVisible = true;
      backEl.hidden = false;
      return back;
    },
    hide() {
      back.isVisible = false;
      backEl.hidden = true;
      return back;
    },
    onClick(cb) {
      backClicks.add(cb);
      return back;
    },
    offClick(cb) {
      backClicks.delete(cb);
      return back;
    },
  };
  backEl.addEventListener("click", () => backClicks.forEach((cb) => cb()));

  // ---- Haptics: no-op ----
  const haptic: HapticFeedback = {
    impactOccurred(style) {
      console.debug("[haptic] impact", style);
      return haptic;
    },
    notificationOccurred(type) {
      console.debug("[haptic] notification", type);
      return haptic;
    },
    selectionChanged() {
      console.debug("[haptic] selection");
      return haptic;
    },
  };

  // ---- Theme ----
  const themeListeners = new Set<() => void>();
  const webApp: WebApp = {
    initData: "",
    initDataUnsafe: {
      user: { id: 1, first_name: "Dev", username: "dev" },
      start_param: opts.startParam,
    },
    platform: "dev-shim",
    colorScheme: opts.scheme ?? "light",
    themeParams: { ...SHIM_THEMES[opts.scheme ?? "light"] },
    MainButton: main,
    BackButton: back,
    HapticFeedback: haptic,
    ready() {},
    expand() {},
    onEvent(_e, cb) {
      themeListeners.add(cb);
    },
    offEvent(_e, cb) {
      themeListeners.delete(cb);
    },
    openLink(url) {
      window.open(url, "_blank", "noopener");
    },
    openTelegramLink(url) {
      window.open(url, "_blank", "noopener");
    },
  };

  function renderThemeToggle() {
    const next = webApp.colorScheme === "light" ? "dark" : "light";
    themeEl.textContent = next === "dark" ? "Dark" : "Light";
    themeEl.setAttribute("aria-label", `Switch to ${next} theme (dev only)`);
  }
  themeEl.addEventListener("click", () => {
    setShimScheme(webApp.colorScheme === "light" ? "dark" : "light");
  });

  function setShimScheme(scheme: "light" | "dark") {
    webApp.colorScheme = scheme;
    webApp.themeParams = { ...SHIM_THEMES[scheme] };
    renderThemeToggle();
    themeListeners.forEach((cb) => cb());
  }
  shimSetScheme = setShimScheme;

  renderThemeToggle();
  render();
  document.documentElement.style.setProperty("--shim-top", "44px");
  window.Telegram = { WebApp: webApp };
  installed = { root, webApp };
  return webApp;
}

let shimSetScheme: ((s: "light" | "dark") => void) | null = null;

/** Dev/test helper: flip the fake Telegram theme and fire themeChanged. */
export function setShimScheme(scheme: "light" | "dark") {
  shimSetScheme?.(scheme);
}

/** Test helper: remove the shim so the next install starts clean. */
export function uninstallDevShim() {
  if (!installed) return;
  installed.root.remove();
  delete window.Telegram;
  installed = null;
  shimSetScheme = null;
}
