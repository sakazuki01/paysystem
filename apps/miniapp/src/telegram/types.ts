// The subset of window.Telegram.WebApp we use. Real API: https://core.telegram.org/bots/webapps

export interface ThemeParams {
  bg_color?: string;
  secondary_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  section_separator_color?: string;
}

export interface MainButtonParams {
  text?: string;
  color?: string;
  text_color?: string;
  is_active?: boolean;
  is_visible?: boolean;
}

export interface MainButton {
  text: string;
  isVisible: boolean;
  isActive: boolean;
  isProgressVisible: boolean;
  setParams(params: MainButtonParams): MainButton;
  show(): MainButton;
  hide(): MainButton;
  enable(): MainButton;
  disable(): MainButton;
  showProgress(leaveActive?: boolean): MainButton;
  hideProgress(): MainButton;
  onClick(cb: () => void): MainButton;
  offClick(cb: () => void): MainButton;
}

export interface BackButton {
  isVisible: boolean;
  show(): BackButton;
  hide(): BackButton;
  onClick(cb: () => void): BackButton;
  offClick(cb: () => void): BackButton;
}

export interface HapticFeedback {
  impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): HapticFeedback;
  notificationOccurred(type: "error" | "success" | "warning"): HapticFeedback;
  selectionChanged(): HapticFeedback;
}

export interface WebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export interface WebApp {
  initData: string;
  initDataUnsafe: { user?: WebAppUser; start_param?: string };
  platform: string;
  colorScheme: "light" | "dark";
  themeParams: ThemeParams;
  MainButton: MainButton;
  BackButton: BackButton;
  HapticFeedback: HapticFeedback;
  ready(): void;
  expand(): void;
  onEvent(event: "themeChanged", cb: () => void): void;
  offEvent(event: "themeChanged", cb: () => void): void;
  openLink(url: string): void;
  openTelegramLink(url: string): void;
  /** Return true from the callback to close the scanner. */
  showScanQrPopup(params: { text?: string }, callback: (data: string) => boolean | void): void;
  closeScanQrPopup(): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: WebApp };
  }
}
