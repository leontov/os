import { Activity, ArrowUpRight, BarChart3, Gauge, Layers, MessageSquare, Sparkles } from "lucide-react";
import type { ConversationAnalyticsOverview } from "../core/useKolibriChat";

interface AnalyticsViewProps {
  analytics: ConversationAnalyticsOverview;
}

const SummaryCard = ({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  description: string;
}) => (
  <article className="glass-panel flex flex-col gap-2 p-5">
    <div className="flex items-center gap-3 text-text-secondary">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <p className="text-xs uppercase tracking-[0.35em]">{label}</p>
    </div>
    <p className="text-2xl font-semibold text-text-primary">{value}</p>
    <p className="text-xs text-text-secondary/80">{description}</p>
  </article>
import WorkspacePlaceholder from "./WorkspacePlaceholder";

const AnalyticsView = () => (
  <div className="flex min-h-0 flex-1 flex-col gap-6">
    <WorkspacePlaceholder
      badge="Аналитика"
      title="Аналитика взаимодействий"
      description="Команда строит панель с графиками продуктивности, скоростью ответов и качеством решений Kolibri в ваших процессах."
      hint="Соберите пожелания команды и мы включим их в первую версию аналитического контура."
      actions={
        <>
          <button type="button" className="ghost-button text-xs">
            Оставить запрос
          </button>
          <button type="button" className="ghost-button text-xs">
            Поделиться метриками
          </button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass-panel p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-primary/80">Команда</p>
          <p className="mt-2 text-sm text-text-secondary">
            Персональные отчёты по активности сотрудников и автоматические рекомендации по оптимизации процессов.
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-primary/80">Продуктивность</p>
          <p className="mt-2 text-sm text-text-secondary">
            Визуализации скорости ответов, распределение типов запросов и вклад Kolibri в выполнение задач.
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-primary/80">Экспорт</p>
          <p className="mt-2 text-sm text-text-secondary">
            Готовые шаблоны отчётов для руководителей и дашборды, которые можно подключить к BI-системам.
          </p>
        </div>
      </div>
    </WorkspacePlaceholder>
  </div>
);

const formatDate = (iso?: string): string => {
  if (!iso) {
    return "—";
  }
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const AnalyticsView = ({ analytics }: AnalyticsViewProps) => {
  const { totals, timeline, modeUsage, preferenceBreakdown, leaderboard } = analytics;
  const maxTimelineValue = timeline.reduce((acc, point) => Math.max(acc, point.totalMessages), 1);

  const preferenceItems = [
    { label: "Обучение", value: preferenceBreakdown.learningEnabled },
    { label: "Приватный режим", value: preferenceBreakdown.privateMode },
    { label: "Онлайн доступ", value: preferenceBreakdown.allowOnline },
    { label: "Безопасный тон", value: preferenceBreakdown.safeTone },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <section className="grid gap-4 lg:grid-cols-5">
        <SummaryCard
          icon={Layers}
          label="Беседы"
          value={`${totals.conversations}`}
          description={`Активных сегодня: ${totals.activeToday}`}
        />
        <SummaryCard
          icon={MessageSquare}
          label="Сообщения"
          value={`${totals.messages}`}
          description={`Пользовательских: ${totals.userMessages}`}
        />
        <SummaryCard
          icon={Sparkles}
          label="Контекст"
          value={`${totals.knowledgeReferences}`}
          description="Ответов с подключением базы знаний"
        />
        <SummaryCard
          icon={Gauge}
          label="Средняя длина"
          value={`${totals.averageMessagesPerConversation}`}
          description="Сообщений на беседу"
        />
        <SummaryCard
          icon={Activity}
          label="Ответы Kolibri"
          value={`${totals.assistantMessages}`}
          description="Сгенерировано за весь период"
        />
      </section>

      <section className="glass-panel grid gap-6 p-6 lg:grid-cols-[minmax(0,2fr),minmax(0,1fr)]">
        <div className="space-y-4">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">7 последних дней</p>
              <h2 className="mt-1 text-lg font-semibold text-text-primary">Активность по дням</h2>
            </div>
            <span className="text-xs text-text-secondary/80">Всего сообщений: {totals.messages}</span>
          </header>
          {timeline.length ? (
            <div className="flex items-end gap-3 overflow-x-auto pb-2">
              {timeline.map((point) => {
                const height = Math.round((point.totalMessages / maxTimelineValue) * 100);
                return (
                  <div key={point.dateKey} className="flex w-12 flex-col items-center gap-2">
                    <div className="flex h-24 w-full flex-col justify-end overflow-hidden rounded-xl bg-background-input/70">
                      <div
                        className="mx-1 rounded-t-xl bg-primary/70"
                        style={{ height: `${height || 4}%` }}
                        title={`Всего: ${point.totalMessages}\nПользователи: ${point.userMessages}\nKolibri: ${point.assistantMessages}`}
                      />
                    </div>
                    <span className="text-[0.7rem] font-semibold text-text-secondary">{point.label}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border-strong/60 p-4 text-sm text-text-secondary">
              Нет активности в выбранном периоде. Начните беседу, чтобы увидеть аналитику.
            </p>
          )}
        </div>
        <div className="space-y-4">
          <header>
            <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">Распределение режимов</p>
            <h3 className="mt-1 text-lg font-semibold text-text-primary">Профили диалогов</h3>
          </header>
          <div className="space-y-3">
            {modeUsage.length ? (
              modeUsage.map((entry) => (
                <div key={entry.mode}>
                  <div className="flex items-center justify-between text-sm text-text-secondary">
                    <span className="font-semibold text-text-primary">{entry.label}</span>
                    <span>{entry.count} · {entry.percentage}%</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background-input/70">
                    <div
                      className="h-full rounded-full bg-accent/70"
                      style={{ width: `${Math.max(entry.percentage, 4)}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed border-border-strong/60 p-3 text-xs text-text-secondary">
                Пока доступен только стандартный режим. Появятся новые профили — статистика обновится автоматически.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,3fr),minmax(0,2fr)]">
        <article className="glass-panel overflow-hidden p-6">
          <header className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">Лидеры</p>
              <h3 className="mt-1 text-lg font-semibold text-text-primary">Беседы с наибольшей активностью</h3>
            </div>
            <ArrowUpRight className="h-5 w-5 text-text-secondary" />
          </header>
          {leaderboard.length ? (
            <table className="mt-4 w-full border-collapse text-sm text-text-secondary">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-text-secondary/70">
                  <th className="pb-3">Название</th>
                  <th className="pb-3">Сообщений</th>
                  <th className="pb-3">Контекст</th>
                  <th className="pb-3">Обновлено</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((entry) => (
                  <tr key={entry.id} className="border-t border-border-strong/40 text-sm">
                    <td className="py-3 pr-3 font-semibold text-text-primary">{entry.title}</td>
                    <td className="py-3 pr-3">{entry.messages}</td>
                    <td className="py-3 pr-3">{entry.knowledgeReferences}</td>
                    <td className="py-3 pr-3 text-xs text-text-secondary/80">{formatDate(entry.updatedAtIso)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-border-strong/60 p-4 text-sm text-text-secondary">
              Список лидеров появится после первых бесед.
            </p>
          )}
        </article>

        <article className="glass-panel flex flex-col gap-4 p-6">
          <header>
            <p className="text-xs uppercase tracking-[0.35em] text-text-secondary">Параметры приватности</p>
            <h3 className="mt-1 text-lg font-semibold text-text-primary">Настройки участников</h3>
          </header>
          <div className="grid gap-3">
            {preferenceItems.map((item) => (
              <div key={item.label} className="glass-panel flex items-center justify-between px-4 py-3 text-sm text-text-secondary">
                <span className="font-semibold text-text-primary">{item.label}</span>
                <span>{item.value} из {preferenceBreakdown.total}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-text-secondary/70">
            Значения вычисляются по сохранённым беседам (приватные диалоги исключаются из аналитики автоматически).
          </p>
        </article>
      </section>
    </div>
  );
};

export default AnalyticsView;
