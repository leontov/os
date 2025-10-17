import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/tailwind.css";
import { wasmUrl, wasmInfoUrl, wasmAvailable, wasmIsStub } from "virtual:kolibri-wasm";
import { knowledgeUrl as knowledgeBundleUrl, knowledgeAvailable as knowledgeBundleAvailable } from "virtual:kolibri-knowledge";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.env.PROD && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  const register = async () => {
    try {
      await navigator.serviceWorker.register("/kolibri-sw.js");
      const registration = await navigator.serviceWorker.ready;
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
