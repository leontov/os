import type { Meta, StoryObj } from "@storybook/react";
import { useState, type ComponentProps } from "react";
import ChatLayout from "../components/layout/ChatLayout";
import { defaultPersonaThemes } from "../core/personaThemeRegistry";

const personaMotion = defaultPersonaThemes[0].motion.expressive;

const meta: Meta<typeof ChatLayout> = {
  title: "Layout/ChatLayout",
  component: ChatLayout,
  args: {
    sidebarLabel: "Боковая панель",
    sidebar: (
      <div className="flex h-full flex-col gap-4 bg-sidebar px-4 py-6">
        <span className="pill-badge">Демо</span>
        <p className="text-sm text-text-muted">Это пример содержимого боковой панели с произвольными элементами.</p>
      </div>
    ),
    footer: (
      <div className="rounded-2xl border border-border/70 bg-surface px-4 py-3 text-sm text-text-muted">
        Область для элементов ввода.
      </div>
    ),
    motionPattern: personaMotion,
    isZenMode: false,
    isSidebarOpen: false,
  },
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

type Story = StoryObj<typeof ChatLayout>;

const InteractiveChatLayout = (props: ComponentProps<typeof ChatLayout>) => {
  const [open, setOpen] = useState(props.isSidebarOpen);
  return <ChatLayout {...props} isSidebarOpen={open} onSidebarOpenChange={setOpen} />;
};

export const Default: Story = {
  render: (args) => (
    <InteractiveChatLayout {...args}>
      <div className="rounded-2xl border border-border/70 bg-surface px-6 py-10 shadow-sm">
        <h2 className="text-xl font-semibold text-text">Главная область</h2>
        <p className="mt-3 text-sm text-text-muted">
          Здесь отображается основное содержимое. Используйте жесты или кнопку для открытия боковой панели.
        </p>
      </div>
    </InteractiveChatLayout>
  ),
};

export const ZenMode: Story = {
  args: {
    isZenMode: true,
  },
  render: (args) => (
    <InteractiveChatLayout {...args}>
      <div className="rounded-2xl border border-border/70 bg-surface px-6 py-10 shadow-sm">
        <h2 className="text-xl font-semibold text-text">Фокус</h2>
        <p className="mt-3 text-sm text-text-muted">
          В режиме фокуса боковая панель отображается поверх контента и скрывается автоматически.
        </p>
      </div>
    </InteractiveChatLayout>
  ),
};
