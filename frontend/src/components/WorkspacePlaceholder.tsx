import type { PropsWithChildren, ReactNode } from "react";

interface WorkspacePlaceholderProps {
  title: string;
  description: string;
  badge?: string;
  hint?: string;
  actions?: ReactNode;
}

const WorkspacePlaceholder = ({
  title,
  description,
  badge = "Скоро",
  hint,
  actions,
  children,
}: PropsWithChildren<WorkspacePlaceholderProps>) => (
  <section className="relative overflow-hidden rounded-[2.5rem] border border-border-strong/60 bg-background-panel/70 p-10 text-text-secondary shadow-[0_38px_120px_-64px_rgba(15,23,42,0.85)] backdrop-blur">
    <div
      className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.28),transparent_65%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.25),transparent_60%)] opacity-80"
      aria-hidden="true"
    />
    <div className="relative z-10 flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.35em] text-text-secondary/80">
        {badge ? <span className="pill-badge border-primary/50 bg-primary/10 text-primary">{badge}</span> : null}
        <span className="hidden text-text-secondary/60 md:inline">Kolibri Experience</span>
      </div>
      <div className="space-y-4">
        <h2 className="text-3xl font-semibold text-text-primary">{title}</h2>
        <p className="max-w-3xl text-base leading-relaxed text-text-secondary">{description}</p>
      </div>
      {children ? <div className="space-y-4 text-sm leading-relaxed text-text-secondary/90">{children}</div> : null}
      {hint ? <p className="max-w-2xl text-sm text-text-secondary/70">{hint}</p> : null}
      {actions ? <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-text-secondary">{actions}</div> : null}
    </div>
  </section>
);

export default WorkspacePlaceholder;
