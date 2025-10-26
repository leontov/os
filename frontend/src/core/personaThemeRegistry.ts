export type ThemeAppearance = "light" | "dark";
export type ThemeAppearancePreference = ThemeAppearance | "system";
export type MotionPreference = "expressive" | "reduced" | "auto";

export interface ThemeTokenSet {
  colors: Record<string, string>;
  typography: {
    fontFamily: string;
    headingFamily: string;
    baseSize: number;
    headingWeight: number;
    bodyWeight: number;
    letterSpacing: string;
    lineHeight: number;
  };
  radii: {
    small: string;
    medium: string;
    large: string;
    pill: string;
  };
  shadows: {
    card: string;
    overlay: string;
  };
}

export interface MotionPattern {
  id: string;
  name: string;
  description: string;
  durations: {
    quick: number;
    gentle: number;
    slow: number;
  };
  easing: {
    standard: string;
    emphasized: string;
    gesture: string;
  };
  gestures: {
    edgeZone: number;
    swipeThreshold: number;
  };
}

export interface VoiceProfile {
  id: string;
  name: string;
  locale: string;
  previewText: string;
  description: string;
  pitch: number;
  rate: number;
  timbre: "warm" | "neutral" | "bright";
}

export interface PersonaTheme {
  id: string;
  name: string;
  description: string;
  tags: string[];
  tokens: Record<ThemeAppearance, ThemeTokenSet>;
  motion: {
    expressive: MotionPattern;
    reduced: MotionPattern;
  };
  voice: VoiceProfile;
}

export interface AppliedPersonaContext {
  persona: PersonaTheme;
  appearance: ThemeAppearance;
  motion: MotionPattern;
}

type ChangeListener = (context: AppliedPersonaContext) => void;

const toRgbValue = (value: string): string => {
  if (/^(?:\d{1,3}\s){2}\d{1,3}$/.test(value.trim())) {
    return value.trim();
  }

  const color = value.trim().replace(/^#/, "");
  if (color.length !== 6) {
    return value;
  }
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return value;
  }
  return `${r} ${g} ${b}`;
};

const applyTokenSetToDocument = (
  persona: PersonaTheme,
  appearance: ThemeAppearance,
  motion: MotionPattern,
) => {
  if (typeof document === "undefined") {
    return;
  }

  const tokens = persona.tokens[appearance];
  if (!tokens) {
    return;
  }

  const root = document.documentElement;
  const style = document.documentElement.style;

  root.style.colorScheme = appearance === "light" ? "light" : "dark";

  Object.entries(tokens.colors).forEach(([key, value]) => {
    style.setProperty(`--color-${key}`, toRgbValue(value));
  });

  style.setProperty("--font-family-base", tokens.typography.fontFamily);
  style.setProperty("--font-family-heading", tokens.typography.headingFamily);
  style.setProperty("--font-size-base", `${tokens.typography.baseSize}px`);
  style.setProperty("--font-weight-heading", tokens.typography.headingWeight.toString());
  style.setProperty("--font-weight-body", tokens.typography.bodyWeight.toString());
  style.setProperty("--font-letter-spacing", tokens.typography.letterSpacing);
  style.setProperty("--font-line-height", tokens.typography.lineHeight.toString());

  style.setProperty("--radius-small", tokens.radii.small);
  style.setProperty("--radius-medium", tokens.radii.medium);
  style.setProperty("--radius-large", tokens.radii.large);
  style.setProperty("--radius-pill", tokens.radii.pill);

  style.setProperty("--shadow-card", tokens.shadows.card);
  style.setProperty("--shadow-overlay", tokens.shadows.overlay);

  style.setProperty("--motion-duration-quick", `${motion.durations.quick}ms`);
  style.setProperty("--motion-duration-gentle", `${motion.durations.gentle}ms`);
  style.setProperty("--motion-duration-slow", `${motion.durations.slow}ms`);
  style.setProperty("--motion-easing-standard", motion.easing.standard);
  style.setProperty("--motion-easing-emphasized", motion.easing.emphasized);
  style.setProperty("--motion-easing-gesture", motion.easing.gesture);
  style.setProperty("--gesture-edge-zone", motion.gestures.edgeZone.toString());
  style.setProperty("--gesture-swipe-threshold", motion.gestures.swipeThreshold.toString());

  root.setAttribute("data-persona", persona.id);
  root.setAttribute("data-voice", persona.voice.id);
};

export class PersonaThemeRegistry {
  private readonly personas = new Map<string, PersonaTheme>();

