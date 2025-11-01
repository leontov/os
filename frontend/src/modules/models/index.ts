import { useMemo, useState } from "react";
import type { ConversationMode } from "../../components/chat/ConversationHero";

type Translate = (key: string) => string;

export function useConversationMode(t: Translate) {
  const [mode, setMode] = useState<ConversationMode>("balanced");

  const modeLabel = useMemo(() => {
    switch (mode) {
      case "creative":
        return t("hero.modes.creative");
      case "precise":
        return t("hero.modes.precise");
      default:
        return t("hero.modes.balanced");
    }
  }, [mode, t]);

  return { mode, setMode, modeLabel } as const;
}

export function getModelParameterEntries(t: Translate): readonly string[] {
  return [
    t("drawer.parameters.temperature"),
    t("drawer.parameters.tokens"),
    t("drawer.parameters.memory"),
    t("drawer.parameters.energy"),
    t("drawer.parameters.cost"),
    t("drawer.parameters.savings"),
  ];
}
