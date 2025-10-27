import React from "react";
import ReactDOM from "react-dom/client";
import { AppProviders } from "./app/providers";
import { AppRouter } from "./app/router";
import { wasmUrl, wasmInfoUrl, wasmAvailable, wasmIsStub } from "virtual:kolibri-wasm";
import { knowledgeUrl as knowledgeBundleUrl, knowledgeAvailable as knowledgeBundleAvailable } from "virtual:kolibri-knowledge";
import { knowledgeStrategy } from "./core/knowledge";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppProviders>
      <AppRouter />
    </AppProviders>
  </React.StrictMode>,
);

const resolveBaseUrl = (): URL => {
  const base = import.meta.env.BASE_URL ?? "/";

  if (typeof window === "undefined") {
    return new URL(base, "https://kolibri.invalid/");
  }

  try {
    return new URL(base, window.location.href);
  } catch (error) {
    console.warn("[kolibri-sw] Не удалось вычислить базовый путь, использую текущий URL.", error);
    return new URL(window.location.href);
  }
};

if (import.meta.env.PROD && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  const baseUrl = resolveBaseUrl();
  const register = async () => {
    try {
      const serviceWorkerUrl = new URL("kolibri-sw.js", baseUrl);
      const scopeUrl = new URL(".", serviceWorkerUrl);
      await navigator.serviceWorker.register(serviceWorkerUrl.toString(), { scope: scopeUrl.href });
      const registration = await navigator.serviceWorker.ready;
      registration.active?.postMessage({
        type: "SET_KNOWLEDGE_MODE",
        mode: knowledgeStrategy,
      });
      if (wasmAvailable && !wasmIsStub && wasmUrl) {
        registration.active?.postMessage({
          type: "SET_WASM_ARTIFACTS",
          url: wasmUrl,
          infoUrl: wasmInfoUrl,
        });
      }
      if (knowledgeBundleAvailable && knowledgeBundleUrl) {
        registration.active?.postMessage({
          type: "SET_KNOWLEDGE_ARTIFACTS",
          url: knowledgeBundleUrl,
        });
      }
    } catch (error) {
      console.warn("[kolibri-sw] Не удалось зарегистрировать сервис-воркер.", error);
    }
  };

  void register();
}
