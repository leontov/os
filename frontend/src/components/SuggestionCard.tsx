import type { ElementType } from "react";

interface SuggestionCardProps {
  icon: ElementType;
  title: string;
  description: string;
  onSelect: () => void;
  active?: boolean;
  disabled?: boolean;
}

const SuggestionCard = ({ icon: Icon, title, description, onSelect, active = false, disabled = false }: SuggestionCardProps) => (
  <button
    type="button"
    onClick={onSelect}
    className={`group flex h-full flex-col justify-between gap-4 rounded-3xl border p-6 text-left shadow-card transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40 ${
      active
        ? "border-primary/50 bg-primary/10 text-text-dark shadow-hero"
        : "border-white/70 bg-white/80 hover:-translate-y-1 hover:border-primary/40 hover:shadow-hero"
    } ${disabled ? "pointer-events-none opacity-60" : ""}`}
    aria-pressed={active}
    disabled={disabled}
  >
    <div className="flex items-center gap-3">
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-2xl transition-colors ${
          active ? "bg-primary/30 text-primary" : "bg-primary/10 text-primary group-hover:bg-primary/20"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">Сценарий</span>
    </div>
    <div className="space-y-3">
      <p className="text-lg font-semibold leading-tight text-text-dark">{title}</p>
      <p className="text-sm leading-relaxed text-text-light">{description}</p>
    </div>
    <span
      className={`inline-flex items-center gap-2 text-sm font-medium transition-colors ${
        active ? "text-accent-coral" : "text-primary group-hover:text-accent-coral"
      }`}
    >
      Активировать
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.5 4.5 12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  </button>
);

export default SuggestionCard;
