import { forwardRef } from "react";

const baseClasses = "w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elev)] px-4 py-3 text-base text-[var(--text)] shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(6,8,10,0.8)] placeholder:text-[var(--muted)] disabled:opacity-60 disabled:cursor-not-allowed";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type = "text", ...props }, ref) => {
  return <input ref={ref} type={type} className={className ? `${baseClasses} ${className}` : baseClasses} {...props} />;
});

Input.displayName = "Input";
