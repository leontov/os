import { forwardRef } from "react";

const baseClasses = "w-full resize-none rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elev)] px-4 py-3 text-base text-[var(--text)] shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(6,8,10,0.8)] placeholder:text-[var(--muted)] disabled:opacity-60 disabled:cursor-not-allowed";

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => {
  return <textarea ref={ref} className={className ? `${baseClasses} ${className}` : baseClasses} {...props} />;
});

Textarea.displayName = "Textarea";
