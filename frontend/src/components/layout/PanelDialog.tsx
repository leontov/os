import { useEffect, useRef, type PropsWithChildren, type ReactNode } from "react";
import { X } from "lucide-react";

interface PanelDialogProps {
  title: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  footer?: ReactNode;
  maxWidthClass?: string;
}

const PanelDialog = ({ title, description, isOpen, onClose, footer, children, maxWidthClass }: PropsWithChildren<PanelDialogProps>) => {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedElementRef = useRef<Element | null>(null);

  const widthClass = maxWidthClass ?? "max-w-4xl";

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    previouslyFocusedElementRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }

      if (event.key === "Tab") {
        const focusable = closeButtonRef.current?.closest("[data-panel-dialog]")?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );

        if (!focusable || focusable.length === 0) {
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const activeElement = document.activeElement;

        if (event.shiftKey && activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    const id = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(id);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocusedElementRef.current instanceof HTMLElement) {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={`flex max-h-[90vh] w-full ${widthClass} flex-col overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-card`}
        data-panel-dialog
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-text">{title}</h2>
            {description ? <p className="mt-1 text-sm text-text-muted">{description}</p> : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/70 text-text-muted transition-colors hover:text-text"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="soft-scroll flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <footer className="border-t border-border/60 bg-surface-muted px-6 py-4 text-sm text-text-muted">{footer}</footer> : null}
      </div>
    </div>
  );
};

export default PanelDialog;