  private readonly listeners = new Set<ChangeListener>();

  private active: AppliedPersonaContext | null = null;

  constructor(initialThemes: PersonaTheme[] = []) {
    initialThemes.forEach((theme) => this.register(theme));
  }

  register(theme: PersonaTheme): void {
    this.personas.set(theme.id, theme);
  }

  list(): PersonaTheme[] {
    return Array.from(this.personas.values());
  }

  get(id: string): PersonaTheme | undefined {
    return this.personas.get(id);
  }

  apply(personaId: string, appearance: ThemeAppearance, motion: MotionPattern): AppliedPersonaContext {
    const persona = this.personas.get(personaId);
    if (!persona) {
      throw new Error(`Unknown persona: ${personaId}`);
    }
    const context: AppliedPersonaContext = { persona, appearance, motion };
    this.active = context;
    applyTokenSetToDocument(persona, appearance, motion);
    this.listeners.forEach((listener) => listener(context));
    return context;
  }

  getActive(): AppliedPersonaContext | null {
    return this.active;
  }

  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    const current = this.active;
    if (current) {
      listener(current);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const defaultPersonaThemes: PersonaTheme[] = [
  {
    id: "aurora",
    name: "Aurora",
    description: "Северное сияние с мягкой подсветкой и деликатными акцентами.",
    tags: ["calm", "balanced"],
    tokens: {
      light: {
        colors: {
          brand: "16 163 127",
          "brand-foreground": "255 255 255",
          "app-background": "247 247 248",
          surface: "255 255 255",
          "surface-muted": "242 242 243",
          sidebar: "250 250 250",
          border: "229 229 231",
          text: "32 33 35",
          "text-muted": "113 113 122",
          primary: "16 163 127",
          accent: "59 130 246",
          "background-card": "255 255 255",
          "background-input": "246 246 247",
          "background-panel": "252 252 253",
          "border-strong": "210 210 215",
          "text-primary": "32 33 35",
          "text-secondary": "113 113 122",
        },
        typography: {
          fontFamily: '"Inter", "Segoe UI", sans-serif',
          headingFamily: '"Clash Display", "Inter", sans-serif',
          baseSize: 16,
          headingWeight: 600,
          bodyWeight: 400,
          letterSpacing: "0.01em",
          lineHeight: 1.6,
        },
        radii: {
          small: "0.65rem",
          medium: "1.25rem",
          large: "1.75rem",
          pill: "999px",
        },
        shadows: {
          card: "0 20px 60px -35px rgba(51, 65, 145, 0.45)",
          overlay: "0 25px 80px -40px rgba(26, 35, 85, 0.5)",
        },
      },
      dark: {
        colors: {
          brand: "16 163 127",
          "brand-foreground": "19 20 22",
          "app-background": "19 20 22",
          surface: "26 28 30",
          "surface-muted": "32 34 37",
          sidebar: "23 24 28",
          border: "58 60 67",
          text: "229 231 235",
          "text-muted": "148 163 184",
          primary: "16 163 127",
          accent: "110 231 183",
          "background-card": "30 32 35",
          "background-input": "37 39 43",
          "background-panel": "28 30 33",
          "border-strong": "74 78 86",
          "text-primary": "229 231 235",
          "text-secondary": "148 163 184",
        },
        typography: {
          fontFamily: '"Inter", "Segoe UI", sans-serif',
          headingFamily: '"Clash Display", "Inter", sans-serif',
          baseSize: 16,
          headingWeight: 600,
          bodyWeight: 400,
          letterSpacing: "0.015em",
          lineHeight: 1.65,
        },
        radii: {
          small: "0.6rem",
          medium: "1.1rem",
          large: "1.5rem",
          pill: "999px",
        },
        shadows: {
          card: "0 30px 80px -45px rgba(12, 20, 60, 0.65)",
          overlay: "0 40px 120px -35px rgba(10, 15, 45, 0.75)",
        },
      },
    },
    motion: {
      expressive: {
        id: "aurora-expressive",
        name: "Aurora Expressive",
        description: "Лёгкое скольжение и упругие переходы, отражающие мягкие волны северного сияния.",
        durations: { quick: 160, gentle: 260, slow: 440 },
        easing: {
          standard: "cubic-bezier(0.22, 0.61, 0.36, 1)",
          emphasized: "cubic-bezier(0.33, 1, 0.68, 1)",
          gesture: "cubic-bezier(0.16, 1, 0.3, 1)",
        },
        gestures: { edgeZone: 28, swipeThreshold: 72 },
      },
      reduced: {
        id: "aurora-reduced",
        name: "Aurora Gentle",
        description: "Упрощённые переходы без длительных анимаций.",
        durations: { quick: 80, gentle: 140, slow: 220 },
        easing: {
          standard: "linear",
          emphasized: "linear",
          gesture: "linear",
        },
        gestures: { edgeZone: 32, swipeThreshold: 80 },
      },
    },
    voice: {
      id: "aurora-voice",
      name: "Aurora",
      locale: "ru-RU",
      previewText: "Добро пожаловать! Я расскажу, что удалось обнаружить Kolibri.",
      description: "Тёплый и уверенный голос с мягким тембром.",
      pitch: 0,
      rate: 1,
      timbre: "warm",
    },
  },
  {
    id: "nocturne",
    name: "Nocturne",
    description: "Контрастная тёмная тема с акцентами кобальта для вечерней работы.",
    tags: ["contrast", "night"],
    tokens: {
      light: {
        colors: {
          brand: "37 99 235",
          "brand-foreground": "250 250 250",
          "app-background": "245 247 253",
          surface: "249 250 255",
          "surface-muted": "231 234 250",
          sidebar: "226 231 248",
          border: "199 210 254",
          text: "15 23 42",
          "text-muted": "71 85 105",
          primary: "37 99 235",
          accent: "14 165 233",
          "background-card": "249 250 255",
          "background-input": "229 235 254",
          "background-panel": "236 240 255",
          "border-strong": "176 192 247",
          "text-primary": "15 23 42",
          "text-secondary": "71 85 105",
        },
        typography: {
          fontFamily: '"Inter", "Segoe UI", sans-serif',
          headingFamily: '"Space Grotesk", "Inter", sans-serif',
          baseSize: 15,
          headingWeight: 700,
          bodyWeight: 500,
          letterSpacing: "0.02em",
          lineHeight: 1.55,
        },
        radii: {
          small: "0.5rem",
          medium: "1rem",
          large: "1.35rem",
          pill: "999px",
        },
        shadows: {
          card: "0 16px 48px -30px rgba(15, 23, 42, 0.4)",
          overlay: "0 24px 64px -32px rgba(8, 11, 21, 0.55)",
        },
      },
      dark: {
        colors: {
          brand: "59 130 246",
          "brand-foreground": "12 20 35",
          "app-background": "10 13 25",
          surface: "14 18 34",
          "surface-muted": "12 16 30",
          sidebar: "11 15 29",
          border: "44 55 88",
          text: "226 232 240",
          "text-muted": "148 163 184",
          primary: "96 165 250",
          accent: "56 189 248",
          "background-card": "16 20 38",
          "background-input": "14 18 34",
          "background-panel": "14 18 34",
          "border-strong": "65 76 110",
          "text-primary": "226 232 240",
          "text-secondary": "148 163 184",
        },
        typography: {
          fontFamily: '"Inter", "Segoe UI", sans-serif',
          headingFamily: '"Space Grotesk", "Inter", sans-serif',
          baseSize: 15,
          headingWeight: 700,
          bodyWeight: 500,
          letterSpacing: "0.02em",
          lineHeight: 1.6,
        },
        radii: {
          small: "0.5rem",
          medium: "1rem",
          large: "1.35rem",
          pill: "999px",
        },
        shadows: {
          card: "0 20px 60px -35px rgba(5, 10, 25, 0.8)",
          overlay: "0 32px 90px -30px rgba(2, 6, 20, 0.85)",
        },
      },
    },
    motion: {
      expressive: {
        id: "nocturne-expressive",
        name: "Nocturne Pulse",
        description: "Динамические переходы с акцентом на масштаб.",
        durations: { quick: 140, gentle: 220, slow: 360 },
        easing: {
          standard: "cubic-bezier(0.25, 0.1, 0.25, 1)",
          emphasized: "cubic-bezier(0.4, 0, 0.2, 1)",
          gesture: "cubic-bezier(0.4, 0, 0.2, 1)",
        },
        gestures: { edgeZone: 24, swipeThreshold: 64 },
      },
      reduced: {
        id: "nocturne-reduced",
        name: "Nocturne Static",
        description: "Минимизированные анимации.",
        durations: { quick: 70, gentle: 120, slow: 180 },
        easing: {
          standard: "linear",
          emphasized: "linear",
          gesture: "linear",
        },
        gestures: { edgeZone: 28, swipeThreshold: 72 },
      },
    },
    voice: {
      id: "nocturne-voice",
      name: "Nocturne",
      locale: "ru-RU",
      previewText: "Готов приступить к ночной вахте Kolibri.",
      description: "Низкий бархатный голос, подчёркивающий уверенность.",
      pitch: -2,
      rate: 0.95,
      timbre: "warm",
    },
  },
  {
    id: "prism",
    name: "Prism",
    description: "Живая тема с яркими акцентами и упругими микровзаимодействиями.",
    tags: ["vibrant", "creative"],
    tokens: {
      light: {
        colors: {
          brand: "236 72 153",
          "brand-foreground": "255 255 255",
          "app-background": "255 247 250",
          surface: "255 255 255",
          "surface-muted": "255 240 246",
          sidebar: "255 232 241",
          border: "253 216 227",
          text: "80 20 60",
          "text-muted": "142 63 120",
          primary: "236 72 153",
          accent: "99 102 241",
          "background-card": "255 255 255",
          "background-input": "255 235 246",
          "background-panel": "255 242 248",
          "border-strong": "250 200 220",
          "text-primary": "80 20 60",
          "text-secondary": "142 63 120",
        },
        typography: {
          fontFamily: '"DM Sans", "Inter", sans-serif',
          headingFamily: '"DM Serif Display", "Georgia", serif',
          baseSize: 16,
          headingWeight: 700,
          bodyWeight: 500,
          letterSpacing: "0.025em",
          lineHeight: 1.58,
        },
        radii: {
          small: "0.75rem",
          medium: "1.35rem",
          large: "1.95rem",
          pill: "999px",
        },
        shadows: {
          card: "0 24px 68px -38px rgba(196, 43, 131, 0.55)",
          overlay: "0 36px 120px -40px rgba(99, 102, 241, 0.4)",
        },
      },
      dark: {
        colors: {
          brand: "244 114 182",
          "brand-foreground": "28 13 34",
          "app-background": "24 10 33",
          surface: "34 14 45",
          "surface-muted": "30 12 41",
          sidebar: "28 10 38",
          border: "86 42 104",
          text: "243 232 255",
          "text-muted": "215 177 233",
          primary: "224 82 159",
          accent: "129 140 248",
          "background-card": "39 16 50",
          "background-input": "32 14 44",
          "background-panel": "35 15 46",
          "border-strong": "115 63 132",
          "text-primary": "243 232 255",
          "text-secondary": "215 177 233",
        },
        typography: {
          fontFamily: '"DM Sans", "Inter", sans-serif',
          headingFamily: '"DM Serif Display", "Georgia", serif',
          baseSize: 16,
          headingWeight: 700,
          bodyWeight: 500,
          letterSpacing: "0.03em",
          lineHeight: 1.62,
        },
        radii: {
          small: "0.75rem",
          medium: "1.35rem",
          large: "1.95rem",
          pill: "999px",
        },
        shadows: {
          card: "0 28px 90px -42px rgba(40, 6, 55, 0.75)",
          overlay: "0 40px 140px -35px rgba(62, 17, 84, 0.85)",
        },
      },
    },
    motion: {
      expressive: {
        id: "prism-expressive",
        name: "Prism Bounce",
        description: "Энергичные анимации с лёгким подпрыгиванием.",
        durations: { quick: 150, gentle: 240, slow: 420 },
        easing: {
          standard: "cubic-bezier(0.4, 0, 0.2, 1)",
          emphasized: "cubic-bezier(0.34, 1.56, 0.64, 1)",
          gesture: "cubic-bezier(0.32, 0.72, 0, 1)",
        },
        gestures: { edgeZone: 26, swipeThreshold: 68 },
      },
      reduced: {
        id: "prism-reduced",
        name: "Prism Still",
        description: "Минимально необходимое движение.",
        durations: { quick: 85, gentle: 140, slow: 200 },
        easing: {
          standard: "linear",
          emphasized: "linear",
          gesture: "linear",
        },
        gestures: { edgeZone: 30, swipeThreshold: 78 },
      },
    },
    voice: {
      id: "prism-voice",
      name: "Prism",
      locale: "ru-RU",
      previewText: "Готова поделиться идеями и экспериментами Kolibri!",
      description: "Яркий голос с лёгким энтузиазмом.",
      pitch: 2,
      rate: 1.05,
      timbre: "bright",
    },
  },
];

export const personaThemeRegistry = new PersonaThemeRegistry(defaultPersonaThemes);
