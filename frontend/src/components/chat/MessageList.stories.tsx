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
    timestamp: Date.now() - 5 * 60 * 1000,
  },
  {
    id: "2",
    role: "user",
    authorLabel: "Вы",
    content: "Собери итоги по проекту Kolibri Чат и подготовь сводку для команды.",
    createdAt: "09:01",
    timestamp: Date.now() - 4 * 60 * 1000,
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

export const Pending: Story = {
  args: {
    messages,
    status: "pending",
    onRetry: () => undefined,
  },
};

export const Delivering: Story = {
  args: {
    messages,
    status: "delivering",
    onRetry: () => undefined,
  },
};

export const Failed: Story = {
  args: {
    messages,
    status: "failed",
    onRetry: () => undefined,
  },
};
