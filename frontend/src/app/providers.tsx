import { type ReactNode } from "react";
import "../design/tokens.css";
import "../styles/tailwind.css";
import "highlight.js/styles/github-dark-dimmed.css";
import { ThemeProvider } from "../design/theme";
import { I18nProvider } from "./i18n";
import { ToastProvider } from "../components/feedback/Toast";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>{children}</ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
