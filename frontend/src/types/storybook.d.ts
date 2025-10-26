declare module "@storybook/react" {
  export type Meta<TArgs = unknown> = {
    title?: string;
    component?: unknown;
    args?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
  } & Record<string, unknown>;

  export type StoryObj<TArgs = unknown> = {
    args?: Partial<Record<string, unknown>>;
  } & Record<string, unknown>;
}

declare module "@storybook/test" {
  export const fn: () => unknown;
  export const within: (element: HTMLElement) => {
    getByLabelText: (label: string) => HTMLElement;
  };
  export const userEvent: {
    click: (element: HTMLElement) => Promise<void>;
  };
}
