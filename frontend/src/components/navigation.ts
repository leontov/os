import { Activity, Compass, Network, Sparkles } from "lucide-react";

export type NavigationSection = "dialog" | "knowledge" | "swarm" | "analytics";

export const NAVIGATION_ITEMS: Array<{ icon: typeof Sparkles; label: string; value: NavigationSection }> = [
  { icon: Sparkles, label: "Диалог", value: "dialog" },
  { icon: Compass, label: "Знания", value: "knowledge" },
  { icon: Network, label: "Рой", value: "swarm" },
  { icon: Activity, label: "Аналитика", value: "analytics" },
];
