import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { forwardRef } from "react";

const baseItem =
  "inline-flex min-h-[2.75rem] min-w-[3.25rem] items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:[box-shadow:var(--focus-strong)] data-[state=on]:bg-[var(--brand-ghost)] data-[state=on]:text-[var(--brand)]";

interface SegmentedControlProps extends ToggleGroupPrimitive.ToggleGroupSingleProps {
  options: ReadonlyArray<{ value: string; label: string; icon?: React.ReactNode; ariaLabel?: string }>;
  className?: string;
}

export const SegmentedControl = forwardRef<HTMLDivElement, SegmentedControlProps>(({ options, className, ...props }, ref) => {
  return (
    <ToggleGroupPrimitive.Root
      ref={ref}
      className={`inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elev-2)] p-1 shadow-[var(--shadow-ring)] transition-colors ${className ?? ""}`.trim()}
      {...props}
    >
      {options.map(({ value, label, icon, ariaLabel }) => (
        <ToggleGroupPrimitive.Item key={value} className={baseItem} value={value} aria-label={ariaLabel ?? label}>
          <span className="flex items-center gap-2">
            {icon ? <span className="text-[var(--brand)]">{icon}</span> : null}
            <span>{label}</span>
          </span>
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
});

SegmentedControl.displayName = "SegmentedControl";
