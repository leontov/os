import type { Preview } from "@storybook/react";
import { useEffect } from "react";
import { __dangerousOverridePersonaProfileForStory } from "../src/core/usePersonaTheme";
import "../src/styles/tailwind.css";

declare global {
  // eslint-disable-next-line no-var
  var fetch: typeof fetch;
}

const API_ENDPOINT = "/api/profile/theme";

const PersonaDecorator = (Story: () => JSX.Element, context: { globals?: Record<string, unknown> }) => {
  const persona = (context.globals?.persona as string | undefined) ?? "aurora";
  const appearance = (context.globals?.appearance as string | undefined) ?? "light";
  const motion = (context.globals?.motion as string | undefined) ?? "expressive";

  const Wrapper = () => {
    useEffect(() => {
      __dangerousOverridePersonaProfileForStory({ personaId: persona, appearance, motionPreference: motion });
      const profile = { personaId: persona, appearance, motionPreference: motion, voiceId: `${persona}-voice` };
      const previousFetch = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = (() => {
          if (typeof input === "string") {
            return input;
          }
          if (input instanceof URL) {
            return input.toString();
          }
          if (typeof input === "object" && input && "url" in input) {
            return String((input as Request).url);
          }
          return String(input);
        })();
        if (target.endsWith(API_ENDPOINT)) {
          if (init?.method === "PUT") {
            const body = init.body ? JSON.parse(String(init.body)) : profile;
            const updated = {
              ...profile,
              ...body,
              updatedAtIso: new Date().toISOString(),
            };
            return new Response(JSON.stringify(updated), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ ...profile, updatedAtIso: new Date().toISOString() }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return previousFetch(input, init);
      }) as typeof fetch;
      return () => {
        globalThis.fetch = previousFetch;
      };
    }, [persona, appearance, motion]);

    return <Story />;
  };

  return <Wrapper />;
};

const preview: Preview = {
  decorators: [PersonaDecorator],
  globalTypes: {
    persona: {
      name: "Persona",
      defaultValue: "aurora",
      toolbar: {
        icon: "user",
        items: [
          { value: "aurora", title: "Aurora" },
          { value: "nocturne", title: "Nocturne" },
          { value: "prism", title: "Prism" },
        ],
      },
    },
    appearance: {
      name: "Appearance",
      defaultValue: "light",
      toolbar: {
        icon: "contrast",
        items: [
          { value: "light", title: "Светлая" },
          { value: "dark", title: "Тёмная" },
          { value: "system", title: "Системная" },
        ],
      },
    },
    motion: {
      name: "Motion",
      defaultValue: "expressive",
      toolbar: {
        icon: "move",
        items: [
          { value: "expressive", title: "Выразительная" },
          { value: "reduced", title: "Минимальная" },
          { value: "auto", title: "Авто" },
        ],
      },
    },
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    backgrounds: {
      default: "surface",
      values: [
        { name: "surface", value: "#f5f8ff" },
        { name: "surface-dark", value: "#10132d" },
      ],
    },
    layout: "fullscreen",
  },
};

export default preview;
