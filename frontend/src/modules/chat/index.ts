import { useCallback, useMemo } from "react";
import type { ConversationListItem } from "../../components/layout/Sidebar";
import type { MessageBlock } from "../../components/chat/Message";
import type { ConversationMode } from "../../components/chat/ConversationHero";
import type { ConversationStatus } from "../history";
import type { ModeStrategy } from "../models";
import { resolveModeStrategy, getModeStrategy } from "../models";

type Translate = (key: string) => string;

type Locale = "en" | "ru";

type ComposerOptions = {
  activeConversation: string | null;
  appendMessage: (id: string, message: MessageBlock) => void;
  authorLabel: string;
  assistantLabel: string;
  setStatus: (status: ConversationStatus) => void;
  getMessages: (id: string) => ReadonlyArray<MessageBlock>;
  mode: ConversationMode;
  locale: Locale;
  adaptiveMode: boolean;
};

interface GenerationOptions {
  prompt: string;
  history: ReadonlyArray<MessageBlock>;
  locale: Locale;
  mode: ConversationMode;
  adaptiveMode: boolean;
}

type Language = "ru" | "en";

const STOP_WORDS = new Set([
  "and",
  "the",
  "with",
  "that",
  "this",
  "from",
  "into",
  "have",
  "has",
  "about",
  "after",
  "your",
  "you",
  "for",
  "when",
  "where",
  "what",
  "как",
  "для",
  "это",
  "или",
  "чтобы",
  "ещё",
  "ещё",
  "про",
  "при",
  "под",
  "над",
  "если",
  "когда",
  "нам",
  "вам",
  "они",
  "него",
  "нее",
  "есть",
  "будет",
  "нужно",
  "надо",
  "можно",
  "так",
  "как",
  "что",
  "эта",
  "этот",
  "эта",
  "the",
]);

const COMMAND_LABELS: Record<Language, { summary: string; history: string; next: string; closing: string; code: string; fix: string; context: string }> = {
  ru: {
    summary: "Сводка диалога",
    history: "Последние сигналы",
    next: "Следующие шаги",
    closing: "Нужен другой формат — дай знать, и Kolibri адаптируется.",
    code: "Шаблон кода",
    fix: "Проверочный список",
    context: "Контекст",
  },
  en: {
    summary: "Conversation summary",
    history: "Recent signals",
    next: "Next steps",
    closing: "Let me know if you need a different format and Kolibri will adapt.",
    code: "Code template",
    fix: "Fix checklist",
    context: "Context",
  },
};

const CATEGORY_HINTS: Array<{ patterns: RegExp[]; ru: string; en: string }> = [
  {
    patterns: [/план/i, /roadmap/i, /strategy/i],
    ru: "Соберите краткий roadmap с этапами запуска и контрольными точками.",
    en: "Draft a concise roadmap with launch milestones and validation checkpoints.",
  },
  {
    patterns: [/метрик/i, /metric/i, /kpi/i, /окр/i, /okr/i],
    ru: "Определите измеримые показатели и согласуйте источники данных.",
    en: "Define measurable indicators and align on trusted data sources.",
  },
  {
    patterns: [/исслед/i, /research/i, /custdev/i, /интерв/i],
    ru: "Запланируйте глубинные интервью и зафиксируйте ключевые гипотезы.",
    en: "Schedule discovery interviews and document the main hypotheses.",
  },
  {
    patterns: [/дизайн/i, /ui/i, /ux/i, /интерф/i],
    ru: "Сформируйте набор UX-артефактов: пользовательский поток, макеты, критерии доступности.",
    en: "Collect UX artefacts: user flow, mockups, accessibility acceptance criteria.",
  },
  {
    patterns: [/код/i, /code/i, /api/i, /endpoint/i, /script/i],
    ru: "Подготовьте спецификацию API и тестовый сценарий для автоматической проверки.",
    en: "Prepare an API contract and a test scenario for automated validation.",
  },
];

