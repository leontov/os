import { useMemo, useState } from "react";
import type { ConversationMode } from "../../components/chat/ConversationHero";
import type { Translate } from "../../app/i18n";

export type StrategyLanguage = "ru" | "en";

export interface ModeStrategyContext {
  prompt: string;
  keywords: ReadonlyArray<string>;
}

export interface ModeStrategy {
  readonly mode: ConversationMode;
  getLabel(language: StrategyLanguage): string;
  getTone(language: StrategyLanguage): string;
  getDefaultSteps(language: StrategyLanguage): ReadonlyArray<string>;
  score(context: ModeStrategyContext): number;
}

const sharedDefaultSteps: Record<StrategyLanguage, ReadonlyArray<string>> = {
  ru: [
    "Уточните конкретный результат, который хотите получить.",
    "Определите метрики успеха и данные, которые нужны Kolibri.",
    "Запланируйте проверку гипотезы с командой или пользователями.",
  ],
  en: [
    "Clarify the specific outcome you expect to achieve.",
    "List the success metrics and inputs Kolibri should track.",
    "Schedule a checkpoint with the team or stakeholders to validate the result.",
  ],
};

const creativePatterns = [
  /idea/i,
  /vision/i,
  /concept/i,
  /brainstorm/i,
  /story/i,
  /dream/i,
  /explore/i,
  /novel/i,
  /prototype/i,
  /иде/i,
  /концеп/i,
  /образ/i,
  /твор/i,
  /эксперимент/i,
  /исслед/i,
];

const precisePatterns = [
  /metric/i,
  /measure/i,
  /accuracy/i,
  /precision/i,
  /audit/i,
  /compliance/i,
  /analysis/i,
  /report/i,
  /risk/i,
  /budget/i,
  /timeline/i,
  /deadline/i,
  /validate/i,
  /spec/i,
  /bug/i,
  /issue/i,
  /метрик/i,
  /метод/i,
  /точн/i,
  /аналит/i,
  /отчёт/i,
  /отчет/i,
  /риск/i,
  /срок/i,
  /контроль/i,
  /провер/i,
  /качест/i,
];

const balancedStrategy: ModeStrategy = {
  mode: "balanced",
  getLabel(language) {
    return language === "ru" ? "сбалансированном" : "balanced";
  },
  getTone(language) {
    return language === "ru"
      ? "Балансируйте скорость с качеством и вовлекайте ключевых стейкхолдеров."
      : "Balance speed and quality while engaging the key stakeholders.";
  },
  getDefaultSteps(language) {
    return sharedDefaultSteps[language];
  },
  score(context) {
    if (context.keywords.length === 0) {
      return 1;
    }
    const collaborationSignals = [
      /align/i,
      /plan/i,
      /stakeholder/i,
      /sync/i,
      /roadmap/i,
      /balanced/i,
      /команд/i,
      /соглас/i,
      /план/i,
      /баланс/i,
    ];
    return context.keywords.reduce(
      (score, keyword) => score + (collaborationSignals.some((pattern) => pattern.test(keyword)) ? 2 : 0),
      1,
    );
  },
};

const creativeStrategy: ModeStrategy = {
  mode: "creative",
  getLabel(language) {
    return language === "ru" ? "креативном" : "creative";
  },
  getTone(language) {
    return language === "ru"
      ? "Добавьте пространство для экспериментов и тестируйте смелые гипотезы."
      : "Leave room for experiments and test bold hypotheses.";
  },
  getDefaultSteps(language) {
    if (language === "ru") {
      return [
        "Сформулируйте несколько смелых гипотез и обсудите их с командой.",
        "Соберите вдохновляющие примеры и аналогии для новых идей.",
        "Выберите быстрый эксперимент, чтобы проверить ценность концепции.",
      ];
    }
    return [
      "Frame a few bold hypotheses and review them with the team.",
      "Collect inspiring references and analogies for new ideas.",
      "Pick a fast experiment to validate the concept's value.",
    ];
  },
  score(context) {
    return creativePatterns.reduce((score, pattern) => {
      if (pattern.test(context.prompt)) {
        score += 2;
      }
      if (context.keywords.some((keyword) => pattern.test(keyword))) {
        score += 2;
      }
      return score;
    }, 0);
  },
};

const preciseStrategy: ModeStrategy = {
  mode: "precise",
  getLabel(language) {
    return language === "ru" ? "точном" : "precise";
  },
  getTone(language) {
    return language === "ru"
      ? "Сверяйте результат с метриками и ожидаемым эффектом."
      : "Validate outcomes against metrics and measurable impact.";
  },
  getDefaultSteps(language) {
    if (language === "ru") {
      return [
        "Соберите свежие метрики и факты перед принятием решения.",
        "Согласуйте контрольные точки и ответственных за проверки.",
        "Подготовьте отчёт и уведомите заинтересованные команды.",
      ];
    }
    return [
      "Gather up-to-date metrics and facts before deciding.",
      "Align on checkpoints and owners for the reviews.",
      "Prepare a report and notify the stakeholders.",
    ];
  },
  score(context) {
    return precisePatterns.reduce((score, pattern) => {
      if (pattern.test(context.prompt)) {
        score += 3;
      }
      score += context.keywords.reduce((acc, keyword) => (pattern.test(keyword) ? acc + 2 : acc), 0);
      return score;
    }, 0);
  },
};

const STRATEGIES: readonly ModeStrategy[] = [balancedStrategy, creativeStrategy, preciseStrategy];

export function getModeStrategy(mode: ConversationMode): ModeStrategy {
  const strategy = STRATEGIES.find((item) => item.mode === mode);
  return strategy ?? balancedStrategy;
}

export function resolveModeStrategy({
  prompt,
  keywords,
  preferredMode,
  adaptive,
}: {
  prompt: string;
  keywords: ReadonlyArray<string>;
  preferredMode: ConversationMode;
  adaptive: boolean;
}): ModeStrategy {
  const baseStrategy = getModeStrategy(preferredMode);
  if (!adaptive) {
    return baseStrategy;
  }

  const normalizedContext: ModeStrategyContext = {
    prompt: prompt.toLowerCase(),
    keywords: keywords.map((keyword) => keyword.toLowerCase()),
  };

  let bestStrategy = baseStrategy;
  let bestScore = baseStrategy.score(normalizedContext);

  for (const strategy of STRATEGIES) {
    const score = strategy.score(normalizedContext);
    if (score > bestScore) {
      bestScore = score;
      bestStrategy = strategy;
    }
  }

  return bestStrategy;
}

export function useConversationMode(t: Translate) {
  const [mode, setMode] = useState<ConversationMode>("balanced");
  const [isAdaptiveMode, setAdaptiveMode] = useState(true);

  const modeLabel = useMemo(() => {
    switch (mode) {
      case "creative":
        return t("hero.modes.creative");
      case "precise":
        return t("hero.modes.precise");
      default:
        return t("hero.modes.balanced");
    }
  }, [mode, t]);

  return { mode, setMode, modeLabel, isAdaptiveMode, setAdaptiveMode } as const;
}

export function getModelParameterEntries(t: Translate): readonly string[] {
  return [
    t("drawer.parameters.temperature"),
    t("drawer.parameters.tokens"),
    t("drawer.parameters.memory"),
    t("drawer.parameters.energy"),
    t("drawer.parameters.cost"),
    t("drawer.parameters.savings"),
  ];
}
