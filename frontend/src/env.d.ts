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

declare module "virtual:kolibri-knowledge" {
  export const knowledgeUrl: string;
  export const knowledgeHash: string;
  export const knowledgeAvailable: boolean;
  export const knowledgeError: string;
  export interface KolibriFaqEntry {
    slug: string;
    section: string;
    question: string;
    answer: string;
    language: "ru";
  }
  export const faqEntries: KolibriFaqEntry[];
  export const faqGeneratedAt: string;
  export const faqAvailable: boolean;
}
