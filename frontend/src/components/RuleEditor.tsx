import { useCallback, useEffect, useMemo, useState } from "react";
import { BrainCircuit, Loader2, PenSquare, Play, Plus, RefreshCw, Save } from "lucide-react";
import kolibriBridge, {
  type FormulaEvaluationRequest,
  type FormulaEvaluationResult,
  type FormulaSummary,
  type SaveFormulaRequest,
} from "../core/kolibri-bridge";

const DEFAULT_CONTEXT_HINT = "Введите контекст, например math или demo";

const RuleEditor = () => {
  const [formulas, setFormulas] = useState<FormulaSummary[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [context, setContext] = useState("");
  const [payload, setPayload] = useState("");
  const [evaluation, setEvaluation] = useState<FormulaEvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const selectedFormula = useMemo(
    () => (selectedName ? formulas.find((item) => item.name === selectedName) ?? null : null),
    [formulas, selectedName],
  );

  const loadFormulas = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await kolibriBridge.fetchFormulas();
      setFormulas(list);
      if (!selectedName && list.length) {
        setSelectedName(list[0].name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить формулы");
    } finally {
      setIsLoading(false);
    }
  }, [selectedName]);

  useEffect(() => {
    void loadFormulas();
  }, [loadFormulas]);

  useEffect(() => {
    if (selectedFormula) {
      setCode(selectedFormula.code);
      setContext(selectedFormula.context ?? "");
      setEvaluation(null);
      setError(null);
    } else if (!selectedName) {
      setCode("");
      setContext("");
      setPayload("");
      setEvaluation(null);
      setError(null);
    }
  }, [selectedFormula, selectedName]);

  const handleSelect = (name: string) => {
    setSelectedName(name);
  };

  const handleCreate = () => {
    setSelectedName(null);
    setCode("");
    setContext("");
    setPayload("");
    setEvaluation(null);
    setError(null);
  };

  const handleRefresh = () => {
    void loadFormulas();
  };

  const persistFormula = async (request: SaveFormulaRequest) => {
    setIsSaving(true);
    setError(null);
    try {
      const updated = await kolibriBridge.saveFormula(request);
      setFormulas((prev) => {
        const withoutCurrent = prev.filter((item) => item.name !== updated.name);
        return [...withoutCurrent, updated].sort((a, b) => a.name.localeCompare(b.name, "ru") || a.name.localeCompare(b.name));
      });
      setSelectedName(updated.name);
      setEvaluation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить формулу");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!code.trim()) {
      setError("Введите код формулы перед сохранением.");
      return;
    }
    const request: SaveFormulaRequest = {
      name: selectedName ?? undefined,
      code,
      context: context.trim() || undefined,
    };
    await persistFormula(request);
  };

  const handleEvaluate = async () => {
    if (!code.trim()) {
      setError("Введите код формулы для оценки.");
      return;
    }
    setIsEvaluating(true);
    setError(null);
    try {
      const request: FormulaEvaluationRequest = {
        name: selectedName ?? undefined,
        code,
        context: context.trim() || undefined,
        payload: payload.trim() || undefined,
      };
      const result = await kolibriBridge.evaluateFormula(request);
      setEvaluation(result);
    } catch (err) {
      setEvaluation({
        success: false,
        output: "",
        message: err instanceof Error ? err.message : "Не удалось выполнить оценку",
      });
    } finally {
      setIsEvaluating(false);
    }
  };

  const evaluationBanner = useMemo(() => {
    if (!evaluation) {
      return null;
    }
    const style = evaluation.success ? "border-emerald-200 bg-emerald-50/90 text-emerald-800" : "border-red-200 bg-red-50/90 text-red-700";
    return (
      <div className={`rounded-2xl border p-4 text-sm ${style}`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold">
            {evaluation.success ? "Формула выполнена успешно" : "Ошибка при выполнении"}
          </span>
          {evaluation.fitness !== undefined ? (
            <span className="rounded-xl bg-white/70 px-2 py-1 text-xs font-medium text-text-dark">
              fitness: {evaluation.fitness.toFixed(3)}
            </span>
          ) : null}
        </div>
        {evaluation.output ? (
          <pre className="mt-3 whitespace-pre-wrap text-xs font-mono leading-relaxed text-text-dark">
            {evaluation.output}
          </pre>
        ) : null}
        {evaluation.metadata ? (
          <div className="mt-3 grid gap-2 text-xs text-text-dark">
            {Object.entries(evaluation.metadata).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-3 py-1">
                <span className="font-medium text-text-light">{key}</span>
                <span className="font-mono">{value}</span>
              </div>
            ))}
          </div>
        ) : null}
        {evaluation.message && !evaluation.success ? (
          <p className="mt-3 text-xs font-medium text-text-dark">{evaluation.message}</p>
        ) : null}
      </div>
    );
  }, [evaluation]);

  return (
    <section className="grid gap-6 lg:grid-cols-[18rem_1fr] lg:gap-8">
      <aside className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-text-dark">Формулы</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isLoading}
              className="rounded-xl bg-background-light/70 p-2 text-text-light transition hover:text-text-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={handleCreate}
              className="rounded-xl bg-primary/10 p-2 text-primary transition hover:bg-primary/20"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="rounded-3xl bg-white/80 p-4 shadow-card">
          {isLoading && !formulas.length ? (
            <div className="flex items-center gap-3 text-sm text-text-light">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Загружаем пул формул…</span>
            </div>
          ) : null}
          {!isLoading && !formulas.length ? (
            <p className="text-sm text-text-light">
              Пул формул пуст. Создайте правило вручную или дождитесь эволюции ядра.
            </p>
          ) : null}
          <ul className="mt-3 space-y-2">
            {formulas.map((formula) => {
              const isActive = selectedName === formula.name;
              return (
                <li key={formula.name}>
                  <button
                    type="button"
                    onClick={() => handleSelect(formula.name)}
                    className={`w-full rounded-2xl border px-3 py-2 text-left text-sm transition ${
                      isActive
                        ? "border-primary/50 bg-primary/10 text-text-dark"
                        : "border-transparent bg-background-light/50 text-text-light hover:border-primary/40 hover:text-text-dark"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{formula.name}</span>
                      <span className="rounded-lg bg-white/80 px-2 py-0.5 text-xs font-mono text-primary">
                        {formula.fitness.toFixed(3)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-text-light">{formula.code}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <div className="space-y-5">
        <header className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-2xl bg-white/80 px-3 py-2 text-sm font-medium text-text-dark shadow-card">
            <BrainCircuit className="h-4 w-4 text-primary" />
            <span>{selectedFormula ? `Редактирование ${selectedFormula.name}` : "Новая формула"}</span>
          </div>
          {selectedFormula?.parents.length ? (
            <div className="flex items-center gap-2 rounded-2xl bg-background-light/60 px-3 py-2 text-xs text-text-light">
              <PenSquare className="h-4 w-4" />
              <span>Родители: {selectedFormula.parents.join(", ")}</span>
            </div>
          ) : null}
        </header>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50/80 p-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="space-y-4 rounded-3xl bg-white/90 p-6 shadow-card">
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-text-light">Код формулы</span>
            <textarea
              value={code}
              onChange={(event) => setCode(event.target.value)}
              rows={6}
              className="w-full rounded-2xl border border-transparent bg-background-light/60 px-4 py-3 font-mono text-sm text-text-dark focus:border-primary focus:outline-none"
              placeholder="f(x)=3*x+1"
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-text-light">Контекст</span>
            <input
              type="text"
              value={context}
              onChange={(event) => setContext(event.target.value)}
              className="w-full rounded-2xl border border-transparent bg-background-light/60 px-4 py-3 text-sm text-text-dark focus:border-primary focus:outline-none"
              placeholder={DEFAULT_CONTEXT_HINT}
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium text-text-light">Тестовая нагрузка</span>
            <textarea
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              rows={3}
              className="w-full rounded-2xl border border-transparent bg-background-light/60 px-4 py-3 text-sm text-text-dark focus:border-primary focus:outline-none"
              placeholder="Например: 0,1,2,3"
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-primary/60"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>{selectedFormula ? "Сохранить изменения" : "Создать формулу"}</span>
            </button>
            <button
              type="button"
              onClick={handleEvaluate}
              disabled={isEvaluating}
              className="flex items-center gap-2 rounded-xl border border-primary/50 bg-white px-4 py-2 text-sm font-semibold text-primary shadow-sm transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:border-primary/20 disabled:text-primary/50"
            >
              {isEvaluating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              <span>Оценить</span>
            </button>
          </div>
        </div>

        {evaluationBanner}
      </div>
    </section>
  );
};

export default RuleEditor;
