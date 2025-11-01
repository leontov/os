import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function useInstallPromptBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handler = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
      setDismissed(false);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const clearPrompt = useCallback(() => setPromptEvent(null), []);
  const dismissPrompt = useCallback(() => {
    setPromptEvent(null);
    setDismissed(true);
  }, []);

  return { promptEvent, clearPrompt, dismissPrompt, dismissed } as const;
}

type ResponsiveControllers = {
  setDrawerOpen: Dispatch<SetStateAction<boolean>>;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export function useResponsivePanels({ setDrawerOpen, setSidebarOpen }: ResponsiveControllers) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const media = window.matchMedia("(min-width: 1280px)");
    const handleViewport = () => {
      const matches = media.matches;
      setDrawerOpen(matches);
      if (!matches) {
        setSidebarOpen(false);
      }
    };
    handleViewport();
    window.addEventListener("resize", handleViewport);
    return () => {
      window.removeEventListener("resize", handleViewport);
    };
  }, [setDrawerOpen, setSidebarOpen]);
}

export function useCommandMenuShortcut(onOpen: () => void) {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [onOpen]);
}
