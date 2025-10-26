import { describe, expect, it } from "vitest";
import { defaultPersonaThemes, personaThemeRegistry } from "../personaThemeRegistry";

describe("personaThemeRegistry", () => {
  it("applies persona tokens to the document", () => {
    const aurora = defaultPersonaThemes[0];
    const motion = aurora.motion.expressive;

    personaThemeRegistry.apply(aurora.id, "light", motion);

    expect(document.documentElement.getAttribute("data-persona")).toBe(aurora.id);
    expect(document.documentElement.style.getPropertyValue("--color-brand")).toContain("16 163 127");
    expect(document.documentElement.style.getPropertyValue("--motion-duration-quick")).toBe(`${motion.durations.quick}ms`);
  });

  it("notifies subscribers when persona changes", () => {
    const received: string[] = [];
    const unsubscribe = personaThemeRegistry.subscribe((context) => {
      received.push(context.persona.id);
    });

    const target = defaultPersonaThemes[1];
    personaThemeRegistry.apply(target.id, "dark", target.motion.reduced);

    expect(received.at(-1)).toBe(target.id);
    unsubscribe();
  });
});
