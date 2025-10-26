import type { PolicySeverity } from "./types";

export interface PolicyHint {
  code: string;
  label: string;
  severity: PolicySeverity;
  explanation: string;
}

interface PatternDefinition {
  code: string;
  label: string;
  severity: PolicySeverity;
  explanation: string;
  matcher: RegExp;
}

const PATTERNS: PatternDefinition[] = [
  {
    code: "pii-email",
    label: "Электронная почта",
    severity: "warn",
    explanation: "Обнаружен адрес электронной почты. Проверьте, можно ли делиться им в текущем контексте.",
    matcher: /[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/giu,
  },
  {
    code: "pii-phone",
    label: "Телефон",
    severity: "warn",
    explanation: "Номер телефона может относиться к персональным данным. Убедитесь, что у вас есть право на его передачу.",
    matcher: /(?:\+7|8)?[\s-]?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/gu,
  },
  {
    code: "pii-passport",
    label: "Паспортные данные",
    severity: "block",
    explanation: "Текст напоминает паспортные или удостоверяющие личность данные. Возможно, содержимое следует отредактировать.",
    matcher: /\b\d{2}\s?\d{2}\s?\d{6}\b/gu,
  },
  {
    code: "finance-card",
    label: "Платёжные реквизиты",
    severity: "block",
    explanation: "Последовательность похожа на номер банковской карты. Никогда не делитесь такими данными в открытом виде.",
    matcher: /\b(?:\d[ -]?){13,19}\b/gu,
  },
  {
    code: "explicit-content",
    label: "Потенциально чувствительный контент",
    severity: "info",
    explanation: "Найдены слова, которые могут указывать на деликатные или регулируемые темы. Проверьте уместность материала.",
    matcher: /\b(конфиденциальн\w*|секретн\w*|персональн\w*|инсайд\w*)\b/giu,
  },
];

export const detectPolicyHints = (content: string): PolicyHint[] => {
  if (!content?.trim()) {
    return [];
  }

  const findings = new Map<string, PolicyHint>();

  for (const pattern of PATTERNS) {
    if (pattern.matcher.test(content)) {
      findings.set(pattern.code, {
        code: pattern.code,
        label: pattern.label,
        severity: pattern.severity,
        explanation: pattern.explanation,
      });
    }
    pattern.matcher.lastIndex = 0;
  }

  return Array.from(findings.values());
};
