import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { tv } from "tailwind-variants";

type ButtonElement = HTMLButtonElement;

const buttonStyles = tv({
  base:
    "inline-flex min-h-[2.75rem] min-w-[2.75rem] items-center justify-center gap-2 rounded-xl border border-transparent px-4 text-[var(--font-size-md)] font-medium tracking-[-0.01em] transition-[background-color,border-color,transform] duration-150 focus-visible:outline-none focus-visible:[box-shadow:var(--focus-strong)] active:scale-95 disabled:pointer-events-none disabled:opacity-50",
  variants: {
    variant: {
      primary:
        "bg-[var(--brand)] text-[#04110b] shadow-[var(--shadow-1)] hover:bg-[var(--brand-strong)] hover:shadow-[var(--brand-glow)]",
      secondary:
        "bg-[var(--bg-elev)] text-[var(--text)] border-[color:var(--border-subtle)] hover:border-[color:var(--brand)] hover:text-[var(--brand)]",
      ghost:
        "bg-transparent text-[var(--text)] hover:bg-[var(--brand-ghost)] hover:text-[var(--brand)] focus-visible:border-[color:rgba(74,222,128,0.35)]",
      outline:
        "border-[color:var(--border-subtle)] bg-transparent text-[var(--text)] hover:border-[color:var(--brand)] hover:text-[var(--brand)]",
      danger: "bg-[var(--danger)] text-white shadow-[var(--shadow-1)] hover:bg-[#ef4444]",
    },
    tone: {
      neutral: "",
      accent: "text-[var(--brand)]",
    },
    size: {
      sm: "h-11 min-h-[2.75rem] px-3 text-sm",
      md: "h-12 min-h-[3rem] px-5 text-base",
      lg: "h-[3.25rem] min-h-[3.25rem] px-6 text-[1.05rem]",
      icon: "h-12 w-12 p-0",
    },
  },
  compoundVariants: [
    {
      variant: "ghost",
      tone: "accent",
      class: "hover:bg-[rgba(74,222,128,0.14)]",
    },
  ],
  defaultVariants: {
    variant: "primary",
    size: "md",
    tone: "neutral",
  },
});

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type ButtonTone = "neutral" | "accent";
type ButtonSize = "sm" | "md" | "lg" | "icon";

type NativeButtonProps = Omit<ButtonHTMLAttributes<ButtonElement>, "className" | "color" | "size">;

export interface ButtonProps extends NativeButtonProps {
  className?: string;
  isLoading?: boolean;
  loadingLabel?: string;
  children?: ReactNode;
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ButtonSize;
}

export const Button = forwardRef<ButtonElement, ButtonProps>(
  ({ variant, tone, size, className, type = "button", isLoading = false, loadingLabel, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={buttonStyles({ variant, tone, size, className })}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-[rgba(255,255,255,0.45)] border-t-transparent"
              aria-hidden
            />
            <span className="sr-only">{loadingLabel ?? "Загрузка"}</span>
          </span>
        ) : (
          children
        )}
      </button>
    );
  },
);

Button.displayName = "Button";