export function useMessageComposer({
  activeConversation,
  appendMessage,
  authorLabel,
  assistantLabel,
  setStatus,
  getMessages,
  mode,
  locale,
  adaptiveMode,
}: ComposerOptions) {
  return useCallback(
    async (content: string) => {
      if (!activeConversation) {
        return;
      }

      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }

      const timestamp = Date.now();
      const userMessage: MessageBlock = {
        id: crypto.randomUUID(),
        role: "user",
        authorLabel,
        content: trimmed,
        createdAt: new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        timestamp,
      };

      const previousMessages = getMessages(activeConversation);
      const history = [...previousMessages, userMessage];

      appendMessage(activeConversation, userMessage);
      setStatus("loading");

      try {
        const responseContent = await generateKolibriResponse({
          prompt: trimmed,
          history,
          locale,
          mode,
          adaptiveMode,
        });

        const assistantTimestamp = Date.now();
        const assistantMessage: MessageBlock = {
          id: crypto.randomUUID(),
          role: "assistant",
          authorLabel: assistantLabel,
          content: responseContent,
          createdAt: new Date(assistantTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          timestamp: assistantTimestamp,
        };

        appendMessage(activeConversation, assistantMessage);
      } catch (error) {
        console.error("Kolibri generation failed", error);
        const assistantTimestamp = Date.now();
        const fallbackLanguage = detectLanguage(trimmed, locale, history);
        const fallbackContent =
          fallbackLanguage === "ru"
            ? "Не получилось построить ответ. Попробуйте переформулировать запрос или добавить деталей."
            : "I couldn't finish the response. Please rephrase your request or share a little more context.";
        appendMessage(activeConversation, {
          id: crypto.randomUUID(),
          role: "assistant",
          authorLabel: assistantLabel,
          content: fallbackContent,
          createdAt: new Date(assistantTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          timestamp: assistantTimestamp,
        });
      } finally {
        setStatus("idle");
      }
    },
    [
      activeConversation,
      appendMessage,
      authorLabel,
      assistantLabel,
      getMessages,
      locale,
      mode,
      adaptiveMode,
      setStatus,
    ],
  );
}

async function generateKolibriResponse({ prompt, history, locale, mode, adaptiveMode }: GenerationOptions): Promise<string> {
  const language = detectLanguage(prompt, locale, history);
  const trimmed = prompt.trim();
  const jitter = 240 + Math.floor(Math.random() * 240);
  await delay(jitter);

  if (trimmed.startsWith("/")) {
    const strategy = getModeStrategy(mode);
    return handleSlashCommand(trimmed, { history, language, strategy });
  }

  const keywords = extractKeywords(trimmed);
  const strategy = resolveModeStrategy({
    prompt: trimmed,
    keywords,
    preferredMode: mode,
    adaptive: adaptiveMode,
  });
  const greeting = buildGreeting(trimmed, language, strategy);
  const insights = buildInsights(trimmed, keywords, language);
  const contextual = buildContextualMemory(history, language);
  const steps = buildNextSteps(keywords, language, strategy);
  const closing = language === "ru"
    ? "Если нужно — уточни критерии успеха, и Kolibri обновит ответ."
    : "Let me know which success criteria matter most and Kolibri will refine the plan.";

  return [greeting, insights, contextual, steps, closing].filter(Boolean).join("\n\n");
}

function detectLanguage(prompt: string, locale: Locale, history: ReadonlyArray<MessageBlock>): Language {
  if (/[а-яё]/i.test(prompt)) {
    return "ru";
  }
  if (/[a-z]/i.test(prompt) && !/[а-яё]/i.test(prompt)) {
    return "en";
  }
  const lastAssistant = [...history].reverse().find((message) => message.role === "assistant");
  if (lastAssistant) {
    if (/[а-яё]/i.test(lastAssistant.content)) {
      return "ru";
    }
    if (/[a-z]/i.test(lastAssistant.content)) {
      return "en";
    }
  }
  return locale;
}

function extractKeywords(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-zа-я0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return [];
  }
  const raw = normalized.split(" ");
  const seen = new Set<string>();
  const result: string[] = [];
  for (const word of raw) {
    if (word.length < 3) {
      continue;
    }
    if (STOP_WORDS.has(word)) {
      continue;
    }
    if (seen.has(word)) {
      continue;
    }
    seen.add(word);
    result.push(word);
    if (result.length >= 8) {
      break;
    }
  }
  return result;
}

