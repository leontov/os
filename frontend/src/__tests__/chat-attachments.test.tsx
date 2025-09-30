import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import App from "../App";
import kolibriBridge from "../core/kolibri-bridge";

vi.mock("../core/kolibri-bridge", () => {
  const ask = vi.fn().mockResolvedValue("Kolibri ответил");
  const reset = vi.fn().mockResolvedValue(undefined);
  return {
    default: {
      ready: Promise.resolve(),
      ask,
      reset,
    },
  };
});

describe("Chat attachments", () => {
  const user = userEvent.setup();
  const originalFetch = global.fetch;
  const askMock = kolibriBridge.ask as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    askMock.mockClear();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify([
          {
            id: "att-1",
            name: "sample.txt",
            contentType: "text/plain",
            size: 24,
            text: "Вложение с текстом",
          },
        ]),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.clearAllMocks();
    global.fetch = originalFetch;
  });

  it("uploads an attachment, displays it and forwards the text in the prompt", async () => {
    render(<App />);

    await act(async () => {
      await kolibriBridge.ready;
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /вложить/i })).toBeEnabled();
    });

    const messageInput = await screen.findByPlaceholderText("Сообщение для Колибри");
    await user.type(messageInput, "Привет, Колибри!");

    const fileInput = screen.getByTestId("chat-attachment-input") as HTMLInputElement;
    const file = new File(["Вложение с текстом"], "sample.txt", { type: "text/plain" });
    await act(async () => {
      await user.upload(fileInput, file);
    });

    await screen.findByText("sample.txt");

    const sendButton = screen.getByRole("button", { name: /отправить/i });
    await act(async () => {
      await user.click(sendButton);
    });

    await waitFor(() => {
      expect(askMock).toHaveBeenCalledTimes(1);
    });

    const [[promptArg]] = askMock.mock.calls;
    expect(promptArg).toContain("Привет, Колибри!");
    expect(promptArg).toContain("sample.txt");
    expect(promptArg).toContain("Вложение с текстом");

    await screen.findByText("Вложение с текстом");
    await screen.findByText("Kolibri ответил");
  });
});
