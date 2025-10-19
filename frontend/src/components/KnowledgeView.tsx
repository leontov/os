import type { KnowledgeStatus } from "../core/knowledge";
import StatusBar from "./StatusBar";
import WorkspacePlaceholder from "./WorkspacePlaceholder";

interface KnowledgeViewProps {
  status: KnowledgeStatus | null;
  error?: string;
  isLoading?: boolean;
  onRefresh?: () => void;
}

const KnowledgeView = ({ status, error, isLoading, onRefresh }: KnowledgeViewProps) => (
  <div className="flex min-h-0 flex-1 flex-col gap-6">
    <StatusBar status={status} error={error} isLoading={isLoading} onRefresh={onRefresh} />
    <WorkspacePlaceholder
      badge="Контур памяти"
      title="Мониторинг знаний"
      description="Мы строим панель, которая покажет загрузку документов, состояние пайплайна и свежие события в базе знаний Kolibri."
      hint="До релиза вы можете обновлять статус вручную и отслеживать количество документов с помощью верхней панели."
      actions={
        <>
          <button type="button" className="ghost-button text-xs">
            Запросить отчёт
          </button>
          <button type="button" className="ghost-button text-xs">
            Настроить интеграции
          </button>
        </>
      }
    >
      <ul className="grid gap-4 sm:grid-cols-2">
        <li className="glass-panel p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-primary/80">Слои данных</p>
          <p className="mt-2 text-sm text-text-secondary">
            Поддержка Confluence, Google Drive и внутренних хранилищ появится здесь, чтобы вы контролировали, что уже подключено.
          </p>
        </li>
        <li className="glass-panel p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-primary/80">Контроль качества</p>
          <p className="mt-2 text-sm text-text-secondary">
            Вы увидите автоматические проверки полноты, свежести и точности с рекомендациями по исправлению.
          </p>
        </li>
      </ul>
    </WorkspacePlaceholder>
  </div>
);

export default KnowledgeView;
