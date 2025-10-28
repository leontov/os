import type { Preview } from "@storybook/react";
import { AppProviders } from "../src/app/providers";

const preview: Preview = {
  decorators: [
    (Story) => (
      <AppProviders>
        <div className="min-h-screen bg-[var(--bg)] p-6 text-[var(--text)]">
          <Story />
        </div>
      </AppProviders>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    backgrounds: {
      default: "kolibri-dark",
      values: [
        { name: "kolibri-dark", value: "#0e1116" },
        { name: "kolibri-light", value: "#f5f7fa" },
      ],
    },
    a11y: {
      element: "#storybook-root",
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
  },
};

export default preview;
