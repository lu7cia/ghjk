/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional self-hosted Pyodide distribution, for offline use. */
  readonly VITE_PYODIDE_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
