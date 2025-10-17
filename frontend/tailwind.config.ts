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
        primary: withOpacityValue("--color-primary"),
        accent: withOpacityValue("--color-accent"),
        "background-main": withOpacityValue("--color-background-main"),
        "background-accent": withOpacityValue("--color-background-accent"),
        "background-panel": withOpacityValue("--color-background-panel"),
        "background-card": withOpacityValue("--color-background-card"),
        "background-input": withOpacityValue("--color-background-input"),
        "border-strong": withOpacityValue("--color-border-strong"),
        "text-primary": withOpacityValue("--color-text-primary"),
        "text-secondary": withOpacityValue("--color-text-secondary"),
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      boxShadow: {
        card: "0 20px 45px -30px rgba(15, 23, 42, 0.6)",
      },
    },
  },
  plugins: [],
};

export default config;
