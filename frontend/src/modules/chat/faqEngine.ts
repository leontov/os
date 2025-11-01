import { faqEntries as rawFaqEntries, type KolibriFaqEntry } from "virtual:kolibri-knowledge";

import { FAQ_TRANSLATIONS } from "./faqTranslations";

export type Language = "ru" | "en";

export interface FaqMatch {
  slug: string;
  language: Language;
  question: string;
  answer: string;
  section: string;
  confidence: number;
}

interface NormalisedEntry extends FaqMatch {
  tokens: Set<string>;
  questionTokens: Set<string>;
  normalisedQuestion: string;
}

const TOKEN_PATTERN = /[a-zA-Zа-яА-ЯёЁ0-9]+/g;

const normalise = (value: string): string => value.toLowerCase().replace(/\s+/g, " ").trim();

const tokenise = (value: string): string[] => {
  const matches = value.toLowerCase().match(TOKEN_PATTERN);
  if (!matches) {
    return [];
  }
  return matches.map((token) => token.normalize("NFC"));
};

const buildEntry = (entry: KolibriFaqEntry): NormalisedEntry => {
  const question = entry.question.trim();
  const answer = entry.answer.trim();
  const section = entry.section.trim() || "FAQ";
  const combined = `${question}\n${answer}`;
  const tokens = new Set(tokenise(combined));
  const questionTokens = new Set(tokenise(question));
  return {
    slug: entry.slug,
    language: "ru",
    question,
    answer,
    section,
    confidence: 0,
    tokens,
    questionTokens,
    normalisedQuestion: normalise(question),
  };
};

const buildEnglishEntry = (entry: NormalisedEntry): NormalisedEntry | null => {
  const translation = FAQ_TRANSLATIONS[entry.slug];
  if (!translation) {
    return null;
  }
  const question = translation.question.trim();
  const answer = translation.answer.trim();
  const section = translation.section.trim() || entry.section;
  const combined = `${question}\n${answer}`;
  const tokens = new Set(tokenise(combined));
  const questionTokens = new Set(tokenise(question));
  return {
    slug: entry.slug,
    language: "en",
    question,
    answer,
    section,
    confidence: 0,
    tokens,
    questionTokens,
    normalisedQuestion: normalise(question),
  };
};

const normalisedEntries: NormalisedEntry[] = (() => {
  const base = rawFaqEntries.map((entry) => buildEntry(entry));
  const english = base
    .map((entry) => buildEnglishEntry(entry))
    .filter((item): item is NormalisedEntry => Boolean(item));
  return [...base, ...english];
})();

const selectEntriesForLanguage = (language: Language): NormalisedEntry[] =>
  normalisedEntries.filter((entry) => entry.language === language);

export const hasFaqKnowledge = normalisedEntries.length > 0;

export function resolveFaqAnswer(prompt: string, language: Language): FaqMatch | null {
  const entries = selectEntriesForLanguage(language);
  if (!entries.length) {
    return null;
  }

  const trimmed = prompt.trim();
  if (!trimmed) {
    return null;
  }

  const normalisedPrompt = normalise(trimmed);
  const queryTokens = tokenise(trimmed);
  if (!queryTokens.length) {
    return null;
  }
  const queryTokenSet = new Set(queryTokens);

  let best: NormalisedEntry | null = null;
  let bestConfidence = 0;

  for (const entry of entries) {
    const intersecting = queryTokens.filter((token) => entry.tokens.has(token));
    if (!intersecting.length) {
      continue;
    }

    const matchRatio = intersecting.length / Math.max(1, queryTokenSet.size);
    const questionMatches = intersecting.filter((token) => entry.questionTokens.has(token));
    const questionRatio = questionMatches.length / Math.max(1, entry.questionTokens.size);
    const unionSize = new Set([...entry.tokens, ...queryTokenSet]).size;
    const jaccard = unionSize > 0 ? intersecting.length / unionSize : 0;

    let confidence = matchRatio * 0.5 + questionRatio * 0.3 + jaccard * 0.2;

    if (entry.normalisedQuestion === normalisedPrompt) {
      confidence = Math.max(confidence, 0.9);
    } else if (
      entry.normalisedQuestion.includes(normalisedPrompt) ||
      normalisedPrompt.includes(entry.normalisedQuestion)
    ) {
      confidence = Math.max(confidence, 0.65);
    }

    if (confidence > bestConfidence) {
      best = entry;
      bestConfidence = confidence;
    }
  }

  if (!best || bestConfidence < 0.45) {
    return null;
  }

  return {
    slug: best.slug,
    language: best.language,
    question: best.question,
    answer: best.answer,
    section: best.section,
    confidence: Math.min(1, bestConfidence),
  };
}

export function formatFaqAnswer(match: FaqMatch, language: Language): string {
  const title = language === "ru" ? "📦 Оффлайн-ответ Kolibri" : "📦 Kolibri offline answer";
  const questionLabel = language === "ru" ? "Вопрос" : "Question";
  const answerLabel = language === "ru" ? "Ответ" : "Answer";
  const sectionLabel = language === "ru" ? "Раздел" : "Section";
  const sourceLabel = language === "ru" ? "Источник: оффлайн-FAQ" : "Source: offline FAQ";

  return [
    `**${title}**`,
    `${questionLabel}: ${match.question}`,
    `${answerLabel}: ${match.answer}`,
    `${sectionLabel}: ${match.section}`,
    sourceLabel,
  ].join("\n\n");
}
