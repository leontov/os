import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import WelcomeScreen from "../WelcomeScreen";

const createDate = (offsetMinutes: number) =>
  new Date(Date.now() - offsetMinutes * 60 * 1000).toISOString();

const setViewportWidth = (width: number) => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
};

const baseProps = {
  onSuggestionSelect: vi.fn(),
  onConversationSelect: vi.fn(),
  onAttachFiles: vi.fn(),
  isAttachmentDisabled: false,
  isPopularLoading: false,
  isWhatsNewLoading: false,
  recentConversations: [
    {
      id: "1",
      title: "Demo",
      preview: "Последний диалог о Kolibri.",
      createdAtIso: createDate(120),
      updatedAtIso: createDate(15),
    },
  ],
  popularGpts: [
    {
      id: "gpt-1",
      title: "Research",
      description: "Помощник исследований",
      prompt: "Собери факты о Kolibri OS.",
    },
    {
      id: "gpt-2",
      title: "Planning",
      description: "Планировщик", 
      prompt: "Составь план релиза.",
    },
    {
      id: "gpt-3",
      title: "Analysis",
      description: "Аналитик",
      prompt: "Оцени риски внедрения.",
    },
  ],
  whatsNew: [
    {
      id: "w-1",
      title: "Обновление ядра",
      summary: "Kolibri OS получила новый модуль обработки.",
      publishedAtIso: createDate(5),
      prompt: "Расскажи об обновлении ядра.",
    },
  ],
};

describe("WelcomeScreen responsive layout", () => {
  beforeEach(() => {
    setViewportWidth(375);
    document.body.style.margin = "0";
    document.body.style.width = "375px";
    document.documentElement.style.width = "375px";
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test("fits within the mobile viewport without horizontal scrolling", () => {
    const { container } = render(<WelcomeScreen {...baseProps} />);

    const section = container.querySelector("section");
    expect(section).toBeTruthy();

    const viewportWidth = 375;
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(viewportWidth);
    expect(document.body.scrollWidth).toBeLessThanOrEqual(viewportWidth);
    if (section) {
      expect(section.scrollWidth).toBeLessThanOrEqual(viewportWidth);
    }
  });
});

