import { ArrowRight, Activity, Cpu, FileText, Shield, Video } from "lucide-react";

export type DemoMetrics = {
  coldStartMs: number | null;
  wasmBytes: number | null;
  offlineFallback: boolean;
  degradedReason: string | null;
};

type DemoPageProps = {
  metrics: DemoMetrics;
  onLaunchApp: () => void;
};

const formatMs = (value: number | null): string => {
  if (value == null) {
    return "—";
  }
  return `${Math.round(value)} мс`;
};

const formatBytes = (value: number | null): string => {
  if (value == null) {
    return "—";
  }
  const megabytes = value / (1024 * 1024);
  if (megabytes >= 1) {
    return `${megabytes.toFixed(2)} МБ`;
  }
  return `${(value / 1024).toFixed(1)} КБ`;
};

const resolveDocsUrl = (path: string): string => {
  const base = import.meta.env.BASE_URL ?? "/";
  const normalized = base.endsWith("/") ? base : `${base}/`;
  return `${normalized}${path}`.replace(/\/{2,}/g, "/");
};

const SCENARIOS = [
  {
    id: "sso_rbac_intro",
    title: "SSO & RBAC onboarding",
    summary: "Настройка IdP, проверка SAML-ответа и вызов защищённого инференса.",
  },
  {
    id: "observability_ops",
    title: "Prometheus & Grafana",
    summary: "Подключение `/metrics`, настройка ServiceMonitor и дашборда.",
  },
  {
    id: "audit_forensics",
    title: "Genome audit trail",
    summary: "Разбор журналов аудита и трассировка событий генома.",
  },
  {
    id: "pwa_resilience",
    title: "PWA resilience",
    summary: "Работа с холодным стартом, офлайн-кэшем и сценариями деградации.",
  },
  {
    id: "helm_rollout",
    title: "Helm rollout",
    summary: "Деплой enterprise-чарта и прогон smoke-теста run_all.sh.",
  },
  {
    id: "supply_chain_guardrails",
    title: "Supply chain guardrails",
    summary: "SBOM, подписание wasm и контроль цепочки поставки.",
  },
];

const FEATURES = [
  {
    icon: Shield,
    title: "SSO/SAML + RBAC",
    description: "Атрибуты IdP транслируются в токены Kolibri, политика прав хранится в ConfigMap.",
  },
  {
    icon: Activity,
    title: "Observability",
    description: "Метрики `kolibri_infer_*` доступны по `/metrics`, готов ServiceMonitor и Grafana dashboard.",
  },
  {
    icon: FileText,
    title: "Аудит и геном",
    description: "Структурированные JSONL-журналы для расследований и цепочки знаний.",
  },
  {
    icon: Cpu,
    title: "WASM PWA",
    description: "Контроль размера ядра, метрики холодного старта и сценарии деградации в offline.",
  },
];

