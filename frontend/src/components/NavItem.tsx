import type { ElementType, MouseEventHandler } from "react";
import { twMerge } from "tailwind-merge";

interface NavItemProps {
  icon: ElementType;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

const NavItem = ({ icon: Icon, label, active = false, disabled = false, onClick }: NavItemProps) => (
  <button
    type="button"
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    className={twMerge(
      "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition-colors",
      active
        ? "bg-white/90 text-text-dark shadow-sm"
        : "text-text-light hover:bg-white/70 hover:text-text-dark",
      disabled && !active ? "cursor-not-allowed opacity-60 hover:bg-transparent hover:text-text-light" : "",
    )}
  >
    <Icon
      className={twMerge(
        "h-5 w-5",
        active ? "text-primary" : "text-text-light",
        disabled && !active ? "opacity-60" : "",
      )}
    />
    <span>{label}</span>
  </button>
);

export default NavItem;
