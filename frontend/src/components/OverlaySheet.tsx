import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { PropsWithChildren, ReactNode } from "react";

interface OverlaySheetProps {
  title: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  footer?: ReactNode;
}

const OverlaySheet = ({ title, description, isOpen, onClose, footer, children }: PropsWithChildren<OverlaySheetProps>) => {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    const timeout = window.setTimeout(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    }, 50);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(timeout);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/55 backdrop-blur-sm lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="mt-auto w-full rounded-t-3xl border border-border-strong bg-background-panel/95 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto h-1 w-12 rounded-full bg-border-strong/60" aria-hidden="true" />
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 id={titleId} className="text-lg font-semibold text-text-primary">
              {title}
            </h2>
            {description ? <p className="text-sm text-text-secondary">{description}</p> : null}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-strong bg-background-card/80 text-text-secondary transition-colors hover:text-text-primary"
            aria-label="Закрыть панель"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-6 max-h-[calc(70vh-3.5rem)] space-y-4 overflow-y-auto pr-1 text-left">
          {children}
        </div>
        {footer ? <div className="mt-4 pt-4 text-sm text-text-secondary">{footer}</div> : null}
      </div>
    </div>
  );
};

export default OverlaySheet;
