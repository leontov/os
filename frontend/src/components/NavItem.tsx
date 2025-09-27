import type { ElementType } from "react";
import { twMerge } from "tailwind-merge";

interface NavItemProps {
  icon: ElementType;
  label: string;
  active?: boolean;
}

const NavItem = ({ icon: Icon, label, active = false }: NavItemProps) => (
  <button
    type="button"
    className={twMerge(
      "group relative flex w-full items-center gap-4 rounded-2xl border border-transparent px-5 py-3 text-left text-sm font-medium transition-all",
      active
        ? "border-primary/40 bg-white text-text-dark shadow-card"
        : "text-text-light hover:border-white/50 hover:bg-white/60 hover:text-text-dark",
    )}
  >
    <span
      className={twMerge(
        "flex h-10 w-10 items-center justify-center rounded-xl bg-white/70 text-text-light transition-colors group-hover:text-text-dark",
        active && "bg-primary/20 text-primary",
      )}
    >
      <Icon className="h-5 w-5" />
    </span>
    <span>{label}</span>
    {active && <span className="absolute -left-2 h-10 w-1 rounded-full bg-primary" aria-hidden="true" />}
  </button>
);

export default NavItem;
