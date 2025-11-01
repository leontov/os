import type { Meta, StoryObj } from "@storybook/react";
import { Composer } from "./Composer";

const meta: Meta<typeof Composer> = {
  component: Composer,
  title: "Chat/Composer",
};

export default meta;

type Story = StoryObj<typeof Composer>;

export const Default: Story = {
  args: {
    draft: "",
    onChange: () => undefined,
    onSend: async () => undefined,
  },
};

export const WithDraft: Story = {
  args: {
    draft: "Расскажи о состоянии проекта",
    onChange: () => undefined,
    onSend: async () => undefined,
  },
};

export const Disabled: Story = {
  args: {
    draft: "",
    onChange: () => undefined,
    onSend: async () => undefined,
    disabled: true,
  },
};
