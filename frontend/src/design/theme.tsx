import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Theme = "dark" | "light" | "system";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "dark" | "light";
  setTheme: (theme: Theme) => void;
  reduceMotion: boolean;
  setReduceMotion: (value: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const getSystemTheme = (): "dark" | "light" => {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
};

const getSystemReduceMotion = (): boolean => {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

const STORAGE_KEY_THEME = "kolibri-ui-theme";
const STORAGE_KEY_MOTION = "kolibri-ui-reduce-motion";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") {
      return "dark";
    }
    const stored = window.localStorage.getItem(STORAGE_KEY_THEME) as Theme | null;
    if (stored === "dark" || stored === "light" || stored === "system") {
      return stored;
    }
    return "dark";
  });

  const [reduceMotion, setReduceMotionState] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY_MOTION);
    if (stored === "true") {
      return true;
    }
    if (stored === "false") {
      return false;
    }
    return getSystemReduceMotion();
  });

  const resolvedTheme = useMemo(() => {
    if (theme === "system") {
      return getSystemTheme();
    }
    return theme;
  }, [theme]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.reducedMotion = reduceMotion ? "true" : "false";
    return () => {
      delete root.dataset.reducedMotion;
    };
  }, [resolvedTheme, reduceMotion]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const listener = (event: MediaQueryListEvent) => {
      if (theme === "system") {
        const root = document.documentElement;
        root.dataset.theme = event.matches ? "light" : "dark";
      }
    };
    const query = window.matchMedia("(prefers-color-scheme: light)");
    query.addEventListener("change", listener);
    return () => {
      query.removeEventListener("change", listener);
    };
  }, [theme]);

  const handleSetTheme = useCallback((next: Theme) => {
    setThemeState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_THEME, next);
    }
  }, []);

  const handleSetReduceMotion = useCallback((value: boolean) => {
    setReduceMotionState(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY_MOTION, value ? "true" : "false");
    }
  }, []);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    resolvedTheme,
    setTheme: handleSetTheme,
    reduceMotion,
    setReduceMotion: handleSetReduceMotion,
  }), [theme, resolvedTheme, handleSetTheme, reduceMotion, handleSetReduceMotion]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme должен использоваться внутри ThemeProvider");
  }
  return context;
};
