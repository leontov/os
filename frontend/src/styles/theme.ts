import type { ThemeAppearance, ThemeTokenSet } from "../core/personaThemeRegistry";

export type ThemeTokenMap = Record<ThemeAppearance, ThemeTokenSet>;

const chatGptTypography = {
  fontFamily: '"S\u00F6hne", "Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", sans-serif',
  headingFamily: '"S\u00F6hne", "Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", sans-serif',
  baseSize: 16,
  headingWeight: 600,
  bodyWeight: 400,
  letterSpacing: "0.01em",
  lineHeight: 1.6,
} as const;

const sharedRadii = {
  small: "0.75rem",
  medium: "1.35rem",
  large: "1.85rem",
  pill: "999px",
} as const;

const sharedShadows = {
  card: "0 18px 48px -26px rgba(32, 33, 35, 0.35)",
  overlay: "0 28px 80px -40px rgba(0, 0, 0, 0.45)",
} as const;

export const chatGptThemeTokens: ThemeTokenMap = {
  light: {
    colors: {
      brand: "#10A37F",
      "brand-foreground": "#FFFFFF",
      "app-background": "#F7F7F8",
      "background-main": "#F7F7F8",
      "background-accent": "#E9E9EE",
      surface: "#FFFFFF",
      "surface-muted": "#F0F2F5",
      sidebar: "#FFFFFF",
      border: "#D9D9E3",
      "border-strong": "#B4B6C8",
      text: "#202123",
      "text-muted": "#4A4B57",
      "text-primary": "#202123",
      "text-secondary": "#4A4B57",
      primary: "#10A37F",
      accent: "#3B82F6",
      "background-card": "#FFFFFF",
      "background-input": "#F0F2F5",
      "background-panel": "#E9E9EE",
    },
    typography: chatGptTypography,
    radii: sharedRadii,
    shadows: sharedShadows,
  },
  dark: {
    colors: {
      brand: "#10A37F",
      "brand-foreground": "#FFFFFF",
      "app-background": "#343541",
      "background-main": "#343541",
      "background-accent": "#202123",
      surface: "#202123",
      "surface-muted": "#2B2C36",
      sidebar: "#202123",
      border: "#3E3F4B",
      "border-strong": "#555666",
      text: "#ECECF1",
      "text-muted": "#9B9CA8",
      "text-primary": "#ECECF1",
      "text-secondary": "#9B9CA8",
      primary: "#10A37F",
      accent: "#3B82F6",
      "background-card": "#2B2C36",
      "background-input": "#3C3D4A",
      "background-panel": "#202123",
    },
    typography: chatGptTypography,
    radii: sharedRadii,
    shadows: {
      card: "0 22px 60px -34px rgba(4, 4, 10, 0.7)",
      overlay: "0 32px 96px -40px rgba(3, 4, 12, 0.78)",
    },
  },
} as const;

export const CHAT_GPT_THEME_ID = "chatgpt";
