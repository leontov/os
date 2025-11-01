import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const protocolPattern = /^[a-z][a-z0-9+.-]*:\/\//i;
const frontendRoot = fileURLToPath(new URL(".", import.meta.url));

const normaliseBase = (value: string | null | undefined): string => {
  if (!value) {
    return "/";
  }

  if (value === "./" || value === "././") {
    return "./";
  }

  if (protocolPattern.test(value)) {
    return value.endsWith("/") ? value : `${value}/`;
  }

  return value.endsWith("/") ? value : `${value}/`;
};

const resolvePublicPath = (base: string, target: string): string => {
  if (!target) {
    return normaliseBase(base);
  }

  if (protocolPattern.test(target) || target.startsWith("/") || target.startsWith("./") || target.startsWith("../")) {
    return target;
  }

  const normalisedBase = normaliseBase(base);

  if (normalisedBase === "./") {
    return `./${target}`.replace(/\/{2,}/g, "/");
  }

  if (protocolPattern.test(normalisedBase)) {
    return new URL(target, normalisedBase).toString();
  }

  return `${normalisedBase}${target}`.replace(/\/{2,}/g, "/");
};

const configuredBase = normaliseBase(process.env.KOLIBRI_PUBLIC_BASE_URL ?? "/");

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

const extractFaqEntries = (content: string): FaqEntry[] => {
  const lines = content.split(/\r?\n/);
  const entries: FaqEntry[] = [];
  let section = "";
  let question: string | null = null;
  let answerLines: string[] = [];

  const flush = () => {
    if (!question) {
      answerLines = [];
      return;
    }
    const answer = answerLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!answer) {
      question = null;
      answerLines = [];
      return;
    }
    const slug = slugify(question);
    if (!slug) {
      question = null;
      answerLines = [];
      return;
    }
    entries.push({
      slug,
      section: section || "FAQ",
      question: question.trim(),
      answer,
      language: "ru",
    });
    question = null;
    answerLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) {
      if (answerLines.length > 0) {
        answerLines.push("");
      }
      continue;
    }
    if (line.startsWith("## ")) {
      flush();
      section = line.replace(/^##\s+/, "").trim();
      continue;
    }
    if (line.startsWith("**Q:**")) {
      flush();
      question = line.replace("**Q:**", "").trim();
      continue;
    }
    if (line.startsWith("**A:**")) {
      answerLines = [line.replace("**A:**", "").trim()];
      continue;
    }
    if (answerLines.length > 0) {
      answerLines.push(line.trim());
    }
  }

  flush();
  return entries;
};

type WasiPluginContext = "serve" | "build";

interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  source: string;
}

interface KnowledgePayload {
  version: number;
  generatedAt: string;
  documents: KnowledgeDocument[];
}

interface FaqEntry {
  slug: string;
  section: string;
  question: string;
  answer: string;
  language: "ru";
}

interface KnowledgeDataset {
  documents: KnowledgeDocument[];
  faq: FaqEntry[];
}

