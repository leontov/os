import type { Meta, StoryObj } from "@storybook/react";
import { MessageList } from "./MessageList";
import type { MessageBlock } from "./Message";

const messages: MessageBlock[] = [
  {
    id: "1",
    role: "assistant",
    authorLabel: "Колибри",
    content: "Добро пожаловать! Я помогу организовать ваши заметки и планы.",
    createdAt: "09:00",
  },
  {
    id: "2",
    role: "user",
    authorLabel: "Вы",
    content: "Собери итоги по проекту Kolibri Чат и подготовь сводку для команды.",
    createdAt: "09:01",
  },
];

const meta: Meta<typeof MessageList> = {
  component: MessageList,
  title: "Chat/MessageList",
};

export default meta;

type Story = StoryObj<typeof MessageList>;

export const Default: Story = {
  args: {
    messages,
    status: "idle",
    onRetry: () => undefined,
  },
};

export const Loading: Story = {
  args: {
    messages: [],
    status: "loading",
    onRetry: () => undefined,
  },
};

export const Error: Story = {
  args: {
    messages: [],
    status: "error",
    onRetry: () => undefined,
  },
};

export const Empty: Story = {
  args: {
    messages: [],
    status: "idle",
    onRetry: () => undefined,
  },
};
