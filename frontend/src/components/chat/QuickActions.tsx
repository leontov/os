import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

export interface QuickAction {
  id: string;
  title: string;
  description: string;
  prompt: string;
  icon: LucideIcon;
  accent: string;
  badge?: ReactNode;
}

interface QuickActionsProps {
  actions: ReadonlyArray<QuickAction>;
  onSelect: (prompt: string) => void;
}

export function QuickActions({ actions, onSelect }: QuickActionsProps) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="list">
      {actions.map((action) => {
        const Icon = action.icon;
        const accentVariables: Record<string, string> = {
          "--action-accent": action.accent,
          "--action-accent-border": `${action.accent}66`,
        };
        return (
          <li key={action.id}>
            <button
              type="button"
              onClick={() => onSelect(action.prompt)}
              className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-transparent bg-[var(--surface-card)]/80 p-5 text-left transition duration-300 hover:-translate-y-1 hover:border-[var(--action-accent-border)] hover:shadow-[0_24px_65px_rgba(14,17,22,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--action-accent-border)] focus-visible:ring-offset-[rgba(10,12,18,0.7)]"
              style={{
                ...accentVariables,
                backgroundImage: `linear-gradient(135deg, ${action.accent}24, transparent 70%)`,
                borderColor: "transparent",
              }}
              aria-label={action.title}
            >
              <span
                className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100"
                style={{ background: `radial-gradient(circle at top right, ${action.accent}33, transparent 60%)` }}
                aria-hidden
              />
              <span className="flex items-center justify-between gap-3">
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-2xl shadow-[0_12px_35px_rgba(0,0,0,0.3)]"
                  style={{
                    backgroundColor: `${action.accent}22`,
                    color: action.accent,
                  }}
                >
                  <Icon aria-hidden className="h-5 w-5" />
                </span>
                {action.badge ? <span className="text-xs text-[var(--muted)]">{action.badge}</span> : null}
              </span>
              <span className="mt-6 flex flex-col gap-2">
                <span className="text-base font-semibold leading-tight text-[var(--text)]">{action.title}</span>
                <span className="text-sm leading-relaxed text-[var(--text-subtle)]">{action.description}</span>
              </span>
              <span
                className="mt-6 inline-flex items-center gap-1 text-sm font-medium"
                style={{ color: action.accent }}
              >
                <span>{action.prompt}</span>
                <ArrowUpRight aria-hidden className="h-4 w-4 transition duration-300 group-hover:translate-x-1" />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
