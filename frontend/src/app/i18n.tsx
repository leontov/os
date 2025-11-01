import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import en from "../i18n/en.json";
import ru from "../i18n/ru.json";

export type Locale = "en" | "ru";

type Messages = typeof en;

export type MessageKey = keyof Messages;

export type Translate = (key: MessageKey) => string;

interface I18nContextValue {
  locale: Locale;
  t: Translate;
  setLocale: (locale: Locale) => void;
}

export type Translate = I18nContextValue["t"];

const catalogs: Record<Locale, Messages> = {
  en,
  ru,
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const STORAGE_KEY = "kolibri-locale";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") {
      return "ru";
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "ru" || stored === "en") {
      return stored;
    }
    const browser = navigator.language.startsWith("ru") ? "ru" : "en";
    return browser;
  });

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    t: (key: MessageKey) => catalogs[locale][key],
    setLocale,
  }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n должен использоваться внутри I18nProvider");
  }
  return context;
}