const DemoPage = ({ metrics, onLaunchApp }: DemoPageProps) => {
  const docUrl = resolveDocsUrl("docs/security_whitepaper.md");
  const bundleUrl = resolveDocsUrl("docs/enterprise_bundle_v1.md");
  const wasmUrl = resolveDocsUrl("docs/wasm_pwa_delivery.md");
  const demoGuideUrl = resolveDocsUrl("docs/demo_showcase.md");
  const videoHashesUrl = resolveDocsUrl("logs/demo_videos/hashes.txt");

  return (
    <div className="min-h-screen bg-surface text-text">
      <header className="bg-surface-muted border-b border-border/50">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 md:flex-row md:items-center md:justify-between">
          <div className="max-w-3xl space-y-4">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface px-4 py-1 text-xs uppercase tracking-[0.35em] text-text-muted">
              Enterprise Bundle v1
            </span>
            <h1 className="text-4xl font-semibold tracking-tight text-text md:text-5xl">
              Kolibri OS для регуляторов, аналитиков и DevSecOps
            </h1>
            <p className="text-lg text-text-muted md:text-xl">
              SSO/SAML, RBAC, аудит «генома», Prometheus/Grafana и готовый Helm-чарт — всё в одной поставке.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onLaunchApp}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow transition hover:shadow-lg"
              >
                Запустить Kolibri
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href={docUrl}
                className="inline-flex items-center gap-2 rounded-full border border-border/70 px-5 py-3 text-sm font-semibold text-text transition hover:bg-surface"
                target="_blank"
                rel="noreferrer"
              >
                Security Whitepaper
              </a>
              <a
                href={bundleUrl}
                className="inline-flex items-center gap-2 rounded-full border border-border/70 px-5 py-3 text-sm font-semibold text-text transition hover:bg-surface"
                target="_blank"
                rel="noreferrer"
              >
                Enterprise bundle spec
              </a>
            </div>
          </div>
          <div className="grid gap-3 rounded-3xl border border-border/60 bg-surface p-6 shadow-lg md:w-80">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-text-muted">Cold start</p>
              <p className="mt-1 text-2xl font-semibold text-text">{formatMs(metrics.coldStartMs)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-text-muted">Размер wasm</p>
              <p className="mt-1 text-2xl font-semibold text-text">{formatBytes(metrics.wasmBytes)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-text-muted">Offline fallback</p>
              <p className="mt-1 text-lg font-medium text-text">
                {metrics.offlineFallback ? "активирован" : "не требуется"}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-text-muted">Деградация</p>
              <p className="mt-1 text-sm font-medium text-text">
                {metrics.degradedReason ? metrics.degradedReason : "нет"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-16 px-6 py-12">
        <section className="grid gap-6 md:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-3xl border border-border/60 bg-surface p-6 shadow-sm transition hover:shadow-md">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className="text-lg font-semibold text-text">{title}</h2>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-text-muted">{description}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-border/60 bg-surface px-6 py-8 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-text">Видео-скрипты и логи</h2>
              <p className="text-sm text-text-muted">
                Сценарии синхронизированы со скриптом <code className="rounded bg-surface-muted px-2 py-1">scripts/generate_demo_storyboards.sh</code> и выполняются командой <code className="rounded bg-surface-muted px-2 py-1">scripts/run_all.sh</code>.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={demoGuideUrl}
                className="inline-flex items-center gap-2 rounded-full border border-border/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-text transition hover:bg-surface"
                target="_blank"
                rel="noreferrer"
              >
                Demo playbook
              </a>
              <a
                href={videoHashesUrl}
                className="inline-flex items-center gap-2 rounded-full border border-border/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-text transition hover:bg-surface"
                target="_blank"
                rel="noreferrer"
              >
                Hashes & logs
              </a>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {SCENARIOS.map((scenario) => (
              <a
                key={scenario.id}
                href={resolveDocsUrl(`logs/demo_videos/${scenario.id}.md`)}
                className="group flex flex-col gap-3 rounded-2xl border border-border/50 bg-surface-muted p-5 transition hover:border-primary/60 hover:shadow"
                target="_blank"
                rel="noreferrer"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                    <Video className="h-5 w-5" />
                  </span>
                  <h3 className="text-lg font-semibold text-text">{scenario.title}</h3>
                </div>
                <p className="text-sm text-text-muted">{scenario.summary}</p>
              </a>
            ))}
          </div>
        </section>

        <section className="grid gap-6 rounded-3xl border border-border/60 bg-surface px-6 py-8 shadow-sm md:grid-cols-3">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-text">Документация</h2>
            <p className="text-sm text-text-muted">
              Дополнительные материалы по WASM, безопасности и демонстрации.
            </p>
          </div>
          <div className="col-span-2 grid gap-3 sm:grid-cols-3">
            <a
              href={wasmUrl}
              className="rounded-2xl border border-border/60 bg-surface-muted px-4 py-3 text-sm font-semibold text-text transition hover:border-primary/60"
              target="_blank"
              rel="noreferrer"
            >
              WASM PWA Delivery
            </a>
            <a
              href={bundleUrl}
              className="rounded-2xl border border-border/60 bg-surface-muted px-4 py-3 text-sm font-semibold text-text transition hover:border-primary/60"
              target="_blank"
              rel="noreferrer"
            >
              Enterprise bundle spec
            </a>
            <a
              href="https://github.com/kolibri-os/kolibri-os/tree/main/deploy/helm/kolibri-enterprise"
              className="rounded-2xl border border-border/60 bg-surface-muted px-4 py-3 text-sm font-semibold text-text transition hover:border-primary/60"
              target="_blank"
              rel="noreferrer"
            >
              Helm chart repository
            </a>
          </div>
        </section>
      </main>
    </div>
  );
};

export default DemoPage;
