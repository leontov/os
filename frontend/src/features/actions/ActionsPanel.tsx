import {
  CheckCircle2,
  Clock3,
  Filter,
  ListChecks,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Tags,
  Wand2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createMacro,
  deleteMacro,
  fetchActionCatalog,
  listMacros,
  runAction,
  updateMacro,
} from "../../core/actions";
import type {
  ActionCatalog,
  ActionMacro,
  ActionMacroPayload,
  ActionRecipe,
  ActionRunResult,
} from "../../types/actions";

type ParameterState = Record<string, unknown>;

const buildDefaultParameters = (recipe: ActionRecipe): ParameterState => {
  const defaults: ParameterState = {};
  recipe.inputs.forEach((input) => {
    if (input.default !== undefined) {
      defaults[input.key] = input.default;
      return;
    }

    if (input.type === "boolean") {
      defaults[input.key] = false;
    } else if (input.type === "number") {
      defaults[input.key] = 0;
    } else if (input.type === "select") {
      defaults[input.key] = input.options?.[0]?.value ?? "";
    } else {
      defaults[input.key] = "";
    }
  });
  return defaults;
};

const mergeParameters = (recipe: ActionRecipe, overrides?: ParameterState): ParameterState => ({
  ...buildDefaultParameters(recipe),
  ...(overrides ?? {}),
});

interface ParameterFieldsProps {
  recipe: ActionRecipe;
  values: ParameterState;
  onChange: (key: string, value: unknown) => void;
  disabled?: boolean;
}

const ParameterFields = ({ recipe, values, onChange, disabled }: ParameterFieldsProps) => (
  <div className="space-y-4">
    {recipe.inputs.map((input) => {
      const value = values[input.key];
      const label = input.required ? `${input.label} *` : input.label;

      if (input.type === "boolean") {
        return (
          <label key={input.key} className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(event) => onChange(input.key, event.target.checked)}
              disabled={disabled}
              className="mt-1 h-4 w-4 rounded border-border/70 text-brand"
            />
            <div className="space-y-1">
              <span className="text-sm font-semibold text-text">{label}</span>
              {input.description ? (
                <span className="block text-xs text-text-muted">{input.description}</span>
              ) : null}
            </div>
          </label>
        );
      }

      if (input.type === "select") {
        const options = input.options ?? [];
        const safeValue = typeof value === "string" ? value : String(value ?? "");
        return (
          <div key={input.key} className="space-y-1">
            <label className="text-sm font-semibold text-text" htmlFor={`param-${input.key}`}>
              {label}
            </label>
            <select
              id={`param-${input.key}`}
              value={safeValue}
              onChange={(event) => onChange(input.key, event.target.value)}
              disabled={disabled}
              className="w-full rounded-xl border border-border/70 bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none disabled:opacity-60"
            >
              {options.map((option) => (
                <option key={option.value} value={String(option.value)}>
                  {option.label}
                </option>
              ))}
            </select>
            {input.description ? <p className="text-xs text-text-muted">{input.description}</p> : null}
          </div>
        );
      }

      if (input.type === "number") {
        const numericValue = typeof value === "number" ? value : Number(value ?? 0);
        return (
          <div key={input.key} className="space-y-1">
            <label className="text-sm font-semibold text-text" htmlFor={`param-${input.key}`}>
              {label}
            </label>
            <input
              id={`param-${input.key}`}
              type="number"
              value={Number.isNaN(numericValue) ? "" : numericValue}
              onChange={(event) => {
                const next = event.target.value === "" ? "" : Number(event.target.value);
                onChange(input.key, Number.isNaN(Number(next)) ? value : next);
              }}
              disabled={disabled}
              placeholder={input.placeholder}
              className="w-full rounded-xl border border-border/70 bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none disabled:opacity-60"
            />
            {input.description ? <p className="text-xs text-text-muted">{input.description}</p> : null}
          </div>
        );
      }

      const textValue = typeof value === "string" ? value : String(value ?? "");
      return (
        <div key={input.key} className="space-y-1">
          <label className="text-sm font-semibold text-text" htmlFor={`param-${input.key}`}>
            {label}
          </label>
          <input
            id={`param-${input.key}`}
            type="text"
            value={textValue}
            onChange={(event) => onChange(input.key, event.target.value)}
            disabled={disabled}
            placeholder={input.placeholder}
            className="w-full rounded-xl border border-border/70 bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none disabled:opacity-60"
          />
          {input.description ? <p className="text-xs text-text-muted">{input.description}</p> : null}
        </div>
      );
    })}
  </div>
);

