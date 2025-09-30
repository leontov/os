import { defineConfig, type Plugin, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import { copyFile, mkdir, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface KnowledgeRecord {
  id: string;
  title: string;
  content: string;
  scoreBoost?: number;
  source?: string;
}

const knowledgeBase: KnowledgeRecord[] = [
  {
    id: "kolibri-overview",
    title: "Обзор Kolibri AI",
    content:
      "Kolibri AI объединяет эволюцию коротких формул и фрактальную память. Система ищет, мутирует и отбирает программы, " +
      "а знания хранятся в десятичной иерархии, где путь вроде 7→7.3→7.3.1 обозначает мысль.",
    source: "docs/kolibri_integrated_prototype.md",
  },
  {
    id: "fractal-memory",
    title: "Фрактальная память",
    content:
      "Фрактальная память состоит из десятичных уровней. Каждый уровень содержит десять подузлов, что позволяет детализировать " +
      "понятия произвольной глубины. Активный путь показывает текущую мысль или контекст.",
    source: "docs/kolibri_integrated_prototype.md",
  },
  {
    id: "kolibri-chain",
    title: "Kolibri Chain",
    content:
      "Kolibri Chain — микроблокчейн для фиксации происхождения формул и обмена знаниями между узлами. Он синхронизирует события " +
      "обучения и обеспечивает доверие к общему репозиторию знаний.",
    source: "docs/kolibri_integrated_prototype.md",
  },
  {
    id: "web-wasm",
    title: "Веб-интерфейс и WebAssembly",
    content:
      "Kolibri использует WebAssembly ядро (kolibri.wasm), которое исполняет KolibriScript в браузере. React-интерфейс " +
      "предоставляет компоненты Chat, FractalMemory, RuleEditor и визуализирует состояние памяти.",
    source: "docs/kolibri_integrated_prototype.md",
  },
  {
    id: "evolution",
    title: "Эволюционное обучение",
    content:
      "Kolibri эволюционирует формулы: генерирует, мутирует и отбирает программы по метрикам пригодности. Популяция управляется " +
      "турнирами, а лучшие формулы получают повышенный вес.",
    source: "docs/kolibri_integrated_prototype.md",
  },
];

const normaliseLimit = (value: string | null, fallback: number, max: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
};

const searchKnowledgeBase = (query: string, limit: number) => {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (!tokens.length) {
    return [] as Array<KnowledgeRecord & { score: number }>;
  }

  const scored = knowledgeBase
    .map((record) => {
      const haystack = `${record.title} ${record.content}`.toLowerCase();
      let matches = 0;
      let titleBonus = 0;
      for (const token of tokens) {
        if (haystack.includes(token)) {
          matches += 1;
        }
        if (record.title.toLowerCase().includes(token)) {
          titleBonus += 0.25;
        }
      }
      if (matches === 0) {
        return null;
      }
      const density = matches / tokens.length;
      const score = density + titleBonus + (record.scoreBoost ?? 0);
      return { ...record, score };
    })
    .filter((item): item is KnowledgeRecord & { score: number } => item !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ scoreBoost: _scoreBoost, ...rest }) => rest);

  return scored;
};

const createKnowledgeHandler = (): Connect.NextHandleFunction => {
  return (req, res, next) => {
    if (!req.url) {
      next();
      return;
    }

    if (req.method && req.method !== "GET") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Method Not Allowed" }));
      return;
    }

    const url = new URL(req.url, "http://localhost");
    const query = url.searchParams.get("q")?.trim() ?? "";
    const limit = normaliseLimit(url.searchParams.get("limit"), 3, knowledgeBase.length);

    if (!query) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ snippets: [] }));
      return;
    }

    const snippets = searchKnowledgeBase(query, limit).map(({ scoreBoost, ...snippet }) => ({
      ...snippet,
      score: Number(snippet.score.toFixed(3)),
    }));

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ snippets }));
  };
};

const knowledgeEndpoint = (): Plugin => {
  return {
    name: "kolibri-knowledge-endpoint",
    configureServer(server) {
      server.middlewares.use("/knowledge/search", createKnowledgeHandler());
    },
    configurePreviewServer(server) {
      server.middlewares.use("/knowledge/search", createKnowledgeHandler());
    },
  };
};

function copyKolibriWasm(): Plugin {
  const frontendDir = fileURLToPath(new URL(".", import.meta.url));
  const wasmSource = resolve(frontendDir, "../build/wasm/kolibri.wasm");
  const wasmBuilder = resolve(frontendDir, "../scripts/build_wasm.sh");
  const publicTarget = resolve(frontendDir, "public/kolibri.wasm");
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
    try {
      await access(wasmSource);
      return;
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
  plugins: [knowledgeEndpoint(), react(), copyKolibriWasm()],
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
