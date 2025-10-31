import { forwardRef } from "react";

const baseClasses =
  "w-full resize-none rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elev-2)] px-4 py-3 text-base text-[var(--text)] shadow-[var(--shadow-ring)] transition-[border-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:[box-shadow:var(--focus-strong)] placeholder:text-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-60";

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => {
  return <textarea ref={ref} className={className ? `${baseClasses} ${className}` : baseClasses} {...props} />;
});

Textarea.displayName = "Textarea";
