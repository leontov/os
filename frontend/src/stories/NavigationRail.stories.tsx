import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, fn } from "@storybook/test";
import NavigationRail from "../components/NavigationRail";
import type { ConversationMetrics } from "../core/useKolibriChat";

const baseMetrics: ConversationMetrics = {
  userMessages: 24,
  assistantMessages: 31,
  knowledgeReferences: 5,
  lastUpdatedIso: new Date().toISOString(),
  conservedRatio: 0.72,
  stability: 0.84,
  auditability: 0.63,
  returnToAttractor: 0.42,
  latencyP50: 1.1,
};

const meta: Meta<typeof NavigationRail> = {
  title: "Layout/NavigationRail",
  component: NavigationRail,
  args: {
    isBusy: false,
    metrics: baseMetrics,
    activeSection: "dialog",
    onCreateConversation: fn(),
    onSectionChange: fn(),
  },
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof NavigationRail>;

export const Default: Story = {};

export const Busy: Story = {
  args: {
    isBusy: true,
  },
};

export const AnalyticsSection: Story = {
  args: {
    activeSection: "analytics",
  },
};

export const SettingsOpen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("Настройки оформления"));
  },
};
