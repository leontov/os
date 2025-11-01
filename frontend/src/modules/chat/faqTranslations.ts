export interface FaqTranslation {
  question: string;
  answer: string;
  section: string;
}

export const FAQ_TRANSLATIONS: Record<string, FaqTranslation> = {
  "что-такое-kolibriscript": {
    question: "What is KolibriScript?",
    answer: "It is a domain-specific language written in Russian for describing associations and the evolution of formulas.",
    section: "General",
  },
  "нужен-ли-интернет-для-работы": {
    question: "Do I need an internet connection to run Kolibri?",
    answer:
      "No. After the initial installation all components operate locally. Internet access is only required for downloading containers and future updates.",
    section: "General",
  },
  "какие-зависимости-нужны": {
    question: "Which dependencies are required?",
    answer: "Docker (Linux/macOS/Windows) or a compatible runtime and at least 8 GB of RAM.",
    section: "Installation",
  },
  "как-обновиться-без-простоя": {
    question: "How can I upgrade without downtime?",
    answer:
      "Start the new container version in parallel, shift the traffic to it, and only then stop the previous instance.",
    section: "Installation",
  },
  "где-хранятся-знания": {
    question: "Where are knowledge assets stored?",
    answer:
      "In the directory /var/lib/kolibri/knowledge/ which contains JSON manifests and the TF-IDF index.",
    section: "Operations",
  },
  "можно-ли-импортировать-собственные-документы": {
    question: "Can I import my own documents?",
    answer:
      "Yes. Place them inside docs/ or data/ and then run kolibri_indexer build or scripts/knowledge_pipeline.sh.",
    section: "Operations",
  },
  "поддерживается-ли-sso": {
    question: "Is SSO supported?",
    answer:
      "In the current release authentication happens via API token. SSO integration is planned on the roadmap.",
    section: "Security",
  },
  "какие-порты-открываются": {
    question: "Which ports does Kolibri expose?",
    answer: "By default the backend listens on TCP 4050 and the frontend on TCP 8080.",
    section: "Security",
  },
  "как-связаться-с-поддержкой": {
    question: "How can I contact support?",
    answer:
      "Send an email to support@kolibri.example or use the #kolibri-users Slack channel.",
    section: "Support",
  },
  "как-сообщить-об-уязвимости": {
    question: "How do I report a vulnerability?",
    answer:
      "Email security@kolibri.example with the reproduction steps and any supporting evidence.",
    section: "Support",
  },
};
