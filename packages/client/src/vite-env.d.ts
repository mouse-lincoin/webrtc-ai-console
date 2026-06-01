/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SIGNAL_URL?: string;
  readonly VITE_ROOM_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
