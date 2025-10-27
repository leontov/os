import { forwardRef } from "react";
import { tv, type VariantProps } from "tailwind-variants";

type ButtonElement = HTMLButtonElement;

type ButtonProps = React.ButtonHTMLAttributes<ButtonElement> & VariantProps<typeof buttonStyles>;

const buttonStyles = tv({
  base:
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[rgba(74,222,128,0.65)] focus-visible:ring-offset-[rgba(14,17,22,0.8)] disabled:opacity-50 disabled:pointer-events-none",
  variants: {
    variant: {
      primary: "bg-[var(--brand)] text-[#04110b] hover:bg-[var(--brand-strong)]",
      secondary: "bg-[var(--bg-elev)] text-[var(--text)] border border-[var(--border-subtle)] hover:border-[var(--brand)]",
      ghost: "bg-transparent text-[var(--text)] hover:bg-[var(--brand-ghost)]",
      danger: "bg-[var(--danger)] text-white hover:bg-[#ef4444]",
    },
    size: {
      sm: "h-9 px-3 text-sm",
      md: "h-11 px-4 text-base",
      lg: "h-12 px-5 text-base",
      icon: "h-10 w-10",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
});

export const Button = forwardRef<ButtonElement, ButtonProps>(({ variant, size, className, type = "button", ...props }, ref) => {
  return <button ref={ref} type={type} className={buttonStyles({ variant, size, className })} {...props} />;
});

Button.displayName = "Button";
