declare module "@storybook/react" {
  export type Meta<TArgs = Record<string, unknown>> = {
    title?: string;
    component?: unknown;
    args?: Partial<TArgs>;
    parameters?: Record<string, unknown>;
  } & Record<string, unknown>;

  export type StoryObj<TArgs = Record<string, unknown>> = {
    args?: Partial<TArgs>;
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
