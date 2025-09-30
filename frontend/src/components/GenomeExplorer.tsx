import { useCallback, useEffect, useMemo, useState } from "react";
import { DatabaseZap, Loader2, RefreshCw } from "lucide-react";
import kolibriBridge, { type GenomeBlock } from "../core/kolibri-bridge";

const formatDigits = (value: string, group = 12) => {
  if (!value) {
    return "";
  }
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += group) {
    chunks.push(value.slice(index, index + group));
  }
  return chunks.join("\n");
};

const GenomeExplorer = () => {
  const [blocks, setBlocks] = useState<GenomeBlock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBlocks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await kolibriBridge.fetchGenome();
      setBlocks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить геном");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBlocks();
  }, [loadBlocks]);

  const stats = useMemo(() => {
    if (!blocks.length) {
      return null;
    }
    const payloadDigits = blocks.reduce((sum, block) => sum + block.payload.length, 0);
    return {
      blocks: blocks.length,
      payloadDigits,
    };
  }, [blocks]);

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-text-dark">Цифровой геном</h2>
          <p className="text-sm text-text-light">
            Цепочка ReasonBlock с HMAC-подписями фиксирует каждое эволюционное событие.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {stats ? (
            <div className="flex items-center gap-2 rounded-2xl bg-white/80 px-3 py-2 text-xs font-medium text-text-dark shadow-sm">
              <DatabaseZap className="h-4 w-4 text-primary" />
              <span>
                {stats.blocks} блоков • {stats.payloadDigits} цифр payload
              </span>
            </div>
          ) : null}
          <button
            type="button"
            onClick={loadBlocks}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/60"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span>{isLoading ? "Обновление" : "Обновить"}</span>
          </button>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {isLoading && !blocks.length ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-white/70 p-6 text-sm text-text-light">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span>Загружаем цепочку блоков…</span>
        </div>
      ) : null}

      {!isLoading && !blocks.length && !error ? (
        <div className="rounded-2xl border border-dashed border-text-light/30 bg-white/60 p-6 text-sm text-text-light">
          Геном пока пуст. Проведите обучение или эволюцию формул, чтобы зафиксировать новое событие.
        </div>
      ) : null}

      {blocks.length ? (
        <div className="space-y-4">
          {blocks.map((block) => (
            <article key={block.nomer} className="rounded-3xl bg-white/90 p-6 shadow-card">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-text-dark">Блок №{block.nomer}</h3>
                  <p className="text-xs uppercase tracking-wide text-text-light">Payload</p>
                  <pre className="mt-1 max-h-32 overflow-auto rounded-2xl bg-background-light/60 p-3 text-xs font-mono leading-relaxed text-text-dark">
                    {formatDigits(block.payload)}
                  </pre>
                </div>
                <div className="flex flex-col gap-3 text-xs">
                  <div>
                    <p className="font-medium uppercase tracking-wide text-text-light">Предыдущий хеш</p>
                    <p className="mt-1 rounded-xl bg-background-light/70 p-2 font-mono text-[11px] text-text-dark">
                      {block.pred_hash}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium uppercase tracking-wide text-text-light">HMAC (десятичный)</p>
                    <p className="mt-1 rounded-xl bg-background-light/70 p-2 font-mono text-[11px] text-text-dark">
                      {block.hmac_summa}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium uppercase tracking-wide text-text-light">Итоговый хеш</p>
                    <p className="mt-1 rounded-xl bg-background-light/70 p-2 font-mono text-[11px] text-text-dark">
                      {block.itogovy_hash}
                    </p>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
};

export default GenomeExplorer;