function copyKolibriWasm(): Plugin {
  const frontendDir = fileURLToPath(new URL(".", import.meta.url));
  const projectRoot = resolve(frontendDir, "..");
  const wasmSource = resolve(projectRoot, "build/wasm/kolibri.wasm");
  const wasmInfoSource = resolve(projectRoot, "build/wasm/kolibri.wasm.txt");
  const wasmReportSource = resolve(projectRoot, "build/wasm/kolibri.wasm.report.json");
  const wasmBuilder = resolve(projectRoot, "scripts/build_wasm.sh");

  let wasmBuffer: Buffer | null = null;
  let wasmInfoBuffer: Buffer | null = null;
  let publicBase = configuredBase;
  let wasmBundleFileName = "assets/kolibri.wasm";
  let wasmInfoBundleFileName = "assets/kolibri.wasm.txt";
  let wasmPublicPath = resolvePublicPath(publicBase, wasmBundleFileName);
  let wasmInfoPublicPath = resolvePublicPath(publicBase, wasmInfoBundleFileName);
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
      wasmPublicPath = resolvePublicPath(publicBase, wasmBundleFileName);
      wasmInfoPublicPath = resolvePublicPath(publicBase, wasmInfoBundleFileName);
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
      publicBase = normaliseBase(resolvedConfig.base ?? publicBase);
      wasmPublicPath = resolvePublicPath(publicBase, wasmBundleFileName);
      wasmInfoPublicPath = resolvePublicPath(publicBase, wasmInfoBundleFileName);
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

function embedKolibriKnowledge(): Plugin {
  const frontendDir = fileURLToPath(new URL(".", import.meta.url));
  const projectRoot = resolve(frontendDir, "..");
  const knowledgeRoots = [resolve(projectRoot, "docs"), resolve(projectRoot, "data")];
  const virtualModuleId = "virtual:kolibri-knowledge";
  const resolvedVirtualModuleId = `\0${virtualModuleId}`;

  const textExtensions = new Set([".md", ".markdown", ".txt", ".ks", ".json"]);
  const sizeLimitBytes = 512 * 1024; // 512 KiB per document cap to avoid bloating bundle

  let knowledgeBuffer: Buffer | null = null;
  let knowledgeHash = "";
  let publicBase = configuredBase;
  let knowledgeBundleFileName = "assets/kolibri-knowledge.json";
  let knowledgePublicFile = "kolibri-knowledge.json";
  let knowledgePublicPath = resolvePublicPath(publicBase, knowledgePublicFile);
  let knowledgeAvailable = false;
  let knowledgeError: Error | null = null;
  let ensureInFlight: Promise<void> | null = null;
  let faqEntries: FaqEntry[] = [];
  let faqGeneratedAt = "";

  const normaliseWhitespace = (value: string): string => value.replace(/[\t\r]+/g, " ").replace(/\u00A0/g, " ");

  const stripMarkdown = (value: string): string =>
    value
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]*`/g, " ")
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
      .replace(/[#>*_~]/g, " ")
      .replace(/\{\{[^}]+\}\}/g, " ")
      .replace(/<[^>]*>/g, " ");

  const summarise = (value: string): string => {
    const stripped = stripMarkdown(normaliseWhitespace(value));
    const condensed = stripped.replace(/[ \f\v]+/g, " ").trim();
    if (!condensed) {
      return "";
    }
    const limit = 4000;
    return condensed.length > limit ? `${condensed.slice(0, limit)}…` : condensed;
  };

  const resolveTitle = (filePath: string, content: string): string => {
    const headingMatch = content.match(/^\s*#\s+(.+)$/m);
    if (headingMatch && headingMatch[1]) {
      return headingMatch[1].trim();
    }
    const fileName = basename(filePath);
    const withoutExt = fileName.replace(extname(fileName), "");
    return withoutExt.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || withoutExt;
  };

  const collectFiles = async (root: string): Promise<string[]> => {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const entryPath = resolve(root, entry.name);
        if (entry.isDirectory()) {
          files.push(...(await collectFiles(entryPath)));
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }
        const extension = extname(entry.name).toLowerCase();
        if (!textExtensions.has(extension)) {
          continue;
        }
        files.push(entryPath);
      }
      return files;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("ENOENT")) {
        return [];
      }
      throw error;
    }
  };

  const collectDocuments = async (): Promise<KnowledgeDataset> => {
    const seenIds = new Set<string>();
    const documents: KnowledgeDocument[] = [];
    const faq: FaqEntry[] = [];

    for (const root of knowledgeRoots) {
      const files = await collectFiles(root);
      for (const file of files) {
        const stats = await stat(file);
        if (!stats.isFile()) {
          continue;
        }
        if (stats.size === 0 || stats.size > sizeLimitBytes) {
          continue;
        }
        let raw = "";
        try {
          raw = await readFile(file, "utf-8");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes("ENOENT")) {
            continue;
          }
          throw error;
        }

        const summary = summarise(raw);
        if (!summary) {
          continue;
        }

        const relPath = relative(projectRoot, file).replace(/\\/g, "/");
        if (seenIds.has(relPath)) {
          continue;
        }
        seenIds.add(relPath);

        const title = resolveTitle(file, raw);
        documents.push({
          id: relPath,
          title,
          content: summary,
          source: relPath,
        });

        if (relPath.endsWith("docs/faq.md")) {
          faq.push(...extractFaqEntries(raw));
        }
      }
    }

    return { documents, faq };
  };

  const ensureKnowledge = async () => {
    if (knowledgeBuffer) {
      return;
    }

    if (ensureInFlight) {
      await ensureInFlight;
      return;
    }

    ensureInFlight = (async () => {
      try {
        const { documents, faq } = await collectDocuments();
        const generatedAt = new Date().toISOString();
        const payload: KnowledgePayload = {
          version: 1,
          generatedAt,
          documents,
        };

        const json = JSON.stringify(payload);
        knowledgeBuffer = Buffer.from(json, "utf-8");
        knowledgeHash = createHash("sha256").update(knowledgeBuffer).digest("hex").slice(0, 16);
        knowledgeBundleFileName = `assets/kolibri-knowledge-${knowledgeHash}.json`;
        knowledgePublicFile = knowledgeBundleFileName;
        knowledgePublicPath = resolvePublicPath(publicBase, knowledgePublicFile);
        knowledgeAvailable = documents.length > 0;
        knowledgeError = null;
        faqEntries = faq;
        faqGeneratedAt = generatedAt;
      } catch (error) {
        knowledgeBuffer = Buffer.from(
          JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), documents: [] }),
          "utf-8",
        );
        knowledgeHash = "";
        knowledgeBundleFileName = "assets/kolibri-knowledge.json";
        knowledgePublicFile = "kolibri-knowledge.json";
        knowledgePublicPath = resolvePublicPath(publicBase, knowledgePublicFile);
        knowledgeAvailable = false;
        knowledgeError = error instanceof Error ? error : new Error(String(error));
        faqEntries = [];
        faqGeneratedAt = new Date().toISOString();
      } finally {
        ensureInFlight = null;
      }
    })();

    await ensureInFlight;
  };

  return {
    name: "embed-kolibri-knowledge",
    async configResolved(resolved) {
      publicBase = normaliseBase(resolved.base ?? publicBase);
      if (resolved.command === "serve") {
        knowledgeBuffer = null;
        knowledgeHash = "";
        knowledgeBundleFileName = "assets/kolibri-knowledge.json";
        knowledgePublicFile = "kolibri-knowledge.json";
        knowledgeAvailable = false;
        knowledgeError = null;
        faqEntries = [];
        faqGeneratedAt = "";
      }
      knowledgePublicPath = resolvePublicPath(publicBase, knowledgePublicFile);
    },
    async buildStart() {
      await ensureKnowledge();
    },
    async configureServer(server) {
      await ensureKnowledge();
      const normalisedRoots = knowledgeRoots.map((root) => root.replace(/\\/g, "/"));
      for (const root of normalisedRoots) {
        server.watcher.add(root);
      }

      const invalidate = (filePath: string | undefined) => {
        if (!filePath) {
          return;
        }
        const normalised = filePath.replace(/\\/g, "/");
        if (normalisedRoots.some((root) => normalised.startsWith(root))) {
          knowledgeBuffer = null;
          faqEntries = [];
          faqGeneratedAt = "";
        }
      };

      server.watcher.on("change", invalidate);
      server.watcher.on("add", invalidate);
      server.watcher.on("unlink", invalidate);

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ? req.url.split("?")[0] : "";
        if (!url || url !== knowledgePublicPath) {
          next();
          return;
        }

        try {
          await ensureKnowledge();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          res.statusCode = 500;
          res.setHeader("content-type", "text/plain; charset=utf-8");
          res.end(`[kolibri-knowledge] ${message}`);
          return;
        }

        if (!knowledgeBuffer) {
          res.statusCode = 404;
          res.setHeader("content-type", "text/plain; charset=utf-8");
          res.end("kolibri-knowledge unavailable");
          return;
        }

        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(knowledgeBuffer);
      });
    },
    resolveId(id) {
      if (id === virtualModuleId) {
        return resolvedVirtualModuleId;
      }
      return null;
    },
    async load(id) {
      if (id !== resolvedVirtualModuleId) {
        return null;
      }

      await ensureKnowledge();

      const availability = knowledgeAvailable ? "true" : "false";
      const hashLiteral = JSON.stringify(knowledgeHash);
      const urlLiteral = JSON.stringify(knowledgePublicPath);
      const errorLiteral = JSON.stringify(knowledgeError?.message ?? "");
      const faqLiteral = JSON.stringify(faqEntries);
      const faqGeneratedAtLiteral = JSON.stringify(faqGeneratedAt);
      const faqAvailability = faqEntries.length > 0 ? "true" : "false";

      return `export const knowledgeUrl = ${urlLiteral};
export const knowledgeHash = ${hashLiteral};
export const knowledgeAvailable = ${availability};
export const knowledgeError = ${errorLiteral};
export const faqEntries = ${faqLiteral};
export const faqGeneratedAt = ${faqGeneratedAtLiteral};
export const faqAvailable = ${faqAvailability};
`;
    },
    generateBundle() {
      if (!knowledgeBuffer) {
        return;
      }

      this.emitFile({
        type: "asset",
        fileName: knowledgeBundleFileName,
        source: knowledgeBuffer,
      });
    },
  };
}

const knowledgeProxyTarget = process.env.KNOWLEDGE_API || "http://localhost:8000";

export default defineConfig({
  base: configuredBase,
  plugins: [react(), copyKolibriWasm(), embedKolibriKnowledge()],
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
    alias: {
      html2canvas: resolve(frontendRoot, "src/test/stubs/html2canvas.ts"),
    },
  },
});
