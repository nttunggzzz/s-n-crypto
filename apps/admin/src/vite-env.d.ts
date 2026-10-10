/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCKS: string;
  readonly VITE_EXCHANGE_ORIGIN: string;
  readonly VITE_ADMIN_ORIGIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
