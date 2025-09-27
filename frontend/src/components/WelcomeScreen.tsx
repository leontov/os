import type { ElementType } from "react";
import {
  BookOpenText,
  BrainCircuit,
  Compass,
  Lightbulb,
  Rocket,
  Wand2,
} from "lucide-react";
import type { PromptScenario } from "../types/chat";
import SuggestionCard from "./SuggestionCard";

interface SuggestionItem extends PromptScenario {
  readonly icon: ElementType;
}

const suggestionItems: SuggestionItem[] = [
  {
    icon: Rocket,
    title: "Перо в небе",
    description: "Начнём писать!",
    prompt: "Помоги мне написать текст...",
  },
  {
    icon: Compass,
    title: "Соберём план",
    description: "Соберём маршрут идей.",
    prompt: "Составь подробный план по теме...",
  },
  {
    icon: BookOpenText,
    title: "Прочитать тексты",
    description: "Напоминание изучаться.",
    prompt: "Какие ключевые материалы стоит прочитать по теме...",
  },
  {
    icon: BrainCircuit,
    title: "Откроем горизонты",
    description: "Загрузим знания!",
    prompt: "Подскажи новые горизонты знаний для...",
  },
  {
    icon: Lightbulb,
    title: "Переведи мысли в варианты",
    description: "Варианты решений и идей.",
    prompt: "Помоги придумать несколько вариантов...",
  },
  {
    icon: Wand2,
    title: "Вплетём метафоры",
    description: "Украсим смысл.",
    prompt: "Подбери выразительные метафоры для...",
  },
] as const;

interface WelcomeScreenProps {
  onSuggestionSelect: (scenario: PromptScenario) => void;
  selectedScenario: PromptScenario | null;
  disabled?: boolean;
}

const WelcomeScreen = ({ onSuggestionSelect, selectedScenario, disabled = false }: WelcomeScreenProps) => {
  const activeScenario = selectedScenario;

  return (
    <section className="relative flex h-full flex-col overflow-hidden rounded-[36px] border border-white/60 bg-white/80 p-12 shadow-hero">
      <div className="pointer-events-none absolute -right-20 top-12 h-64 w-64 rounded-full bg-primary/20 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-24 left-12 h-72 w-72 rounded-full bg-accent-coral/20 blur-3xl" />
      <div className="relative z-10 grid flex-1 gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="flex flex-col justify-between gap-10">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Фаза 4 • Визуальная Кора
            </span>
            <div className="space-y-4">
              <p className="text-base font-medium text-text-light">Привет, Владислав!</p>
              <h1 className="text-4xl font-semibold leading-tight text-text-dark">
                Колибри готов соединиться с твоим потоком идей. Выбери траекторию и начнём полёт.
              </h1>
              <p className="text-sm leading-relaxed text-text-light">
                Каждая карточка — сценарий запуска ядра. Нажми, чтобы моментально заполнить запрос и перейти к диалогу.
              </p>
            </div>
          </div>
          <div className="hidden flex-col gap-2 text-sm text-text-light lg:flex">
            <span className="font-semibold text-text-dark">Сигналы состояния</span>
            <p>• Ядро C11/WASM синхронизировано • Канал телеметрии стабилен • Готовность к генерации: 100%</p>
          </div>
          {activeScenario && (
            <div className="rounded-3xl border border-primary/40 bg-primary/10 p-6 text-sm text-text-dark shadow-card">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary/80">Сценарий выбран</p>
              <p className="mt-3 text-lg font-semibold">{activeScenario.title}</p>
              <p className="mt-2 text-text-light">{activeScenario.prompt}</p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {suggestionItems.map((item) => (
            <SuggestionCard
              key={item.title}
              icon={item.icon}
              title={item.title}
              description={item.description}
              onSelect={() => onSuggestionSelect(item)}
              active={selectedScenario?.prompt === item.prompt}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default WelcomeScreen;
export type { PromptScenario as WelcomeSuggestion };
