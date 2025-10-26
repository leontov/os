import { useEffect, useRef, useState, type PropsWithChildren, type ReactNode } from "react";
import useMediaQuery from "../../core/useMediaQuery";
import type { MotionPattern } from "../../core/personaThemeRegistry";

interface ChatLayoutProps {
  sidebar: ReactNode;
  isSidebarOpen: boolean;
  onSidebarOpenChange: (open: boolean) => void;
  footer?: ReactNode;
  isZenMode?: boolean;
  motionPattern: MotionPattern;
  sidebarLabel?: string;
}

const ChatLayout = ({
  sidebar,
  isSidebarOpen,
  onSidebarOpenChange,
  footer,
  isZenMode = false,
  motionPattern,
  sidebarLabel = "Панель навигации и списка бесед",
  children,
}: PropsWithChildren<ChatLayoutProps>) => {
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  const [announcement, setAnnouncement] = useState("");
  const gestureState = useRef<{ pointerId: number | null; startX: number; delta: number }>({
    pointerId: null,
    startX: 0,
    delta: 0,
  });

  const showStaticSidebar = isLargeScreen && !isZenMode;
  const shouldShowSidebar = showStaticSidebar || isSidebarOpen;
  const shouldShowOverlay = !showStaticSidebar && isSidebarOpen;

  const edgeZone = motionPattern.gestures.edgeZone ?? 24;
  const swipeThreshold = motionPattern.gestures.swipeThreshold ?? 72;

  useEffect(() => {
    setAnnouncement(isZenMode ? "Режим фокуса включён." : "Режим фокуса отключён.");
  }, [isZenMode]);

  useEffect(() => {
    if (!shouldShowOverlay) {
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
  }, [onSidebarOpenChange, shouldShowOverlay]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    if (showStaticSidebar) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        return;
      }
      const isEdgeGesture = !isSidebarOpen && event.clientX <= edgeZone;
      if (!isSidebarOpen && !isEdgeGesture) {
        return;
      }
      gestureState.current = { pointerId: event.pointerId, startX: event.clientX, delta: 0 };
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (gestureState.current.pointerId !== event.pointerId) {
        return;
      }
      gestureState.current.delta = event.clientX - gestureState.current.startX;
    };

    const commitGesture = () => {
      const delta = gestureState.current.delta;
      if (!isSidebarOpen && delta > swipeThreshold) {
        onSidebarOpenChange(true);
      }
      if (isSidebarOpen && delta < -swipeThreshold) {
        onSidebarOpenChange(false);
      }
      gestureState.current = { pointerId: null, startX: 0, delta: 0 };
    };

    const resetGesture = () => {
      gestureState.current = { pointerId: null, startX: 0, delta: 0 };
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (gestureState.current.pointerId !== event.pointerId) {
        return;
      }
      commitGesture();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (gestureState.current.pointerId !== event.pointerId) {
        return;
      }
      resetGesture();
    };

    document.body.addEventListener("pointerdown", handlePointerDown);
    document.body.addEventListener("pointermove", handlePointerMove);
    document.body.addEventListener("pointerup", handlePointerUp);
    document.body.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      document.body.removeEventListener("pointerdown", handlePointerDown);
      document.body.removeEventListener("pointermove", handlePointerMove);
      document.body.removeEventListener("pointerup", handlePointerUp);
      document.body.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [edgeZone, isSidebarOpen, onSidebarOpenChange, showStaticSidebar, swipeThreshold]);

  return (
    <div className="relative flex min-h-screen bg-app-background text-text" data-zen-mode={isZenMode}>
      <a href="#kolibri-main-content" className="skip-link">
        Перейти к содержимому
      </a>
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-80 transform border-r border-border/60 bg-sidebar transition-gentle ease-gesture lg:shadow-none ${
          shouldShowSidebar ? "translate-x-0 shadow-card" : "-translate-x-full"
        } ${showStaticSidebar ? "lg:static lg:translate-x-0" : ""}`}
        aria-hidden={!shouldShowSidebar}
        aria-label={sidebarLabel}
      >
        <div className="flex h-full flex-col overflow-y-auto soft-scroll" role="complementary">
          {sidebar}
        </div>
      </aside>
      {shouldShowOverlay ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm"
          onClick={() => onSidebarOpenChange(false)}
          aria-label="Закрыть панель навигации"
        />
      ) : null}
      <div className="flex min-h-screen flex-1 flex-col" data-motion-region>
        <main
          id="kolibri-main-content"
          className={`mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-10 ${
            isZenMode ? "max-w-4xl" : "max-w-5xl lg:max-w-6xl"
          }`}
          role="main"
          aria-live="polite"
        >
          <div className="flex-1">{children}</div>
          {footer ? <div className="pb-4 lg:pb-6">{footer}</div> : null}
        </main>
      </div>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
};

export default ChatLayout;
