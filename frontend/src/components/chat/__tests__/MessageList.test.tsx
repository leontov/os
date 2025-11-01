import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MessageList } from "../MessageList";
import type { MessageBlock } from "../Message";
import { I18nProvider } from "../../../app/i18n";

const messages: MessageBlock[] = [
  {
    id: "1",
    role: "user",
    authorLabel: "You",
    content: "Test message",
    createdAt: "10:00",
    timestamp: Date.now(),
  },
];

const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

describe("MessageList status banner", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    Element.prototype.getBoundingClientRect = () => ({
      width: 600,
      height: 120,
      top: 0,
      left: 0,
      bottom: 120,
      right: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    cleanup();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it("renders pending banner when queue waits", () => {
    render(
      <I18nProvider>
        <MessageList messages={messages} status="pending" onRetry={() => undefined} />
      </I18nProvider>,
    );

    expect(screen.getByText(/Queued for delivery/i)).toBeInTheDocument();
  });

  it("shows retry action on failed delivery", () => {
    const onRetry = vi.fn();
    render(
      <I18nProvider>
        <MessageList messages={messages} status="failed" onRetry={onRetry} />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
  });
});
