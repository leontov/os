import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { forwardRef } from "react";
import type { ReactNode } from "react";

const baseItem =
  "inline-flex min-h-[2.75rem] min-w-[3.25rem] items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:[box-shadow:var(--focus-strong)] data-[state=on]:bg-[var(--brand-ghost)] data-[state=on]:text-[var(--brand)]";

interface SegmentedControlProps
  extends Omit<ToggleGroupPrimitive.ToggleGroupSingleProps, "type" | "onValueChange" | "value"> {
  options: ReadonlyArray<{ value: string; label: string; icon?: ReactNode; ariaLabel?: string }>;
  className?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

export const SegmentedControl = forwardRef<HTMLDivElement, SegmentedControlProps>(function SegmentedControl(
  { options, className, value, onValueChange, ...props }: SegmentedControlProps,
  ref,
) {
  return (
    <ToggleGroupPrimitive.Root
      ref={ref}
      className={`inline-flex items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elev-2)] p-1 shadow-[var(--shadow-ring)] transition-colors ${className ?? ""}`.trim()}
      type="single"
      onValueChange={onValueChange}
      value={value}
      {...props}
    >
      {options.map(({ value: optionValue, label, icon, ariaLabel }) => (
        <ToggleGroupPrimitive.Item
          key={optionValue}
          className={baseItem}
          value={optionValue}
          aria-label={ariaLabel ?? label}
        >
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
