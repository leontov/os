import type { KnowledgeStatus } from "../core/knowledge";
import StatusBar from "./StatusBar";

interface KnowledgeViewProps {
  status: KnowledgeStatus | null;
  error?: string;
  isLoading?: boolean;
  onRefresh?: () => void;
}

const KnowledgeView = ({ status, error, isLoading, onRefresh }: KnowledgeViewProps) => (
  <div className="flex h-full flex-1 flex-col gap-6">
    <StatusBar status={status} error={error} isLoading={isLoading} onRefresh={onRefresh} />
    <section className="glass-panel flex flex-1 flex-col justify-center gap-3 p-10 text-text-secondary">
      <h2 className="text-2xl font-semibold text-text-primary">Мониторинг знаний</h2>
      <p>
        Здесь появятся метрики загрузки данных, состояние пайплайна и свежие обновления базы знаний. Пока вы
        можете использовать кнопку «Обновить», чтобы получить актуальную информацию.
      </p>
    </section>
  </div>
);

export default KnowledgeView;