function buildGreeting(prompt: string, language: Language, strategy: ModeStrategy): string {
  const modeLabel = strategy.getLabel(language);
  if (language === "ru") {
    return `Kolibri в ${modeLabel} режиме подключён. Разбираю запрос: «${prompt}».`;
  }
  return `Kolibri is operating in ${modeLabel} mode. Interpreting your request: "${prompt}".`;
}

function buildInsights(prompt: string, keywords: string[], language: Language): string {
  const hints = CATEGORY_HINTS.filter((hint) => hint.patterns.some((pattern) => pattern.test(prompt)));
  const insightLines: string[] = [];

  for (const hint of hints) {
    insightLines.push(language === "ru" ? `- ${hint.ru}` : `- ${hint.en}`);
  }

  if (insightLines.length < 3 && keywords.length > 0) {
    const available = keywords.slice(0, 3 - insightLines.length);
    for (const keyword of available) {
      if (language === "ru") {
        insightLines.push(`- Фокус на «${capitalize(keyword)}»: определите проблему, пользователей и желаемый эффект.`);
      } else {
        insightLines.push(`- Focus on “${capitalize(keyword)}”: define the problem, the audience, and the intended impact.`);
      }
    }
  }

  if (insightLines.length === 0) {
    insightLines.push(
      language === "ru"
        ? "- Зафиксируйте цель, ограничения и доступные ресурсы, чтобы Kolibri мог адаптировать решение."
        : "- Capture the goal, constraints, and resources so Kolibri can tailor the solution.",
    );
  }

  const title = language === "ru" ? "🔎 Ключевые наблюдения" : "🔎 Key observations";
  return [`**${title}**`, ...insightLines].join("\n");
}

function buildContextualMemory(history: ReadonlyArray<MessageBlock>, language: Language): string | null {
  if (history.length <= 1) {
    return null;
  }
  const recent = history.slice(-6);
  const userFragments = recent.filter((message) => message.role === "user");
  if (userFragments.length === 0) {
    return null;
  }
  const bulletPoints = userFragments.map((message) => {
    const trimmed = message.content.replace(/\s+/g, " ").trim();
    const preview = trimmed.length > 120 ? `${trimmed.slice(0, 117)}…` : trimmed;
    return `- ${preview}`;
  });
  const title = language === "ru" ? "🧠 Контекст беседы" : "🧠 Conversation context";
  return [`**${title}**`, ...bulletPoints].join("\n");
}

function buildNextSteps(keywords: string[], language: Language, strategy: ModeStrategy): string {
  const steps: string[] = [];
  const modeTone = strategy.getTone(language);
  const targets = keywords.slice(0, 3);

  if (targets.length > 0) {
    const verbs = language === "ru"
      ? [
          "Опишите текущую ситуацию вокруг",
          "Соберите факты и данные по",
          "Проверьте риски и зависимости для",
        ]
      : [
          "Describe the current situation around",
          "Collect facts and signals for",
          "Evaluate risks and dependencies for",
        ];

    targets.forEach((keyword, index) => {
      const verb = verbs[index] ?? (language === "ru" ? "Согласуйте подход для" : "Align the approach for");
      if (language === "ru") {
        steps.push(`- ${verb} «${capitalize(keyword)}». ${modeTone}`);
      } else {
        steps.push(`- ${verb} “${capitalize(keyword)}”. ${modeTone}`);
      }
    });
  }

  if (steps.length === 0) {
    steps.push(...strategy.getDefaultSteps(language).map((step) => `- ${step}`));
  }

  const title = language === "ru" ? "🚀 Следующие шаги" : "🚀 Next steps";
  return [`**${title}**`, ...steps].join("\n");
}

