import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { copyFile, mkdir, access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function copyKolibriWasm(): Plugin {
  const frontendDir = fileURLToPath(new URL(".", import.meta.url));
  const wasmSource = resolve(frontendDir, "../build/wasm/kolibri.wasm");
  const wasmBuilder = resolve(frontendDir, "../scripts/build_wasm.sh");
  const wasmInfoSource = resolve(frontendDir, "../build/wasm/kolibri.wasm.txt");
  const publicTarget = resolve(frontendDir, "public/kolibri.wasm");
  const publicInfoTarget = resolve(frontendDir, "public/kolibri.wasm.txt");
  let copied = false;
  let buildPromise: Promise<void> | null = null;
  let skippedForServe = false;

  const shouldAttemptAutoBuild = (() => {
    const value = process.env.KOLIBRI_SKIP_WASM_AUTOBUILD?.toLowerCase();

    if (!value) {
      return process.platform !== "win32";
    }

    return !["1", "true", "yes", "on"].includes(value);
  })();

  const allowStubWasm = (() => {
    const value = process.env.KOLIBRI_ALLOW_WASM_STUB?.toLowerCase();

    if (!value) {
      return false;
    }

    return ["1", "true", "yes", "on"].includes(value);
  })();

  let warnedAboutStub = false;

  const buildKolibriWasm = () =>
    new Promise<void>((fulfill, reject) => {
      const child = spawn(wasmBuilder, {
        cwd: resolve(frontendDir, ".."),
        env: process.env,
        stdio: "inherit",
      });

      child.once("error", (error) => {
        reject(error);
      });

      child.once("exit", (code, signal) => {
        if (code === 0) {
          fulfill();
          return;
        }

        const reason =
          signal !== null
            ? `был прерван сигналом ${signal}`
            : `завершился с кодом ${code ?? "неизвестно"}`;
        reject(new Error(`build_wasm.sh ${reason}`));
      });
    });

  const ensureWasmPresent = async () => {
    let wasmExists = false;

    try {
      await access(wasmSource);
      wasmExists = true;
    } catch (accessError) {
      if (!shouldAttemptAutoBuild) {
        const messageParts = [
          `[copy-kolibri-wasm] Не найден ${wasmSource}.`,
          "Запустите scripts/build_wasm.sh вручную.",
        ];

        if (accessError instanceof Error && accessError.message) {
          messageParts.push(`Причина: ${accessError.message}`);
        }

        throw new Error(messageParts.join(" "));
      }
    }

    if (!wasmExists) {
      buildPromise ||= buildKolibriWasm();

      try {
        await buildPromise;
      } catch (buildError) {
        buildPromise = null;

        const messageParts = [
          `[copy-kolibri-wasm] Не найден ${wasmSource}.`,
          "Автосборка kolibri.wasm завершилась с ошибкой.",
          "Попробуйте запустить scripts/build_wasm.sh вручную.",
          "Чтобы отключить автосборку, задайте KOLIBRI_SKIP_WASM_AUTOBUILD=1.",
        ];

        if (buildError instanceof Error && buildError.message) {
          messageParts.push(`Причина: ${buildError.message}`);
        }

        throw new Error(messageParts.join(" "));
      }

      buildPromise = null;
      wasmExists = true;
    }

    try {
      await access(wasmSource);
    } catch (postBuildError) {
      const messageParts = [
        `[copy-kolibri-wasm] kolibri.wasm не появился по пути ${wasmSource} после сборки.`,
        "Проверьте вывод scripts/build_wasm.sh.",
      ];

      if (postBuildError instanceof Error && postBuildError.message) {
        messageParts.push(`Причина: ${postBuildError.message}`);
      }

      throw new Error(messageParts.join(" "));
    }

    try {
      await access(wasmInfoSource);
      const info = await readFile(wasmInfoSource, "utf-8");
      if (/kolibri\.wasm:\s*заглушка/i.test(info)) {
        if (!allowStubWasm) {
          throw new Error(
            "kolibri.wasm собран как заглушка. Установите Emscripten или Docker и повторите scripts/build_wasm.sh, или запустите сборку с KOLIBRI_ALLOW_WASM_STUB=1 для деградированного режима."
          );
        }

        if (!warnedAboutStub) {
          console.warn(
            "[copy-kolibri-wasm] Обнаружена заглушка kolibri.wasm. Сборка продолжится, потому что установлен KOLIBRI_ALLOW_WASM_STUB."
          );
          console.warn(
            "[copy-kolibri-wasm] Фронтенд будет работать в деградированном режиме. Установите Emscripten или Docker и пересоберите, чтобы восстановить полноценный функционал."
          );
          warnedAboutStub = true;
        }
      }
    } catch (infoError) {
      const messageParts = [
        `[copy-kolibri-wasm] Не удалось проверить ${wasmInfoSource}.`,
        "kolibri.wasm должен быть полноценным модулем, а не заглушкой.",
      ];

      if (infoError instanceof Error && infoError.message) {
        messageParts.push(`Причина: ${infoError.message}`);
      }

      throw new Error(messageParts.join(" "));
    }
  };

  const performCopy = async (context: "serve" | "build") => {
    if (copied || skippedForServe) {
      return;
    }

    try {
      await ensureWasmPresent();
    } catch (error) {
      if (context === "serve") {
        skippedForServe = true;
        const reason =
          error instanceof Error && error.message
            ? error.message
            : String(error);
        console.warn(`[copy-kolibri-wasm] kolibri.wasm не будет скопирован: ${reason}`);
        console.warn(
          "[copy-kolibri-wasm] Фронтенд запущен в деградированном режиме без WebAssembly. " +
            "Запустите scripts/build_wasm.sh, чтобы восстановить полноценную функциональность."
        );
        return;
      }

      throw error;
    }

    await mkdir(dirname(publicTarget), { recursive: true });
    await copyFile(wasmSource, publicTarget);
    await copyFile(wasmInfoSource, publicInfoTarget);
    copied = true;
  };

  return {
    name: "copy-kolibri-wasm",
    async buildStart() {
      await performCopy("build");
    },
    async configureServer() {
      await performCopy("serve");
    },
  };
}

export default defineConfig({
  plugins: [react(), copyKolibriWasm()],
  server: {
    port: 5173,
  },
});
