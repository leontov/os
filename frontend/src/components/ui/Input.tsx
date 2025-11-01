import { forwardRef } from "react";

const baseClasses =
  "w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elev-2)] px-4 py-3 text-base text-[var(--text)] shadow-[var(--shadow-ring)] transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:[box-shadow:var(--focus-strong)] placeholder:text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type = "text", ...props }, ref) => {
  return <input ref={ref} type={type} className={className ? `${baseClasses} ${className}` : baseClasses} {...props} />;
});

Input.displayName = "Input";