function handleSlashCommand(
  prompt: string,
  context: { history: ReadonlyArray<MessageBlock>; language: Language; strategy: ModeStrategy },
): string {
  const [command, ...restParts] = prompt.split(/\s+/);
  const rest = restParts.join(" ").trim();
  switch (command) {
    case "/summary":
      return renderSummary(rest, context);
    case "/code":
      return renderCodeTemplate(rest, context);
    case "/fix":
      return renderFixChecklist(rest, context);
    default:
      return renderUnknownCommand(command, context.language);
  }
}

function renderSummary(
  focus: string,
  { history, language }: { history: ReadonlyArray<MessageBlock>; language: Language },
): string {
  const labels = COMMAND_LABELS[language];
  const recent = history.slice(-8);
  const userSignals = recent.filter((message) => message.role === "user");
  const assistantSignals = recent.filter((message) => message.role === "assistant");

  const userBullets = userSignals.length
    ? userSignals.map((message) => `- ${truncate(message.content)}`)
    : [language === "ru" ? "- Новых пользовательских запросов ещё нет." : "- No user prompts captured yet."];
  const assistantBullets = assistantSignals.length
    ? assistantSignals.map((message) => `- ${truncate(message.content)}`)
    : [language === "ru" ? "- Kolibri ожидает первый ответ." : "- Kolibri is waiting for the first reply."];

  const lines: string[] = [
    `**${labels.summary}**`,
    `**${labels.history}:**`,
    ...userBullets,
    "",
    ...assistantBullets,
    "",
    `**${labels.next}:**`,
    language === "ru"
      ? "- Сформулируйте ожидаемый результат и обозначьте критерии готовности."
      : "- Define the expected outcome and the definition of done.",
    language === "ru"
      ? "- Уточните заинтересованные команды и их ожидания."
      : "- Clarify stakeholders and their expectations.",
  ];

  if (focus) {
    lines.push("", `**${labels.context}:** ${focus}`);
  }

  lines.push("", labels.closing);

  return lines
    .filter((line, index, array) => line !== "" || (index > 0 && array[index - 1] !== ""))
    .join("\n");
}

function renderCodeTemplate(
  focus: string,
  { language }: { history: ReadonlyArray<MessageBlock>; language: Language },
): string {
  const keywords = extractKeywords(focus);
  const requestedLanguage = detectCodeLanguage(focus, language);
  const description = language === "ru"
    ? "Шаблон отражает базовую структуру. Дополните бизнес-логику и тесты под ваш сценарий."
    : "The snippet outlines the core structure. Extend the business logic and tests for your scenario.";

  const commentLine = language === "ru"
    ? "// TODO: Опишите основные шаги Kolibri" 
    : "// TODO: Describe the main Kolibri steps";

  const body = keywords.slice(0, 3).map((keyword, index) => {
    const fnName = camelCase(`${keyword}-${index}`, `handler${index}`);
    if (requestedLanguage === "python") {
      return `def ${fnName}(context):\n    """Операция для ${keyword}."""\n    raise NotImplementedError()`;
    }
    if (requestedLanguage === "typescript") {
      return `function ${fnName}(context: KolibriContext) {\n  throw new Error("Implement handler for ${keyword}");\n}`;
    }
    return `function ${fnName}(context) {\n  throw new Error('Implement handler for ${keyword}');\n}`;
  });

  if (body.length === 0) {
    if (requestedLanguage === "python") {
      body.push("def kolibri_handler(context):\n    \"\"\"Главная точка расширения Kolibri.\"\"\"\n    raise NotImplementedError()");
    } else if (requestedLanguage === "typescript") {
      body.push(
        "export function kolibriHandler(context: KolibriContext) {\n  throw new Error(\"Implement Kolibri response logic\");\n}",
      );
    } else {
      body.push("export function kolibriHandler(context) {\n  throw new Error('Implement Kolibri response logic');\n}");
    }
  }

  const snippet = [commentLine, "", ...body].join("\n");

  return [
    `**${COMMAND_LABELS[language].code} (${requestedLanguage})**`,
    "```" + requestedLanguage,
    snippet,
    "```",
    description,
  ].join("\n");
}