interface ActionDebuggerProps {
  recipe?: ActionRecipe;
  result: ActionRunResult | null;
  isRunning: boolean;
  error?: string | null;
  onRun: (parameters: ParameterState) => void;
  onResetParameters: () => void;
  onSaveMacro?: (parameters: ParameterState) => void;
}

const formatTimestamp = (timestamp?: number) => {
  if (!timestamp) {
    return "—";
  }
  try {
    return new Date(timestamp * 1000).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
};

const ActionDebugger = ({ recipe, result, isRunning, error, onRun, onResetParameters, onSaveMacro }: ActionDebuggerProps) => {
  const [values, setValues] = useState<ParameterState>({});

  useEffect(() => {
    if (!recipe) {
      setValues({});
      return;
    }
    const initial = mergeParameters(recipe, result?.parameters ?? {});
    setValues(initial);
  }, [recipe, result?.parameters, result?.action]);

  if (!recipe) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 bg-surface px-6 py-8 text-sm text-text-muted">
        Перетащите рецепт в область запуска или выберите его из списка, чтобы увидеть отладчик.
      </div>
    );
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onRun(values);
  };

  const handleChange = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const statusTone = result?.status === "failed" ? "text-red-500" : "text-brand";

  return (
    <div className="space-y-4 rounded-2xl border border-border/70 bg-surface px-5 py-6">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-base font-semibold text-text">
          <Wand2 className="h-4 w-4 text-brand" /> Визуальный отладчик
        </h3>
        <p className="text-xs text-text-muted">
          Настройте параметры запуска, просматривайте шаги, логи и права доступа. Текущий рецепт: «{recipe.title}».
        </p>
      </header>

      {recipe.estimatedDuration ? (
        <p className="rounded-xl border border-dashed border-border/60 bg-surface-muted px-3 py-2 text-xs text-text-muted">
          <Clock3 className="mr-2 inline h-3.5 w-3.5" /> Оценка длительности: {recipe.estimatedDuration}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <ParameterFields recipe={recipe} values={values} onChange={handleChange} disabled={isRunning} />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-card transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isRunning}
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Запустить с параметрами
          </button>
          <button
            type="button"
            onClick={() => {
              onResetParameters();
              setValues(mergeParameters(recipe));
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-muted transition-colors hover:text-text"
            disabled={isRunning}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Сбросить на шаблон
          </button>
          {onSaveMacro ? (
            <button
              type="button"
              onClick={() => onSaveMacro(values)}
              className="inline-flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-3 py-2 text-xs font-semibold text-brand transition-colors hover:bg-brand/20"
              disabled={isRunning}
            >
              <Save className="h-3.5 w-3.5" /> Сохранить как макрос
            </button>
          ) : null}
        </div>
      </form>

      {error ? (
        <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
      ) : null}

      {result ? (
        <div className="space-y-4">
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-[0.3em] text-text-muted">Ход выполнения</h4>
            <ul className="space-y-3">
              {result.timeline.map((entry) => {
                const tone =
                  entry.status === "failed"
                    ? "border-red-300 bg-red-50 text-red-700"
                    : entry.status === "completed"
                      ? "border-brand/50 bg-brand/10 text-brand"
                      : "border-border/70 bg-surface-muted text-text";
                return (
                  <li key={entry.id} className={`rounded-xl border px-3 py-2 text-xs ${tone}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold uppercase tracking-[0.2em]">{entry.title}</span>
                      <span>{formatTimestamp(entry.finishedAt ?? entry.startedAt)}</span>
                    </div>
                    {entry.message ? <p className="mt-1 text-[0.7rem] opacity-80">{entry.message}</p> : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-[0.3em] text-text-muted">Логи</h4>
            {result.logs.length ? (
              <ul className="soft-scroll max-h-48 space-y-2 overflow-y-auto rounded-xl border border-border/60 bg-surface-muted p-3 text-[0.7rem] text-text">
                {result.logs.map((log) => (
                  <li key={log.id} className="flex items-start gap-3">
                    <span className="font-semibold text-text-muted">{formatTimestamp(log.timestamp)}</span>
                    <span className={`font-semibold ${log.level === "error" ? "text-red-600" : "text-text"}`}>
                      [{log.level}]
                    </span>
                    <span className="flex-1">{log.message}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-border/60 px-3 py-2 text-[0.7rem] text-text-muted">
                Логи появятся после запуска действия.
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-[0.3em] text-text-muted">Права доступа</h4>
            {result.permissions.length ? (
              <ul className="space-y-2">
                {result.permissions.map((permission) => (
                  <li
                    key={permission.id}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                      permission.granted ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-red-300 bg-red-50 text-red-600"
                    }`}
                  >
                    <span className="font-semibold">{permission.name}</span>
                    <span>{permission.granted ? "разрешено" : "запрещено"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-border/60 px-3 py-2 text-[0.7rem] text-text-muted">
                Пока нет записей о проверках доступа.
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-[0.3em] text-text-muted">Результат</h4>
            <pre className={`soft-scroll max-h-40 overflow-auto rounded-xl border border-border/60 bg-surface-muted p-3 text-xs ${statusTone}`}>
              {JSON.stringify(result.output, null, 2)}
            </pre>
          </section>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border/60 px-3 py-2 text-xs text-text-muted">
          Запустите действие, чтобы увидеть детальную диагностику.
        </p>
      )}
    </div>
  );
};

interface MacroEditorState {
  recipe: ActionRecipe;
  macro?: ActionMacro;
  name: string;
  tags: string;
  values: ParameterState;
}

interface MacroEditorProps {
  state: MacroEditorState;
  isSaving: boolean;
  onChange: (next: MacroEditorState) => void;
  onCancel: () => void;
  onSubmit: (payload: ActionMacroPayload, macroId?: string) => void;
}

const MacroEditor = ({ state, isSaving, onChange, onCancel, onSubmit }: MacroEditorProps) => {
  const { recipe, name, tags, values, macro } = state;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedTags = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    onSubmit(
      {
        name: name.trim(),
        action: recipe.name,
        parameters: values,
        tags: parsedTags,
      },
      macro?.id,
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border/70 bg-surface px-5 py-6">
      <header className="space-y-1">
        <h3 className="text-base font-semibold text-text">
          <Plus className="mr-2 inline h-4 w-4 text-brand" /> {macro ? "Редактирование макроса" : "Новый макрос"}
        </h3>
        <p className="text-xs text-text-muted">Настройте параметры и сохраните быстрый запуск для рецепта «{recipe.title}».</p>
      </header>

      <div className="space-y-3">
        <div className="space-y-1">
          <label className="text-sm font-semibold text-text" htmlFor="macro-name">
            Название макроса
          </label>
          <input
            id="macro-name"
            type="text"
            required
            value={name}
            onChange={(event) => onChange({ ...state, name: event.target.value })}
            disabled={isSaving}
            className="w-full rounded-xl border border-border/70 bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none disabled:opacity-60"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-semibold text-text" htmlFor="macro-tags">
            Теги (через запятую)
          </label>
          <input
            id="macro-tags"
            type="text"
            value={tags}
            onChange={(event) => onChange({ ...state, tags: event.target.value })}
            disabled={isSaving}
            placeholder="ежедневно, etl"
            className="w-full rounded-xl border border-border/70 bg-surface px-3 py-2 text-sm text-text focus:border-brand focus:outline-none disabled:opacity-60"
          />
        </div>
      </div>

      <ParameterFields
        recipe={recipe}
        values={values}
        onChange={(key, value) => onChange({ ...state, values: { ...state.values, [key]: value } })}
        disabled={isSaving}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-card transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving || !name.trim()}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Сохранить макрос
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-surface px-3 py-2 text-xs font-semibold text-text-muted transition-colors hover:text-text"
          disabled={isSaving}
        >
          Отмена
        </button>
      </div>
    </form>
  );
};

const ActionsPanel = () => {
  const [catalog, setCatalog] = useState<ActionCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isCatalogLoading, setCatalogLoading] = useState(true);
  const [macros, setMacros] = useState<ActionMacro[]>([]);
  const [macrosError, setMacrosError] = useState<string | null>(null);
  const [isMacrosLoading, setMacrosLoading] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeRecipeName, setActiveRecipeName] = useState<string | null>(null);
  const [result, setResult] = useState<ActionRunResult | null>(null);
  const [isRunning, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [isDropActive, setDropActive] = useState(false);
  const [macroEditor, setMacroEditor] = useState<MacroEditorState | null>(null);
  const [isSavingMacro, setSavingMacro] = useState(false);

  useEffect(() => {
    setCatalogLoading(true);
    void fetchActionCatalog()
      .then((data) => {
        setCatalog(data);
        setCatalogError(null);
        setActiveRecipeName((current) => current ?? data.recipes[0]?.name ?? null);
      })
      .catch((error) => {
        console.error("Не удалось загрузить каталог действий", error);
        setCatalogError(error instanceof Error ? error.message : "Не удалось загрузить каталог действий.");
      })
      .finally(() => setCatalogLoading(false));
  }, []);

  const refreshMacros = useCallback(() => {
    setMacrosLoading(true);
    void listMacros()
      .then((items) => {
        setMacros(items);
        setMacrosError(null);
      })
      .catch((error) => {
        console.error("Не удалось загрузить макросы", error);
        setMacrosError(error instanceof Error ? error.message : "Не удалось загрузить макросы.");
      })
      .finally(() => setMacrosLoading(false));
  }, []);

  useEffect(() => {
    refreshMacros();
  }, [refreshMacros]);

  const recipes = catalog?.recipes ?? [];
  const selectedRecipe = useMemo(
    () => recipes.find((recipe) => recipe.name === activeRecipeName) ?? null,
    [recipes, activeRecipeName],
  );

  const filteredRecipes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return recipes.filter((recipe) => {
      if (selectedCategories.length && !selectedCategories.every((item) => recipe.categories.includes(item))) {
        return false;
      }
      if (selectedTags.length && !selectedTags.every((tag) => recipe.tags.includes(tag))) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        recipe.title.toLowerCase().includes(query) ||
        recipe.description.toLowerCase().includes(query) ||
        recipe.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    });
  }, [recipes, selectedCategories, selectedTags, searchQuery]);

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((item) => item !== category) : [...prev, category],
    );
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag]));
  };

  const performRun = async (recipe: ActionRecipe, parameters: ParameterState) => {
    setRunning(true);
    setRunError(null);
    try {
      const response = await runAction(recipe.name, parameters);
      setResult(response);
    } catch (error) {
      console.error("Не удалось выполнить действие", error);
      setRunError(error instanceof Error ? error.message : "Не удалось выполнить действие.");
    } finally {
      setRunning(false);
    }
  };

  const handleRunRecipe = (recipe: ActionRecipe, parameters?: ParameterState) => {
    setActiveRecipeName(recipe.name);
    const initial = parameters ?? mergeParameters(recipe, result?.parameters ?? {});
    void performRun(recipe, initial);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDropActive(false);
    const recipeName = event.dataTransfer.getData("application/x-kolibri-recipe");
    if (!recipeName) {
      return;
    }
    const recipe = recipes.find((item) => item.name === recipeName);
    if (recipe) {
      handleRunRecipe(recipe, mergeParameters(recipe));
    }
  };

  const openMacroEditor = (recipe: ActionRecipe, macro?: ActionMacro, parameters?: ParameterState) => {
    const baseValues = macro ? mergeParameters(recipe, macro.parameters) : mergeParameters(recipe, parameters);
    setMacroEditor({
      recipe,
      macro,
      name: macro?.name ?? recipe.title,
      tags: macro?.tags.join(", ") ?? "",
      values: baseValues,
    });
  };

  const handleSaveMacro = async (payload: ActionMacroPayload, macroId?: string) => {
    setSavingMacro(true);
    try {
      if (macroId) {
        await updateMacro(macroId, payload);
      } else {
        await createMacro(payload);
      }
      setMacroEditor(null);
      refreshMacros();
    } catch (error) {
      console.error("Не удалось сохранить макрос", error);
      setMacrosError(error instanceof Error ? error.message : "Не удалось сохранить макрос.");
    } finally {
      setSavingMacro(false);
    }
  };

  const handleDeleteMacro = async (macro: ActionMacro) => {
    setMacrosError(null);
    try {
      await deleteMacro(macro.id);
      refreshMacros();
    } catch (error) {
      console.error("Не удалось удалить макрос", error);
      setMacrosError(error instanceof Error ? error.message : "Не удалось удалить макрос.");
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-lg font-semibold text-text">Рецепты действий Kolibri</h2>
        <p className="text-sm text-text-muted">
          Собирайте сложные server-side операции из готовых блоков, перетаскивайте рецепты в зону запуска и сохраняйте персональные макросы.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-border/70 bg-surface px-5 py-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Поиск по названию, описанию или тегам"
                  className="w-full rounded-xl border border-border/70 bg-surface px-9 py-2 text-sm text-text focus:border-brand focus:outline-none"
                />
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface-muted px-3 py-1 text-xs text-text-muted">
                <Filter className="h-3.5 w-3.5" /> Фильтры
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(catalog?.categories ?? []).map((category) => {
                const isActive = selectedCategories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                      isActive
                        ? "border-brand/40 bg-brand/10 text-brand"
                        : "border-border/60 bg-surface-muted text-text-muted hover:text-text"
                    }`}
                  >
                    {category}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {(catalog?.tags ?? []).map((tag) => {
                const isActive = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                      isActive
                        ? "border-brand/40 bg-brand/10 text-brand"
                        : "border-border/60 bg-surface-muted text-text-muted hover:text-text"
                    }`}
                  >
                    #{tag}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            {catalogError ? (
              <p className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-600">{catalogError}</p>
            ) : null}
            {isCatalogLoading ? (
              <div className="flex items-center justify-center rounded-2xl border border-border/70 bg-surface px-4 py-10">
                <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredRecipes.map((recipe) => {
                  const isActive = recipe.name === activeRecipeName;
                  return (
                    <article
                      key={recipe.name}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "copy";
                        event.dataTransfer.setData("application/x-kolibri-recipe", recipe.name);
                        event.dataTransfer.setData("text/plain", recipe.title);
                      }}
                      onClick={() => setActiveRecipeName(recipe.name)}
                      className={`flex cursor-grab flex-col gap-3 rounded-2xl border px-4 py-4 transition-colors hover:border-brand/50 hover:bg-brand/5 ${
                        isActive ? "border-brand/60 bg-brand/10" : "border-border/70 bg-surface"
                      }`}
                    >
                      <div>
                        <h3 className="flex items-center justify-between text-sm font-semibold text-text">
                          {recipe.title}
                          {recipe.estimatedDuration ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-1 text-[0.65rem] text-text-muted">
                              <Clock3 className="h-3 w-3" /> {recipe.estimatedDuration}
                            </span>
                          ) : null}
                        </h3>
                        <p className="mt-1 text-xs text-text-muted">{recipe.description}</p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {recipe.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-surface-muted px-2 py-1 text-[0.6rem] uppercase tracking-[0.2em] text-text-muted">
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <div className="mt-auto flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRunRecipe(recipe, mergeParameters(recipe));
                          }}
                          className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground shadow-card transition-transform hover:scale-[1.02]"
                        >
                          <Play className="h-3.5 w-3.5" /> Запустить
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openMacroEditor(recipe, undefined, result?.parameters ?? mergeParameters(recipe));
                          }}
                          className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-surface-muted px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-text"
                        >
                          <ListChecks className="h-3.5 w-3.5" /> Макрос
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!filteredRecipes.length ? (
                  <p className="col-span-full rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-text-muted">
                    Рецептов по заданным фильтрам не найдено.
                  </p>
                ) : null}
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-border/70 bg-surface px-5 py-6 shadow-sm">
            <header className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
                <Tags className="h-4 w-4 text-brand" /> Мои макросы
              </h3>
              <button
                type="button"
                onClick={() => {
                  if (selectedRecipe) {
                    openMacroEditor(selectedRecipe, undefined, result?.parameters ?? mergeParameters(selectedRecipe));
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-brand/40 bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/20"
              >
                <Plus className="h-3.5 w-3.5" /> Новый макрос
              </button>
            </header>

            {macrosError ? (
              <p className="rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-600">{macrosError}</p>
            ) : null}

            {macroEditor ? (
              <MacroEditor
                state={macroEditor}
                isSaving={isSavingMacro}
                onChange={setMacroEditor}
                onCancel={() => setMacroEditor(null)}
                onSubmit={handleSaveMacro}
              />
            ) : null}

            {isMacrosLoading ? (
              <div className="flex items-center justify-center rounded-xl border border-border/70 bg-surface-muted px-4 py-6">
                <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
              </div>
            ) : macros.length ? (
              <ul className="space-y-3">
                {macros.map((macro) => {
                  const recipe = recipes.find((candidate) => candidate.name === macro.action);
                  return (
                    <li key={macro.id} className="rounded-xl border border-border/70 bg-surface-muted px-4 py-3 text-sm text-text">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-text">{macro.name}</p>
                          <p className="text-xs text-text-muted">
                            Рецепт: {recipe?.title ?? macro.action}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (recipe) {
                                setActiveRecipeName(recipe.name);
                                handleRunRecipe(recipe, mergeParameters(recipe, macro.parameters));
                              }
                            }}
                            className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground"
                          >
                            <Play className="h-3.5 w-3.5" /> Запустить
                          </button>
                          <button
                            type="button"
                            onClick={() => recipe && openMacroEditor(recipe, macro)}
                            className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-surface px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-text"
                          >
                            Редактировать
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMacro(macro)}
                            className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-surface px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:text-red-600"
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                      {macro.tags.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {macro.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-surface px-2 py-1 text-[0.6rem] uppercase tracking-[0.2em] text-text-muted">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-border/60 px-3 py-4 text-xs text-text-muted">
                Макросов пока нет. Сохраните параметры запуска, чтобы поделиться ими с командой.
              </p>
            )}
          </section>
        </div>

        <div className="space-y-4">
          <div
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes("application/x-kolibri-recipe")) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
                setDropActive(true);
              }
            }}
            onDragLeave={() => setDropActive(false)}
            onDrop={handleDrop}
            className={`rounded-2xl border-2 border-dashed px-5 py-6 text-sm transition-colors ${
              isDropActive ? "border-brand bg-brand/10 text-brand" : "border-border/60 bg-surface text-text-muted"
            }`}
          >
            <div className="flex items-center gap-3">
              <Wand2 className="h-5 w-5" />
              <div>
                <p className="font-semibold text-text">Перетащите рецепт сюда для запуска</p>
                <p className="text-xs">
                  Используйте drag-and-drop из галереи слева. Будут применены значения по умолчанию, параметры можно скорректировать в отладчике.
                </p>
              </div>
            </div>
          </div>

          <ActionDebugger
            recipe={selectedRecipe ?? undefined}
            result={result}
            isRunning={isRunning}
            error={runError}
            onRun={(parameters) => {
              if (!selectedRecipe) {
                return;
              }
              handleRunRecipe(selectedRecipe, parameters);
            }}
            onResetParameters={() => {
              if (!selectedRecipe) {
                return;
              }
              setResult(null);
            }}
            onSaveMacro={(parameters) => {
              if (selectedRecipe) {
                openMacroEditor(selectedRecipe, undefined, parameters);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default ActionsPanel;
