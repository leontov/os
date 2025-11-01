import { useId, useMemo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import { Clipboard, Check, Clock, User, Bot, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "../ui/Button";
import { useI18n } from "../../app/i18n";

export type AuthorRole = "user" | "assistant" | "system";

export interface MessageBlock {
  id: string;
  role: AuthorRole;
  authorLabel: string;
  content: string;
  createdAt: string;
  timestamp: number;
  streaming?: boolean;
}

interface MessageProps {
  message: MessageBlock;
  compact?: boolean;
}

const MAX_VISIBLE_CHARACTERS = 1200;

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);

export function Message({ message, compact }: MessageProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();

  const icon = message.role === "assistant" ? <Bot aria-hidden /> : <User aria-hidden />;
  const isStreaming = Boolean(message.streaming);

  const isCollapsible = message.content.length > MAX_VISIBLE_CHARACTERS;
  const visibleContent = expanded || !isCollapsible ? message.content : `${message.content.slice(0, MAX_VISIBLE_CHARACTERS)}…`;

  const components = useMemo<Components>(() => {
    type CodeBlockProps = {
      inline?: boolean;
      className?: string;
      children?: React.ReactNode;
    } & React.HTMLAttributes<HTMLElement>;

    const code = ({ inline, className, children, ...props }: CodeBlockProps) => {
      const language = /language-(\w+)/.exec(className ?? "")?.[1];
      const raw = String(children).replace(/\n$/, "");
      const highlighted = language ? hljs.highlight(raw, { language }).value : hljs.highlightAuto(raw).value;
      if (inline) {
        return (
          <code className="rounded bg-[rgba(255,255,255,0.08)] px-1 py-0.5 font-mono text-sm" {...props}>
            {children}
          </code>
        );
      }
      return (
        <pre className="relative mt-3 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-4">
          <div className="absolute right-3 top-3 flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(raw).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1800);
                });
              }}
              aria-label={t("message.copy")}
            >
              {copied ? <Check aria-hidden /> : <Clipboard aria-hidden />}
              <span className="sr-only">{t("message.copy")}</span>
            </Button>
          </div>
          <code
            className={`block max-h-96 overflow-auto font-mono text-sm leading-relaxed ${language ? `language-${language}` : ""}`.trim()}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      );
    };

    return {
      code,
      a: ({ href, children, ...props }) => (
        <a
          {...props}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-[var(--brand)] underline decoration-dotted decoration-[var(--brand)] hover:text-[var(--brand-strong)]"
        >
          {children}
          <ExternalLink aria-hidden className="h-3 w-3" />
        </a>
      ),
      blockquote: ({ children }) => (
        <blockquote className="border-l-2 border-[var(--border-subtle)] pl-4 text-[var(--muted)]">{children}</blockquote>
      ),
      ul: ({ children }) => <ul className="ml-5 list-disc space-y-1">{children}</ul>,
      ol: ({ children }) => <ol className="ml-5 list-decimal space-y-1">{children}</ol>,
      li: ({ children }) => <li className="text-[var(--text)]">{children}</li>,
      p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
      table: ({ children }) => (
        <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border-subtle)]">
          <table className="w-full border-collapse text-sm">{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead className="bg-[rgba(255,255,255,0.04)]">{children}</thead>,
      tbody: ({ children }) => <tbody>{children}</tbody>,
      th: ({ children }) => (
        <th className="px-3 py-2 text-left font-semibold text-[var(--text)]">{children}</th>
      ),
      td: ({ children }) => <td className="px-3 py-2 text-[var(--muted)]">{children}</td>,
    } satisfies Components;
  }, [copied, t]);

  const rendered = useMemo(
    () => (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {visibleContent}
      </ReactMarkdown>
    ),
    [components, visibleContent],
  );

  return (
    <article
      className={`group/message flex gap-3 rounded-2xl px-4 py-4 transition hover:bg-[rgba(255,255,255,0.02)] ${
        message.role === "assistant" ? "bg-[rgba(74,222,128,0.04)]" : "bg-transparent"
      }`}
      aria-labelledby={contentId}
      aria-busy={isStreaming}
    >
      {!compact ? (
        <span
          className={`mt-1 flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border ${
            message.role === "assistant"
              ? "border-[rgba(74,222,128,0.45)] text-[var(--brand)]"
              : "border-[var(--border-subtle)] text-[var(--muted)]"
          }`}
        >
          {icon}
        </span>
      ) : (
        <span className="mt-1 h-12 w-12 flex-shrink-0" aria-hidden />
      )}
      <div className="flex flex-1 flex-col gap-3">
        {!compact ? (
          <header className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
            <span className="font-semibold text-[var(--text)]" id={contentId}>
              {message.authorLabel}
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
              <Clock aria-hidden className="h-3 w-3" />
              {message.createdAt}
            </span>
          </header>
        ) : null}
        <div className="prose prose-invert max-w-none text-[var(--text)] prose-headings:text-[var(--text)] prose-code:text-[var(--text)]">
          {rendered}
          {isStreaming ? (
            <span
              aria-hidden
              className="ml-1 inline-block h-4 w-1 animate-pulse rounded-full bg-[var(--brand)] align-middle"
            />
          ) : null}
          {isStreaming ? <span className="sr-only">{t("message.streaming")}</span> : null}
        </div>
        {isCollapsible ? (
          <button
            type="button"
            className="w-max rounded-full border border-[var(--border-subtle)] px-4 py-1 text-xs font-medium text-[var(--muted)] transition hover:border-[var(--brand)] hover:text-[var(--brand)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(6,8,10,0.8)]"
            onClick={() => setExpanded((value) => !value)}
          >
            <span className="inline-flex items-center gap-1">
              {expanded ? t("message.collapse") : t("message.expand")}
              {expanded ? <ChevronUp aria-hidden className="h-3 w-3" /> : <ChevronDown aria-hidden className="h-3 w-3" />}
            </span>
          </button>
        ) : null}
      </div>
    </article>
  );
}
