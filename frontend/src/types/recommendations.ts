export interface PopularGptRecommendation {
  id: string;
  title: string;
  description: string;
  prompt: string;
  badge?: string;
  author?: string;
}

export interface WhatsNewHighlight {
  id: string;
  title: string;
  summary: string;
  prompt?: string;
  link?: string;
  publishedAtIso?: string;
}
