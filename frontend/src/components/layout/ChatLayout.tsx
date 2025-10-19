import { useEffect } from "react";
import type { PropsWithChildren, ReactNode } from "react";

interface ChatLayoutProps {
  sidebar: ReactNode;
  isSidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;
  footer?: ReactNode;
}

const ChatLayout = ({ sidebar, isSidebarOpen, onSidebarOpenChange, footer, children }: PropsWithChildren<ChatLayoutProps>) => {
  useEffect(() => {
    if (!isSidebarOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onSidebarOpenChange(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isSidebarOpen, onSidebarOpenChange]);

  return (
    <div className="flex min-h-screen bg-app-background text-text">
      <div
        className={`fixed inset-y-0 left-0 z-40 w-80 transform border-r border-border/60 bg-sidebar transition-transform duration-200 ease-out lg:static lg:h-auto lg:translate-x-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-full flex-col overflow-y-auto">{sidebar}</div>
      </div>
      {isSidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => onSidebarOpenChange(false)}
          aria-label="Закрыть панель бесед"
        />
      ) : null}
      <div className="flex min-h-screen flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10">
          <div className="flex-1">{children}</div>
          {footer ? <div className="pb-4 lg:pb-6">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
};

export default ChatLayout;
