import WorkspacePlaceholder from "./WorkspacePlaceholder";

const SwarmView = () => (
  <div className="flex min-h-0 flex-1 flex-col gap-6">
    <WorkspacePlaceholder
      badge="Swarm Core"
      title="Оркестрация роя"
      description="Готовим центр управления агентами: распределяйте нагрузку, наблюдайте за статусами и подключайте своих ассистентов."
      hint="Расскажите нам, какие процессы должны покрывать агенты, и мы сделаем сценарии первыми."
      actions={
        <button type="button" className="ghost-button text-xs">
          Описать сценарий
        </button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="glass-panel p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-primary/80">Многозадачность</p>
          <p className="mt-2 text-sm text-text-secondary">
            Планируйте параллельные цепочки действий, настраивайте зависимости и управляйте таймерами выполнения.
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-primary/80">Наблюдение</p>
          <p className="mt-2 text-sm text-text-secondary">
            Live-лог действий агентов с подсветкой рисков и рекомендациями по ручному вмешательству.
          </p>
        </div>
      </div>
    </WorkspacePlaceholder>
  </div>
);

export default SwarmView;
