/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCKS: string;
  readonly VITE_EXCHANGE_ORIGIN: string;
  readonly VITE_ADMIN_ORIGIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  turnstile?: {
    render: (
      container: HTMLElement,
      options: {
        sitekey: string;
        callback: (token: string) => void;
      }
    ) => string;
    reset?: (widgetId: string) => void;
  };
}
