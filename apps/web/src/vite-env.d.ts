/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRANSPORT?: string;
  readonly VITE_UPSTREAM_ORIGIN?: string;
  readonly VITE_API_URL: string;
}
