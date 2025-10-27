import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { forwardRef } from "react";

const baseItem =
  "inline-flex min-w-[3rem] items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(6,8,10,0.8)] data-[state=on]:bg-[var(--brand-ghost)] data-[state=on]:text-[var(--brand)]";

interface SegmentedControlProps extends ToggleGroupPrimitive.ToggleGroupSingleProps {
  options: ReadonlyArray<{ value: string; label: string; icon?: React.ReactNode; ariaLabel?: string }>;
}

export const SegmentedControl = forwardRef<HTMLDivElement, SegmentedControlProps>(({ options, className, ...props }, ref) => {
  return (
    <ToggleGroupPrimitive.Root
      ref={ref}
      className={`inline-flex items-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elev)] p-1 shadow-sm ${className ?? ""}`.trim()}
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
