/// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_KOLIBRI_RESPONSE_MODE?: string;
  readonly VITE_KOLIBRI_API_BASE?: string;
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "virtual:kolibri-wasm" {
  export const wasmUrl: string;
  export const wasmInfoUrl: string;
  export const wasmHash: string;
  export const wasmAvailable: boolean;
  export const wasmIsStub: boolean;
  export const wasmError: string;
}
