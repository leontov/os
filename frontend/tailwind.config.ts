import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#6366F1",
        accent: "#38BDF8",
        "background-main": "#0B1120",
        "background-panel": "rgba(15, 23, 42, 0.75)",
        "background-card": "rgba(30, 41, 59, 0.75)",
        "background-input": "rgba(15, 23, 42, 0.85)",
        "border-strong": "rgba(148, 163, 184, 0.2)",
        "text-primary": "#E2E8F0",
        "text-secondary": "#94A3B8",
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
