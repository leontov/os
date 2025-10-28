import { type ReactNode } from "react";
import { tv } from "tailwind-variants";

const badgeStyles = tv({
  base:
    "inline-flex h-7 min-w-[2.5rem] items-center justify-center gap-2 rounded-full border px-3 text-[0.7rem] font-semibold uppercase tracking-[0.12em]",
  variants: {
    tone: {
      neutral: "border-[var(--border-subtle)] bg-[rgba(154,163,178,0.08)] text-[var(--muted)]",
      success: "border-[rgba(34,197,94,0.3)] text-[var(--ok)] bg-[rgba(34,197,94,0.12)]",
      warning: "border-[rgba(251,191,36,0.3)] text-[var(--warn)] bg-[rgba(251,191,36,0.12)]",
      danger: "border-[rgba(255,107,107,0.35)] text-[var(--danger)] bg-[rgba(255,107,107,0.12)]",
      accent: "border-[rgba(74,222,128,0.4)] text-[var(--brand)] bg-[var(--brand-ghost)]",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "accent";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

export function Badge({ children, tone, className }: BadgeProps) {
  return <span className={badgeStyles({ tone, className })}>{children}</span>;
}