function renderFixChecklist(
  focus: string,
  { language, strategy }: { history: ReadonlyArray<MessageBlock>; language: Language; strategy: ModeStrategy },
): string {
  const keywords = extractKeywords(focus);
  const labels = COMMAND_LABELS[language];
  const tone = strategy.getTone(language);

  const checkpoints: string[] = keywords.slice(0, 4).map((keyword) =>
    language === "ru"
      ? `- Проверить гипотезы и данные вокруг «${capitalize(keyword)}».`
      : `- Validate hypotheses and data related to “${capitalize(keyword)}”.`,
  );

  if (checkpoints.length < 4) {
    checkpoints.push(
      language === "ru"
        ? "- Сверить результат с пользовательскими сценариями и метриками."
        : "- Align the outcome with user journeys and metrics.",
    );
  }
  if (checkpoints.length < 4) {
    checkpoints.push(
      language === "ru"
        ? "- Обновить документацию и уведомить заинтересованные команды."
        : "- Refresh the documentation and notify stakeholders.",
    );
  }

  return [
    `**${labels.fix}**`,
    ...checkpoints,
    "",
    tone,
    "",
    labels.closing,
  ].join("\n");
}

function renderUnknownCommand(command: string, language: Language): string {
  return language === "ru"
    ? `Команда «${command}» пока не поддерживается. Доступные: /summary, /code, /fix.`
    : `The command “${command}” is not supported yet. Available commands: /summary, /code, /fix.`;
}

function detectCodeLanguage(input: string, language: Language): "typescript" | "javascript" | "python" {
  if (/(python|py\b)/i.test(input)) {
    return "python";
  }
  if (/ts|typescript/i.test(input)) {
    return "typescript";
  }
  if (/js|javascript/i.test(input)) {
    return "javascript";
  }
  return language === "ru" ? "typescript" : "javascript";
}

function camelCase(input: string, fallback = "handler"): string {
  const transformed = input
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment, index) =>
      index === 0 ? segment.toLowerCase() : segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase(),
    )
    .join("");
  if (transformed.length === 0) {
    return fallback;
  }
  return transformed;
}

function truncate(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 120) {
    return normalized;
  }
  return `${normalized.slice(0, 117)}…`;
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function useHeroParticipants(
  activeConversation: ConversationListItem | null,
  t: Translate,
): ReadonlyArray<{ name: string; role: string }> {
  return useMemo(
    () => [
      {
        name: activeConversation?.title ?? t("chat.newConversationTitle"),
        role: t("hero.participants.product"),
      },
      { name: "Kolibri Research", role: t("hero.participants.research") },
      { name: "Колибри", role: t("hero.participants.assistant") },
    ],
    [activeConversation?.title, t],
  );
}

export function useHeroMetrics(t: Translate):
  ReadonlyArray<{ label: string; value: string; delta?: string }> {
  return useMemo(
    () => [
      { label: t("hero.metrics.quality"), value: "9.2/10", delta: "+0.4" },
      { label: t("hero.metrics.velocity"), value: "1.6s", delta: "-12%" },
      { label: t("hero.metrics.trust"), value: "98%" },
    ],
    [t],
  );
}

