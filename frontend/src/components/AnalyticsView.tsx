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

export default AnalyticsView;
