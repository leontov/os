import { useCallback, useMemo } from "react";
import type { Locale, Translate } from "../../app/i18n";
import type { ConversationListItem } from "../../components/layout/Sidebar";
import type { MessageBlock } from "../../components/chat/Message";
import type { ConversationMode } from "../../components/chat/ConversationHero";
import type { ConversationStatus } from "../history";
import { DeliveryQueue, type DeliveryStatus } from "./deliveryQueue";
import {
  formatFaqAnswer,
  hasFaqKnowledge,
  resolveFaqAnswer,
  type Language,
} from "./faqEngine";

type ComposerOptions = {
  activeConversation: string | null;
  appendMessage: (id: string, message: MessageBlock) => void;
  updateMessage: (id: string, messageId: string, updater: (message: MessageBlock) => MessageBlock) => void;
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

interface IntentCandidateView {
  intent: string;
  confidence: number;
}

interface PromptTemplateView {
  id: string;
  intent: string;
  title: string;
  body: string;
  tags: string[];
}

interface IntentResolutionPayload {
  intent: string;
  confidence: number;
  variant: "a" | "b" | string;
  candidates: IntentCandidateView[];
  prompts: PromptTemplateView[];
  settings: Record<string, unknown>;
}

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

const INTENT_LABELS: Record<string, { ru: string; en: string }> = {
  greeting: { ru: "Приветствие", en: "Greeting" },
  bug_report: { ru: "Сообщение об ошибке", en: "Bug report" },
  feature_request: { ru: "Запрос функциональности", en: "Feature request" },
  data_question: { ru: "Аналитический запрос", en: "Data question" },
  research_plan: { ru: "Исследовательский план", en: "Research plan" },
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

const STREAM_ENDPOINT = "/api/v1/infer/stream";

const DELIVERY_TIMEOUT_MS = 8_000;
const MAX_DELIVERY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 320;
const FAILURE_RESET_MS = 3_200;

type SSEEvent = {
  event: string;
  data: unknown;
};

type StreamCallbacks = {
  onToken: (token: string) => void;
  signal?: AbortSignal;
};

export function useMessageComposer({
  activeConversation,
  appendMessage,
  updateMessage,
  authorLabel,
  assistantLabel,
  setStatus,
  getMessages,
  mode,
  locale,
  adaptiveMode,
}: ComposerOptions) {
  const deliveryQueue = useMemo(
    () =>
      new DeliveryQueue({
        timeoutMs: DELIVERY_TIMEOUT_MS,
        maxAttempts: MAX_DELIVERY_ATTEMPTS,
        baseRetryDelayMs: BASE_RETRY_DELAY_MS,
        failureResetMs: FAILURE_RESET_MS,
        onStatusChange: (status: DeliveryStatus) => {
          setStatus(status);
        },
      }),
    [setStatus],
  );

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

      const assistantTimestamp = Date.now();
      const assistantMessageId = crypto.randomUUID();
      appendMessage(activeConversation, {
        id: assistantMessageId,
        role: "assistant",
        authorLabel: assistantLabel,
        content: "",
        createdAt: new Date(assistantTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        timestamp: assistantTimestamp,
        streaming: true,
      });

      let buffer = "";
      try {
        await streamKolibriCompletion(
          { prompt: trimmed, mode },
          {
            onToken: (token) => {
              buffer += token;
              updateMessage(activeConversation, assistantMessageId, (message) => ({
                ...message,
                content: buffer,
                streaming: true,
              }));
            },
          },
        );

        const finalContent = buffer.trimEnd();
        const finalTimestamp = Date.now();
        updateMessage(activeConversation, assistantMessageId, (message) => ({
          ...message,
          content: finalContent,
          streaming: false,
          createdAt: new Date(finalTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          timestamp: finalTimestamp,
        }));
      } catch (error) {
        console.error("Kolibri generation failed", error);
        const assistantTimestamp = Date.now();
        const fallbackLanguage = detectLanguage(trimmed, locale, history);
        let fallbackContent = buffer.trimEnd();
        try {
          if (!fallbackContent) {
            fallbackContent = await generateFallbackResponse({
              prompt: trimmed,
              history,
              locale,
              mode,
              adaptiveMode,
            });
          }
        } catch (fallbackError) {
          console.error("Kolibri fallback generator failed", fallbackError);
        }

        if (!fallbackContent) {
          fallbackContent =
            fallbackLanguage === "ru"
              ? "Не получилось построить ответ. Попробуйте переформулировать запрос или добавить деталей."
              : "I couldn't finish the response. Please rephrase your request or share a little more context.";
        }

        updateMessage(activeConversation, assistantMessageId, (message) => ({
          ...message,
          content: fallbackContent,
          streaming: false,
          createdAt: new Date(assistantTimestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          timestamp: assistantTimestamp,
        }));
      } finally {
        setStatus("idle");
      }
    },
    [
      activeConversation,
      appendMessage,
      updateMessage,
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

function parseSSEEvent(rawEvent: string): SSEEvent | null {
  const trimmed = rawEvent.trim();
  if (!trimmed) {
    return null;
  }
  const lines = trimmed.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (!line) {
      continue;
    }
    if (line.startsWith("event:")) {
      event = line.slice(6).trim() || "message";
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }
  let data: unknown = null;
  if (dataLines.length > 0) {
    const payload = dataLines.join("\n");
    if (payload) {
      try {
        data = JSON.parse(payload);
      } catch {
        data = payload;
      }
    }
  }
  return { event, data };
}

async function streamKolibriCompletion(
  request: { prompt: string; mode: ConversationMode },
  { onToken, signal }: StreamCallbacks,
): Promise<void> {
  const response = await fetch(STREAM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ prompt: request.prompt, mode: request.mode }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Streaming request failed with status ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Streaming response body is not available in this environment");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  const processBuffer = () => {
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed = parseSSEEvent(rawEvent);
      if (parsed) {
        if (parsed.event === "token") {
          const token = (parsed.data as { token?: string })?.token;
          if (typeof token === "string" && token) {
            onToken(token);
          }
        } else if (parsed.event === "done") {
          completed = true;
        } else if (parsed.event === "error") {
          const detail = (parsed.data as { detail?: string })?.detail;
          throw new Error(detail || "Streaming failed");
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      processBuffer();
    }

    if (buffer.trim().length > 0) {
      processBuffer();
    }

    if (!completed) {
      throw new Error("Streaming response ended unexpectedly");
    }
  } finally {
    reader.releaseLock();
  }
}

async function generateFallbackResponse({ prompt, history, locale, mode, adaptiveMode }: GenerationOptions): Promise<string> {
  const language = detectLanguage(prompt, locale, history);
  const trimmed = prompt.trim();
  const jitter = 240 + Math.floor(Math.random() * 240);
  await delay(jitter);

  const faqMatch = hasFaqKnowledge ? resolveFaqAnswer(trimmed, language) : null;
  if (faqMatch) {
    return formatFaqAnswer(faqMatch, language);
  }

  if (trimmed.startsWith("/")) {
    return await handleSlashCommand(trimmed, { history, language, mode, adaptiveMode });
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

function getModeTone(language: Language, mode: ConversationMode): string {
  switch (mode) {
    case "creative":
      return language === "ru"
        ? "Добавьте пространство для экспериментов и тестируйте смелые гипотезы."
        : "Leave room for experiments and test bold hypotheses.";
    case "precise":
      return language === "ru"
        ? "Сверяйте результат с метриками и ожидаемым эффектом."
        : "Validate outcomes against metrics and measurable impact.";
    default:
      return language === "ru"
        ? "Балансируйте скорость с качеством и вовлекайте ключевых стейкхолдеров."
        : "Balance speed and quality while engaging the key stakeholders.";
  }
}

async function handleSlashCommand(
  prompt: string,
  context: {
    history: ReadonlyArray<MessageBlock>;
    language: Language;
    mode: ConversationMode;
    adaptiveMode: boolean;
  },
): Promise<string> {
  const [command, ...restParts] = prompt.split(/\s+/);
  const rest = restParts.join(" ").trim();
  const baseContext = { history: context.history, language: context.language, mode: context.mode };
  switch (command) {
    case "/summary":
      return renderSummary(rest, baseContext);
    case "/code":
      return renderCodeTemplate(rest, baseContext);
    case "/fix":
      return renderFixChecklist(rest, { ...baseContext, adaptiveMode: context.adaptiveMode });
    case "/context":
      return await renderContextInspector(rest, baseContext);
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
  {
    history,
    language,
    mode,
    adaptiveMode,
  }: {
    history: ReadonlyArray<MessageBlock>;
    language: Language;
    mode: ConversationMode;
    adaptiveMode: boolean;
  },
): string {
  const explicitKeywords = extractKeywords(focus);
  const lastMessage = history.length > 0 ? history[history.length - 1] : undefined;
  const fallbackSource = focus || lastMessage?.content || "";
  const keywords = explicitKeywords.length > 0 ? explicitKeywords : extractKeywords(fallbackSource);
  const strategy = resolveModeStrategy({
    prompt: fallbackSource || focus,
    keywords,
    preferredMode: mode,
    adaptive: adaptiveMode,
  });
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

async function renderContextInspector(
  focus: string,
  { history, language, mode }: { history: ReadonlyArray<MessageBlock>; language: Language; mode: ConversationMode },
): Promise<string> {
  const labels = COMMAND_LABELS[language];
  const recentUser = [...history]
    .reverse()
    .find((message) => message.role === "user" && message.content.trim().length > 0)?.content;
  const baseText = focus || recentUser?.trim() || "";

  if (!baseText) {
    return language === "ru"
      ? "Команде нужен запрос: добавьте описание после /context."
      : "Please add a description after /context so Kolibri can analyse it.";
  }

  const contextMessages = history
    .slice(-6)
    .map((message) => message.content)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
    .filter((value, index, array) => array.indexOf(value) === index);

  try {
    const response = await fetch("/api/v1/intents/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: baseText,
        context: contextMessages,
        top_k: 3,
        language,
      }),
    });

    if (!response.ok) {
      throw new Error(`Unexpected status ${response.status}`);
    }

    const payload = (await response.json()) as IntentResolutionPayload;
    const primaryLabel = formatIntentLabel(payload.intent, language);
    const primaryConfidence = formatConfidence(payload.confidence, language);
    const variantLabel = (payload.variant || "a").toUpperCase();
    const tone = getModeTone(language, mode);

    const lines: string[] = [
      `**${labels.context}**`,
      language === "ru"
        ? `Гипотеза намерения: **${primaryLabel}** (${primaryConfidence}).`
        : `Hypothesised intent: **${primaryLabel}** (${primaryConfidence}).`,
    ];

    const alternatives = payload.candidates
      .filter((candidate) => candidate.intent !== payload.intent)
      .slice(0, 3);
    if (alternatives.length > 0) {
      lines.push(
        "",
        language === "ru" ? "Альтернативы:" : "Alternatives:",
        ...alternatives.map(
          (candidate) =>
            `- ${formatIntentLabel(candidate.intent, language)} (${formatConfidence(candidate.confidence, language)})`,
        ),
      );
    }

    lines.push(
      "",
      language === "ru" ? `Эксперимент: вариант ${variantLabel}.` : `Experiment variant: ${variantLabel}.`,
    );

    const settingsLines = formatSettingsList(payload.settings);
    if (settingsLines.length > 0) {
      lines.push(
        language === "ru" ? "Настройки варианта:" : "Variant settings:",
        ...settingsLines,
      );
    }

    if (payload.prompts.length > 0) {
      lines.push(
        "",
        language === "ru" ? "Рекомендованные подсказки:" : "Recommended prompts:",
        ...payload.prompts.map((prompt) => `- **${prompt.title}** — ${prompt.body}`),
      );
    }

    lines.push("", tone, "", labels.closing);

    return lines
      .filter((line, index, array) => line !== "" || (index > 0 && array[index - 1] !== ""))
      .join("\n");
  } catch (error) {
    console.error("Intent resolution failed", error);
    return language === "ru"
      ? "Не удалось получить контекст команды. Проверьте подключение и повторите попытку."
      : "Kolibri couldn't fetch intent context. Please check the connection and try again.";
  }
}

function renderUnknownCommand(command: string, language: Language): string {
  return language === "ru"
    ? `Команда «${command}» пока не поддерживается. Доступные: /summary, /code, /fix, /context.`
    : `The command “${command}” is not supported yet. Available commands: /summary, /code, /fix, /context.`;
}

function formatIntentLabel(intent: string, language: Language): string {
  const mapping = INTENT_LABELS[intent];
  if (mapping) {
    return mapping[language] ?? mapping.en;
  }
  const cleaned = intent.replace(/[_-]+/g, " ");
  return capitalize(cleaned);
}

function formatConfidence(value: number, language: Language): string {
  const normalised = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const percent = (normalised * 100).toFixed(1).replace(/\.0$/, "");
  return language === "ru" ? `${percent}%` : `${percent}%`;
}

function formatSettingsList(settings: Record<string, unknown>): string[] {
  const entries = Object.entries(settings ?? {});
  if (entries.length === 0) {
    return [];
  }
  return entries.map(([key, rawValue]) => {
    const readableKey = capitalize(key.replace(/[_-]+/g, " "));
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      const formatted = rawValue % 1 === 0 ? rawValue.toString() : rawValue.toFixed(2);
      return `- ${readableKey}: ${formatted}`;
    }
    if (typeof rawValue === "string") {
      return `- ${readableKey}: ${rawValue}`;
    }
    return `- ${readableKey}: ${String(rawValue)}`;
  });
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

interface ModeStrategy {
  getLabel(language: Language): string;
  getTone(language: Language): string;
  getDefaultSteps(language: Language): readonly string[];
}

type ModeResolutionInput = {
  prompt: string;
  keywords: readonly string[];
  preferredMode: ConversationMode;
  adaptive: boolean;
};

type StrategyConfig = {
  label: { ru: string; en: string };
  tone: { ru: string; en: string };
  defaultSteps: { ru: readonly string[]; en: readonly string[] };
};

const createStrategy = ({ label, tone, defaultSteps }: StrategyConfig): ModeStrategy => ({
  getLabel: (language) => label[language],
  getTone: (language) => tone[language],
  getDefaultSteps: (language) => defaultSteps[language],
});

const MODE_STRATEGIES: Record<ConversationMode, ModeStrategy> = {
  balanced: createStrategy({
    label: { ru: "сбалансированном", en: "balanced" },
    tone: {
      ru: "Синхронизируйте продукт, исследование и разработку перед решением.",
      en: "Synchronise product, research, and engineering before executing.",
    },
    defaultSteps: {
      ru: [
        "Перечислите ключевые риски и как вы их смягчите.",
        "Согласуйте контрольные точки и ответственных.",
        "Подготовьте критерии готовности для команды.",
      ],
      en: [
        "List the key risks and mitigation owners.",
        "Align on checkpoints and accountable leads.",
        "Define the acceptance criteria for the team.",
      ],
    },
  }),
  creative: createStrategy({
    label: { ru: "креативном", en: "creative" },
    tone: {
      ru: "Поддержите эксперименты, но фиксируйте метрики успеха.",
      en: "Encourage experiments while capturing success metrics.",
    },
    defaultSteps: {
      ru: [
        "Соберите референсы и вдохновляющие примеры.",
        "Сформулируйте гипотезы для быстрых спринтов.",
        "Запланируйте проверку с пользователями.",
      ],
      en: [
        "Collect references and inspiring examples.",
        "Draft hypotheses for rapid sprints.",
        "Schedule user validation sessions.",
      ],
    },
  }),
  precise: createStrategy({
    label: { ru: "точном", en: "precise" },
    tone: {
      ru: "Подтвердите цифры и юридические требования перед запуском.",
      en: "Confirm the numbers and compliance constraints before launch.",
    },
    defaultSteps: {
      ru: [
        "Проверьте источники данных и качество выборок.",
        "Согласуйте SLA и процессы эскалации.",
        "Обновите документацию и контрольные чек-листы.",
      ],
      en: [
        "Audit data sources and sample quality.",
        "Align on SLAs and escalation paths.",
        "Refresh the documentation and control checklists.",
      ],
    },
  }),
};

const CREATIVE_HINTS = [
  /design/i,
  /дизайн/i,
  /prototype/i,
  /прототип/i,
  /concept/i,
  /концеп/i,
  /vision/i,
  /идея/i,
];

const PRECISE_HINTS = [
  /metric/i,
  /метрик/i,
  /kpi/i,
  /аналит/i,
  /analysis/i,
  /risk/i,
  /compliance/i,
  /регуля/i,
  /spec/i,
  /специф/i,
];

function resolveModeStrategy({ prompt, keywords, preferredMode, adaptive }: ModeResolutionInput): ModeStrategy {
  if (!adaptive) {
    return MODE_STRATEGIES[preferredMode] ?? MODE_STRATEGIES.balanced;
  }

  const haystack = `${prompt} ${keywords.join(" ")}`;
  if (CREATIVE_HINTS.some((pattern) => pattern.test(haystack))) {
    return MODE_STRATEGIES.creative;
  }
  if (PRECISE_HINTS.some((pattern) => pattern.test(haystack))) {
    return MODE_STRATEGIES.precise;
  }
  return MODE_STRATEGIES[preferredMode] ?? MODE_STRATEGIES.balanced;
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

