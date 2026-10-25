import { useEffect, useRef } from "react";
import { installDevShim, isRealTelegram } from "./devShim";
import { useOnline } from "../state/online";
import type { ThemeParams, WebApp } from "./types";

let webApp: WebApp | null = null;

/** The Telegram WebApp, or the dev shim when not running inside Telegram. */
export function tg(): WebApp {
  if (webApp) return webApp;
  if (isRealTelegram()) {
    webApp = window.Telegram!.WebApp;
  } else {
    const params = new URLSearchParams(window.location.search);
    const theme = params.get("theme");
    webApp = installDevShim({
      scheme: theme === "dark" ? "dark" : theme === "light" ? "light" : prefersDark() ? "dark" : "light",
      startParam: params.get("startapp") ?? undefined,
    });
  }
  return webApp;
}

/** Test helper: forget the cached instance (pair with uninstallDevShim). */
export function resetTg() {
  webApp = null;
}

function prefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

const THEME_VARS: [keyof ThemeParams, string][] = [
  ["bg_color", "--tg-theme-bg-color"],
  ["secondary_bg_color", "--tg-theme-secondary-bg-color"],
  ["text_color", "--tg-theme-text-color"],
  ["hint_color", "--tg-theme-hint-color"],
  ["section_separator_color", "--tg-theme-section-separator-color"],
];

/** Maps themeParams onto --tg-theme-* and sets html[data-theme] (our brand colours key off it). */
export function applyTheme(app: WebApp = tg()) {
  const root = document.documentElement;
  root.dataset.theme = app.colorScheme;
  for (const [key, cssVar] of THEME_VARS) {
    const value = app.themeParams[key];
    if (value) root.style.setProperty(cssVar, value);
    else root.style.removeProperty(cssVar);
  }
}

export function brandColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#7C5CFF";
}

export const haptic = {
  tap: () => tg().HapticFeedback.impactOccurred("light"),
  success: () => tg().HapticFeedback.notificationOccurred("success"),
  error: () => tg().HapticFeedback.notificationOccurred("error"),
  warning: () => tg().HapticFeedback.notificationOccurred("warning"),
};

export interface MainButtonConfig {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  progress?: boolean;
  visible?: boolean;
}

/**
 * Drives the Telegram MainButton for the current screen. The screen that calls this owns
 * the button while mounted; it is hidden on unmount.
 */
export function useMainButton({ text, onClick, disabled = false, progress = false, visible = true }: MainButtonConfig) {
  // Spec §7: offline disables the MainButton everywhere.
  const online = useOnline();
  disabled = disabled || !online;
  const handler = useRef(onClick);
  handler.current = onClick;

  useEffect(() => {
    const mb = tg().MainButton;
    const cb = () => handler.current();
    mb.onClick(cb);
    return () => {
      mb.offClick(cb);
      mb.hideProgress();
      mb.hide();
    };
  }, []);

  useEffect(() => {
    const mb = tg().MainButton;
    mb.setParams({
      text,
      color: brandColor(),
      text_color: "#FFFFFF",
      is_active: !disabled,
      is_visible: visible,
    });
    if (progress) mb.showProgress(false);
    else mb.hideProgress();
  }, [text, disabled, progress, visible]);
}
