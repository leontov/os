import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

const { useMediaQueryMock } = vi.hoisted(() => ({
  useMediaQueryMock: vi.fn<(query: string) => boolean>(),
}));

vi.mock("../../core/useMediaQuery", () => ({
  default: useMediaQueryMock,
}));

import ChatInput from "../ChatInput";

type SetupOptions = {
  sendOnEnter?: boolean;
};

const renderChatInput = (options: SetupOptions = {}) => {
  const onSubmit = vi.fn();
  const user = userEvent.setup();

  const Wrapper = () => {
    const [value, setValue] = useState("Привет");
    return (
      <ChatInput
        value={value}
        mode="balanced"
        isBusy={false}
        attachments={[]}
        onChange={setValue}
        onModeChange={() => {}}
        onSubmit={() => {
          onSubmit();
          setValue("");
        }}
        onReset={() => {}}
        onAttach={() => {}}
        onClearAttachments={() => {}}
        sendOnEnter={options.sendOnEnter}
      />
    );
  };

  render(<Wrapper />);

  return {
    user,
    textarea: screen.getByPlaceholderText("Сообщение для Колибри") as HTMLTextAreaElement,
    onSubmit,
  };
};

beforeEach(() => {
  useMediaQueryMock.mockReset();
});

describe("ChatInput keyboard behavior", () => {
  it("adds a newline on coarse pointer devices by default", async () => {
    useMediaQueryMock.mockImplementation((query) => query === "(pointer: coarse)");
    const { user, textarea, onSubmit } = renderChatInput();

    await act(async () => {
      await user.type(textarea, "{enter}");
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(textarea.value).toBe("Привет\n");
  });

  it("submits on desktop when Enter is pressed", async () => {
    useMediaQueryMock.mockReturnValue(false);
    const { user, textarea, onSubmit } = renderChatInput();

    await act(async () => {
      await user.type(textarea, "{enter}");
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(textarea.value).toBe("");
  });

  it("submits on coarse pointer devices when send-on-enter is enabled", async () => {
    useMediaQueryMock.mockImplementation((query) => query === "(pointer: coarse)");
    const { user, textarea, onSubmit } = renderChatInput({ sendOnEnter: true });

    await act(async () => {
      await user.type(textarea, "{enter}");
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(textarea.value).toBe("");
  });
});
