import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { copyFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

function copyKolibriWasm(): Plugin {
  const frontendDir = fileURLToPath(new URL(".", import.meta.url));
  const wasmSource = resolve(frontendDir, "../build/wasm/kolibri.wasm");
  const publicTarget = resolve(frontendDir, "public/kolibri.wasm");
  let copied = false;

  const performCopy = async () => {
    if (copied) {
      return;
    }

    try {
      await access(wasmSource);
    } catch (error) {
      throw new Error(
        `[copy-kolibri-wasm] Не найден ${wasmSource}. Запустите scripts/build_wasm.sh перед npm run build.`,
      );
    }

    await mkdir(dirname(publicTarget), { recursive: true });
    await copyFile(wasmSource, publicTarget);
    copied = true;
  };

  return {
    name: "copy-kolibri-wasm",
    async buildStart() {
      await performCopy();
    },
    async configureServer() {
      await performCopy();
    },
  };
}

export default defineConfig({
  plugins: [react(), copyKolibriWasm()],
  server: {
    port: 5173,
  },
});
