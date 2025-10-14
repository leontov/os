import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { access, readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type WasiPluginContext = "serve" | "build";

function copyKolibriWasm(): Plugin {
  const frontendDir = fileURLToPath(new URL(".", import.meta.url));
  const projectRoot = resolve(frontendDir, "..");
  const wasmSource = resolve(projectRoot, "build/wasm/kolibri.wasm");
  const wasmInfoSource = resolve(projectRoot, "build/wasm/kolibri.wasm.txt");
  const wasmReportSource = resolve(projectRoot, "build/wasm/kolibri.wasm.report.json");
  const wasmBuilder = resolve(projectRoot, "scripts/build_wasm.sh");

  let wasmBuffer: Buffer | null = null;
  let wasmInfoBuffer: Buffer | null = null;
  let wasmBundleFileName = "assets/kolibri.wasm";
  let wasmInfoBundleFileName = "assets/kolibri.wasm.txt";
  let wasmPublicPath = "/kolibri.wasm";
  let wasmInfoPublicPath = "/kolibri.wasm.txt";
  let wasmHash = "";
  let wasmAvailable = false;
  let stubDetected = false;
  let ensureError: Error | null = null;
  let ensureInFlight: Promise<void> | null = null;
  let command: WasiPluginContext = "serve";
  let skippedForServe = false;
  let warnedAboutStub = false;

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

  const buildKolibriWasm = () =>
    new Promise<void>((fulfill, reject) => {
      const child = spawn(wasmBuilder, {
        cwd: projectRoot,
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

  const readReportReason = async (): Promise<string | null> => {
    try {
      const raw = await readFile(wasmReportSource, "utf-8");
      if (!raw.trim()) {
        return null;
      }
      const parsed = JSON.parse(raw) as { reason?: unknown };
      if (parsed && typeof parsed.reason === "string" && parsed.reason.trim()) {
        return parsed.reason.trim();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("ENOENT")) {
        return null;
      }
    }
    return null;
  };

  const ensureWasm = async () => {
    if (wasmAvailable) {
      return;
    }

    if (ensureInFlight) {
      await ensureInFlight;
      return;
    }

    ensureInFlight = (async () => {
      let needsBuild = false;

      try {
        await access(wasmSource);
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

        needsBuild = true;
      }

      if (needsBuild) {
        try {
          await buildKolibriWasm();
        } catch (buildError) {
          const messageParts = [
            `[copy-kolibri-wasm] Не удалось автоматически собрать kolibri.wasm через ${wasmBuilder}.`,
            "Запустите scripts/build_wasm.sh вручную или установите Emscripten.",
            "Чтобы отключить автосборку, задайте KOLIBRI_SKIP_WASM_AUTOBUILD=1.",
          ];

          if (buildError instanceof Error && buildError.message) {
            messageParts.push(`Причина: ${buildError.message}`);
          }

          throw new Error(messageParts.join(" "));
        }
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

      let infoText: string;
      try {
        infoText = await readFile(wasmInfoSource, "utf-8");
      } catch (infoError) {
        const messageParts = [
          `[copy-kolibri-wasm] Не удалось прочитать ${wasmInfoSource}.`,
          "kolibri.wasm должен сопровождаться описанием сборки.",
        ];

        if (infoError instanceof Error && infoError.message) {
          messageParts.push(`Причина: ${infoError.message}`);
        }

        throw new Error(messageParts.join(" "));
      }

      stubDetected = /kolibri\.wasm:\s*заглушка/i.test(infoText);
      if (stubDetected && !allowStubWasm) {
        const reportReason = await readReportReason();
        const suffix = reportReason ? ` Причина: ${reportReason}.` : "";
        throw new Error(
          `kolibri.wasm собран как заглушка. Установите Emscripten или Docker и пересоберите scripts/build_wasm.sh.${suffix}`,
        );
      }

      if (stubDetected && allowStubWasm && !warnedAboutStub) {
        console.warn(
          "[copy-kolibri-wasm] Обнаружена заглушка kolibri.wasm. Сборка продолжится, потому что установлен KOLIBRI_ALLOW_WASM_STUB.",
        );
        console.warn(
          "[copy-kolibri-wasm] Фронтенд будет работать в деградированном режиме. Установите Emscripten или Docker и пересоберите, чтобы восстановить полноценный функционал.",
        );
        warnedAboutStub = true;
      }

      wasmBuffer = await readFile(wasmSource);
      wasmInfoBuffer = Buffer.from(infoText, "utf-8");
      wasmHash = createHash("sha256").update(wasmBuffer).digest("hex").slice(0, 16);
      wasmBundleFileName = `assets/kolibri-${wasmHash}.wasm`;
      wasmInfoBundleFileName = `assets/kolibri-${wasmHash}.wasm.txt`;
      wasmPublicPath = `/${wasmBundleFileName}`;
      wasmInfoPublicPath = `/${wasmInfoBundleFileName}`;
      wasmAvailable = true;
      ensureError = null;
    })()
      .catch((error) => {
        ensureError = error instanceof Error ? error : new Error(String(error));
        throw ensureError;
      })
      .finally(() => {
        ensureInFlight = null;
      });

    await ensureInFlight;
  };

  const prepare = async (context: WasiPluginContext) => {
    try {
      await ensureWasm();
      return true;
    } catch (error) {
      const reason = error instanceof Error && error.message ? error.message : String(error);
      if (context === "serve") {
        if (!skippedForServe) {
          skippedForServe = true;
          console.warn(`[copy-kolibri-wasm] kolibri.wasm недоступен: ${reason}`);
          console.warn(
            "[copy-kolibri-wasm] Фронтенд запущен в деградированном режиме без WebAssembly. Запустите scripts/build_wasm.sh, чтобы восстановить полноценную функциональность.",
          );
        }
        return false;
      }

      throw error;
    }
  };

  return {
    name: "copy-kolibri-wasm",
    configResolved(resolvedConfig) {
      command = resolvedConfig.command === "build" ? "build" : "serve";
    },
    async buildStart() {
      if (command === "build") {
        await prepare("build");
      }
    },
    async configureServer(server) {
      const ready = await prepare("serve");
      if (!ready) {
        return;
      }

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ? req.url.split("?")[0] : "";
        if (!url) {
          next();
          return;
        }

        if (url === wasmPublicPath) {
          res.setHeader("content-type", "application/wasm");
          createReadStream(wasmSource).pipe(res);
          return;
        }

        if (url === wasmInfoPublicPath) {
          res.setHeader("content-type", "text/plain; charset=utf-8");
          createReadStream(wasmInfoSource).pipe(res);
          return;
        }

        next();
      });
    },
    resolveId(id) {
      if (id === "virtual:kolibri-wasm") {
        return id;
      }
      return null;
    },
    async load(id) {
      if (id !== "virtual:kolibri-wasm") {
        return null;
      }

      if (!wasmAvailable && command === "serve" && !skippedForServe) {
        await prepare("serve");
      }

      if (!wasmAvailable && command === "build") {
        await prepare("build");
      }

      const availability = wasmAvailable ? "true" : "false";
      const stub = stubDetected ? "true" : "false";
      const hashLiteral = JSON.stringify(wasmHash);
      const wasmUrlLiteral = JSON.stringify(wasmPublicPath);
      const infoUrlLiteral = JSON.stringify(wasmInfoPublicPath);
      const errorLiteral = JSON.stringify(ensureError?.message ?? "");

      return `export const wasmUrl = ${wasmUrlLiteral};
export const wasmInfoUrl = ${infoUrlLiteral};
export const wasmHash = ${hashLiteral};
export const wasmAvailable = ${availability};
export const wasmIsStub = ${stub};
export const wasmError = ${errorLiteral};
`;
    },
    generateBundle() {
      if (!wasmAvailable || !wasmBuffer || !wasmInfoBuffer) {
        return;
      }

      this.emitFile({
        type: "asset",
        fileName: wasmBundleFileName,
        source: wasmBuffer,
      });
      this.emitFile({
        type: "asset",
        fileName: wasmInfoBundleFileName,
        source: wasmInfoBuffer,
      });
    },
  };
}

const knowledgeProxyTarget = process.env.KNOWLEDGE_API || "http://localhost:8000";

export default defineConfig({
  plugins: [react(), copyKolibriWasm()],
  server: {
    port: 5173,
    proxy: {
      "/api/knowledge": {
        target: knowledgeProxyTarget,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
