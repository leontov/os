import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";
import { Send, Settings } from "lucide-react";

const meta: Meta<typeof Button> = {
  component: Button,
  title: "UI/Button",
  args: {
    children: "Отправить",
  },
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {
  args: {
    variant: "primary",
  },
};

export const Secondary: Story = {
  args: {
    variant: "secondary",
    children: "Настройки",
  },
};

export const WithIcon: Story = {
  args: {
    variant: "primary",
    children: (
      <span className="flex items-center gap-2">
        <Send aria-hidden />
        Отправить
      </span>
    ),
  },
};

export const Icon: Story = {
  args: {
    variant: "ghost",
    size: "icon",
    children: <Settings aria-hidden />,
  },
};
