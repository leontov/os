import { type ReactNode } from "react";
import { tv, type VariantProps } from "tailwind-variants";

const badgeStyles = tv({
  base: "inline-flex items-center rounded-full border font-medium px-3 py-1 text-xs uppercase tracking-wide", 
  variants: {
    tone: {
      neutral: "border-[var(--border-subtle)] text-[var(--muted)] bg-[rgba(154,163,178,0.08)]",
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

interface BadgeProps extends VariantProps<typeof badgeStyles> {
  children: ReactNode;
}

export function Badge({ children, tone }: BadgeProps) {
  return <span className={badgeStyles({ tone })}>{children}</span>;
}
