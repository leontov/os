import { AlertCircle, BookOpen, Loader2 } from "lucide-react";
import type { KnowledgeDocument } from "../types/knowledge";

interface ContextPanelProps {
  query?: string | null;
  documents: KnowledgeDocument[];
  isLoading: boolean;
  error?: string | null;
}

const ContextPanel = ({ query, documents, isLoading, error }: ContextPanelProps) => {
  const hasContext = documents.length > 0;
  const shouldRender = hasContext || isLoading || Boolean(error);

  if (!shouldRender) {
    return null;
  }

  return (
    <section className="rounded-3xl bg-white/70 p-6 shadow-card">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-primary">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-dark">Контекст памяти</p>
            {query && <p className="text-xs text-text-light">Запрос: “{query}”</p>}
          </div>
        </div>
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-text-light">
            <Loader2 className="h-4 w-4 animate-spin" />
            Обновление…
          </div>
        )}
      </header>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl bg-red-100/80 p-3 text-xs text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {hasContext ? (
        <ul className="space-y-3">
          {documents.map((doc) => (
            <li key={doc.id} className="rounded-2xl bg-background-light/60 p-4">
              <p className="text-sm font-semibold text-text-dark">{doc.title}</p>
              <p className="mt-1 text-xs text-text-light">{doc.snippet}</p>
              {doc.source && (
                <p className="mt-2 text-[11px] uppercase tracking-wide text-text-light/80">
                  Источник: {doc.source}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-light">Релевантный контекст не найден.</p>
      )}
    </section>
  );
};

export default ContextPanel;
