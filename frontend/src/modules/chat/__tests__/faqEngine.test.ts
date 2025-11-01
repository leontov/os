import { describe, expect, it } from "vitest";

import { formatFaqAnswer, resolveFaqAnswer } from "../faqEngine";

describe("faqEngine", () => {
  it("matches Russian FAQ entries", () => {
    const match = resolveFaqAnswer("Нужен ли интернет для работы?", "ru");
    expect(match).not.toBeNull();
    expect(match?.language).toBe("ru");
    const formatted = match && formatFaqAnswer(match, "ru");
    expect(formatted).toContain("Нет, после установки");
  });

  it("provides English translations for FAQ entries", () => {
    const match = resolveFaqAnswer("How can I contact support?", "en");
    expect(match).not.toBeNull();
    expect(match?.language).toBe("en");
    expect(match?.answer).toContain("support@kolibri.example");
  });

  it("returns null for unknown prompts", () => {
    const match = resolveFaqAnswer("Как синхронизировать лунный модуль?", "ru");
    expect(match).toBeNull();
  });
});
