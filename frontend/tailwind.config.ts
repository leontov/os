import type { Config } from "tailwindcss";

const withOpacityValue = (variable: string) => {
  return ({ opacityValue }: { opacityValue?: string }) => {
    if (opacityValue !== undefined) {
      return `rgb(var(${variable}) / ${opacityValue})`;
    }

    return `rgb(var(${variable}) / 1)`;
  };
};

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: withOpacityValue("--color-brand"),
        "brand-foreground": withOpacityValue("--color-brand-foreground"),
        "app-background": withOpacityValue("--color-app-background"),
        surface: withOpacityValue("--color-surface"),
        "surface-muted": withOpacityValue("--color-surface-muted"),
        sidebar: withOpacityValue("--color-sidebar"),
        border: withOpacityValue("--color-border"),
        text: withOpacityValue("--color-text"),
        "text-muted": withOpacityValue("--color-text-muted"),
        primary: withOpacityValue("--color-primary"),
        accent: withOpacityValue("--color-accent"),
        "background-card": withOpacityValue("--color-background-card"),
        "background-input": withOpacityValue("--color-background-input"),
        "background-panel": withOpacityValue("--color-background-panel"),
        "background-main": withOpacityValue("--color-app-background"),
        "border-strong": withOpacityValue("--color-border-strong"),
        "text-primary": withOpacityValue("--color-text"),
        "text-secondary": withOpacityValue("--color-text-muted"),
        "chat-surface": withOpacityValue("--color-chat-surface"),
        "chat-header": withOpacityValue("--color-chat-header"),
        "chat-footer": withOpacityValue("--color-chat-footer"),
        "chat-input": withOpacityValue("--color-chat-input"),
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        card: "0 14px 32px -24px rgba(15, 23, 42, 0.35)",
      },
      spacing: {
        "safe-area-content": "var(--safe-area-padding-top)",
        "safe-area-sticky": "var(--safe-area-sticky-offset)",
      },
    },
  },
  plugins: [],
};

export default config;
