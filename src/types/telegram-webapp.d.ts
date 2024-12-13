interface PopupButton {
  id?: string;
  type: 'ok' | 'close' | 'cancel';
  text?: string;
}

interface PopupParams {
  title?: string;
  message: string;
  buttons: PopupButton[];
}

interface WebApp {
  ready(): void;
  expand(): void;
  close(): void;
  showAlert(message: string): void;
  showPopup(params: PopupParams): void;
  MainButton: {
    show(): void;
    hide(): void;
    enable(): void;
    disable(): void;
    showProgress(leaveActive: boolean): void;
    hideProgress(): void;
    setText(text: string): void;
    onClick(callback: () => void): void;
    offClick(callback: () => void): void;
  };
}

interface TelegramWebAppNamespace {
  WebApp: WebApp;
}

declare global {
  interface Window {
    Telegram: TelegramWebAppNamespace;
  }
}

export {}; 