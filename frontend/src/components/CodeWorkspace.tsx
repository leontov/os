import { useEffect, useMemo, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import type { Extension } from "@codemirror/state";
import { applyPatch } from "diff";
import type { CodePatch, FileContext, PatchMode } from "../types/chat";

interface CodeWorkspaceProps {
  fileContext?: FileContext;
  patches?: CodePatch[];
  onPatchApply?: (patch: CodePatch, updatedContent: string) => void | Promise<void>;
}

const MODE_LABELS: Record<PatchMode, string> = {
  explain: "Объяснить",
  refactor: "Рефакторинг",
};

const MODES: PatchMode[] = ["explain", "refactor"];

const CodeWorkspace = ({ fileContext, patches = [], onPatchApply }: CodeWorkspaceProps) => {
  const [activeMode, setActiveMode] = useState<PatchMode>("explain");
  const [editorValue, setEditorValue] = useState<string>(fileContext?.content ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingPatchId, setPendingPatchId] = useState<string | null>(null);

  useEffect(() => {
    setEditorValue(fileContext?.content ?? "");
  }, [fileContext?.content]);

  useEffect(() => {
    if (!patches.length) {
      return;
    }
    if (!patches.some((patch) => patch.mode === activeMode)) {
      const fallback = (patches.find((patch) => patch.mode === "explain") ?? patches[0]).mode;
      if (fallback !== activeMode) {
        setActiveMode(fallback);
      }
    }
  }, [activeMode, patches]);

  const languageExtensions = useMemo(() => {
    const extensions: Extension[] = [];
    const language = fileContext?.language;
    const path = fileContext?.path ?? "";

    if (language === "json" || path.endsWith(".json")) {
      extensions.push(json());
      return extensions;
    }

    if (language === "typescript" || path.endsWith(".ts") || path.endsWith(".tsx")) {
      extensions.push(javascript({ typescript: true, jsx: path.endsWith(".tsx") }));
      return extensions;
    }

    if (language === "javascript" || path.endsWith(".js") || path.endsWith(".jsx")) {
      extensions.push(javascript({ jsx: path.endsWith(".jsx") }));
      return extensions;
    }

    if (path.endsWith(".tsx")) {
      extensions.push(javascript({ typescript: true, jsx: true }));
      return extensions;
    }

    if (path.endsWith(".ts")) {
      extensions.push(javascript({ typescript: true }));
      return extensions;
    }

    return extensions;
  }, [fileContext?.language, fileContext?.path]);

  const patchesByMode = useMemo(() => {
    if (!patches.length) {
      return [];
    }
    return patches.filter((patch) => patch.mode === activeMode);
  }, [activeMode, patches]);

  const modeCounters = useMemo(() => {
    return patches.reduce<Record<PatchMode, number>>(
      (acc, patch) => {
        acc[patch.mode] = (acc[patch.mode] ?? 0) + 1;
        return acc;
      },
      { explain: 0, refactor: 0 },
    );
  }, [patches]);

  const handlePatchApply = async (patch: CodePatch) => {
    setPendingPatchId(patch.id);
    setStatus(null);
    setError(null);

    try {
      const nextValue = patch.diff ? applyPatch(editorValue, patch.diff) : editorValue;
      if (nextValue === false) {
        throw new Error("Не удалось применить патч к текущему содержимому файла.");
      }

      setEditorValue(nextValue);
      if (onPatchApply) {
        await Promise.resolve(onPatchApply(patch, nextValue));
      }
      setStatus("Патч успешно применён к редактору.");
    } catch (patchError) {
      setError(patchError instanceof Error ? patchError.message : String(patchError));
    } finally {
      setPendingPatchId(null);
    }
  };

  return (
    <section className="flex h-full flex-col rounded-3xl bg-white/80 p-6 shadow-card">
      <header className="flex flex-col gap-1 border-b border-background-light/80 pb-4">
        <h2 className="text-lg font-semibold text-text-dark">Рабочая область</h2>
        {fileContext?.path ? (
          <p className="text-sm text-text-light">{fileContext.path}</p>
        ) : (
          <p className="text-sm text-text-light">Выберите сообщение с контекстом файла, чтобы начать работу.</p>
        )}
      </header>

      <div className="mt-4 flex-1 overflow-hidden rounded-2xl border border-background-light/60 bg-background-light/40">
        <CodeMirror
          value={editorValue}
          height="100%"
          minHeight="320px"
          extensions={languageExtensions}
          editable={Boolean(fileContext)}
          onChange={(value) => {
            setEditorValue(value);
            setStatus(null);
            setError(null);
          }}
          theme="light"
        />
      </div>

      <div className="mt-5 border-t border-background-light/80 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-text-dark">Режимы анализа</h3>
          <div className="flex items-center gap-2 rounded-full bg-background-light/60 p-1 text-xs font-semibold text-text-light">
            {MODES.map((mode) => {
              const isActive = activeMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  className={`rounded-full px-3 py-1 transition-colors ${
                    isActive ? "bg-white text-text-dark shadow-sm" : "hover:text-text-dark"
                  }`}
                  onClick={() => setActiveMode(mode)}
                  disabled={!modeCounters[mode] && mode !== "explain"}
                >
                  {MODE_LABELS[mode]}
                  {modeCounters[mode] ? ` (${modeCounters[mode]})` : ""}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {patchesByMode.length === 0 ? (
            <p className="text-sm text-text-light">
              {patches.length === 0
                ? "Сообщение ассистента не содержит патчей для этого файла."
                : "Для выбранного режима нет предложений."}
            </p>
          ) : null}

          {patchesByMode.map((patch) => (
            <article key={patch.id} className="rounded-2xl bg-background-light/60 p-4">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text-dark">{patch.summary ?? patch.filePath}</p>
                  <p className="text-xs text-text-light">{patch.filePath}</p>
                </div>
                {patch.createdAt ? (
                  <span className="text-[11px] uppercase tracking-wide text-text-light">{patch.createdAt}</span>
                ) : null}
              </header>

              {activeMode === "explain" ? (
                <p className="mt-3 whitespace-pre-line text-sm text-text-dark">
                  {patch.description ?? patch.summary ?? "Ассистент не предоставил пояснений."}
                </p>
              ) : (
                <>
                  {patch.description ? (
                    <p className="mt-3 text-sm text-text-dark">{patch.description}</p>
                  ) : null}
                  <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-[#0f172a] p-4 text-xs text-slate-100">
                    {patch.diff.split("\n").map((line, index) => {
                      const trimmed = line.trimStart();
                      const className =
                        line.startsWith("+")
                          ? "text-emerald-400"
                          : line.startsWith("-")
                          ? "text-rose-400"
                          : trimmed.startsWith("@@")
                          ? "text-sky-300"
                          : "text-slate-100";
                      return (
                        <code key={`${patch.id}-${index}`} className={`block whitespace-pre-wrap ${className}`}>
                          {line || "\u00a0"}
                        </code>
                      );
                    })}
                  </pre>
                  <div className="mt-3 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => handlePatchApply(patch)}
                      className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={pendingPatchId === patch.id}
                    >
                      {pendingPatchId === patch.id ? "Применяем…" : "Применить"}
                    </button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>

        {status ? <p className="mt-4 text-sm font-medium text-emerald-600">{status}</p> : null}
        {error ? <p className="mt-2 text-sm font-medium text-rose-500">{error}</p> : null}
      </div>
    </section>
  );
};

export default CodeWorkspace;
