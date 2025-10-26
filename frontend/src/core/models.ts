export interface ModelOption {
  id: string;
  label: string;
  description: string;
  contextWindow: string;
  bestFor: string;
}

export type ModelId = ModelOption["id"];

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "kolibri-lite",
    label: "Kolibri Lite",
    description: "Экономичный режим для быстрых черновиков и коротких ответов.",
    contextWindow: "до 32K токенов",
    bestFor: "Быстрые проверки гипотез и черновики",
  },
  {
    id: "kolibri-base",
    label: "Kolibri Base",
    description: "Сбалансированная модель с поддержкой расширенной памяти и аналитики.",
    contextWindow: "до 64K токенов",
    bestFor: "Ежедневные задачи и аналитические заметки",
  },
  {
    id: "kolibri-pro",
    label: "Kolibri Pro",
    description: "Продвинутая reasoning-модель с увеличенным контекстом и точностью.",
    contextWindow: "до 128K токенов",
    bestFor: "Стратегия, большие документы, отчёты",
  },
];

export const DEFAULT_MODEL_ID: ModelId = MODEL_OPTIONS[1]?.id ?? "kolibri-base";

export const findModelOption = (id: string): ModelOption | undefined =>
  MODEL_OPTIONS.find((option) => option.id === id);

export const findModelLabel = (id: string): string => findModelOption(id)?.label ?? id;
