import { useCallback, useMemo, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import type { Components } from "react-markdown";
import "highlight.js/styles/github-dark.css";

type MarkdownTone = "assistant" | "user";

type MarkdownElementProps<Tag extends keyof JSX.IntrinsicElements> = Omit<
  ComponentPropsWithoutRef<Tag>,
  "ref"
> & { node?: unknown };

const extractText = (node: ReactNode): string => {
  if (node == null) {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join("");
  }
  if (typeof node === "object" && "props" in node) {
    return extractText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
};

interface PreBlockProps extends MarkdownElementProps<"pre"> {
  tone: MarkdownTone;
}

type CodeRendererProps = MarkdownElementProps<"code"> & { inline?: boolean };

const PreBlock = ({ children, className, tone, node, ...props }: PreBlockProps) => {
  void node;
  const [copied, setCopied] = useState(false);
  const codeText = useMemo(() => extractText(children).trimEnd(), [children]);

  const languageMatch = typeof className === "string" ? className.match(/language-([\w-]+)/) : null;
  const languageLabel = languageMatch?.[1] ?? "plaintext";

  const handleCopy = useCallback(async () => {
    if (!codeText || !navigator?.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }, [codeText]);

  return (
    <div className="group relative mt-1 overflow-hidden rounded-2xl border border-border/60 bg-surface/80">
      <div className="flex items-center justify-between border-b border-border/60 bg-background-card/80 px-4 py-2 text-[0.7rem] uppercase tracking-[0.32em] text-text-muted">
        <span className="font-semibold">{languageLabel}</span>
        <button
          type="button"
          onClick={handleCopy}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.68rem] font-semibold transition-colors ${
            tone === "user"
              ? "border-white/30 bg-white/10 text-white/80 hover:border-white/60 hover:text-white"
              : "border-border/70 bg-surface text-text-muted hover:border-primary hover:text-primary"
          }`}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
      <pre
        className={`max-h-[480px] overflow-x-auto px-4 py-4 text-[0.9rem] leading-7 ${className ?? ""}`}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
};

const InlineCode = ({ children, node, className = "", ...props }: MarkdownElementProps<"code">) => {
  void node;
  return (
    <code
      className={`rounded-md border border-border/60 bg-background-card/70 px-1.5 py-0.5 font-mono text-[0.85em] ${className}`.trim()}
      {...props}
    >
      {children}
    </code>
  );
};

const Paragraph = ({ children, node, className = "", ...props }: MarkdownElementProps<"p">) => {
  void node;
  return (
    <p className={`leading-7 text-current ${className}`.trim()} {...props}>
      {children}
    </p>
  );
};

const Strong = ({ children, node, className = "", ...props }: MarkdownElementProps<"strong">) => {
  void node;
  return (
    <strong className={`font-semibold text-current ${className}`.trim()} {...props}>
      {children}
    </strong>
  );
};

const Emphasis = ({ children, node, className = "", ...props }: MarkdownElementProps<"em">) => {
  void node;
  return (
    <em className={`italic text-current ${className}`.trim()} {...props}>
      {children}
    </em>
  );
};

const Blockquote = ({ children, node, className = "", ...props }: MarkdownElementProps<"blockquote">) => {
  void node;
  return (
    <blockquote
      className={`rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-[0.95rem] leading-7 text-primary/90 ${className}`.trim()}
      {...props}
    >
      {children}
    </blockquote>
  );
};

const UnorderedList = ({ children, node, className = "", ...props }: MarkdownElementProps<"ul">) => {
  void node;
  return (
    <ul className={`ml-5 list-disc space-y-2 text-current ${className}`.trim()} {...props}>
      {children}
    </ul>
  );
};

const OrderedList = ({ children, node, className = "", ...props }: MarkdownElementProps<"ol">) => {
  void node;
  return (
    <ol className={`ml-5 list-decimal space-y-2 text-current ${className}`.trim()} {...props}>
      {children}
    </ol>
  );
};

const ListItem = ({ children, node, className = "", ...props }: MarkdownElementProps<"li">) => {
  void node;
  return (
    <li className={`pl-1 text-current ${className}`.trim()} {...props}>
      {children}
    </li>
  );
};

const Divider = ({ node, className = "", ...props }: MarkdownElementProps<"hr">) => {
  void node;
  return <hr className={`border-border/60 ${className}`.trim()} {...props} />;
};

const Anchor = ({ children, node, className = "", ...props }: MarkdownElementProps<"a">) => {
  void node;
  return (
    <a
      className={`font-semibold text-primary underline decoration-dashed underline-offset-4 transition-colors hover:text-primary/80 ${className}`.trim()}
      target="_blank"
      rel="noreferrer"
      {...props}
    >
      {children}
    </a>
  );
};

const TableWrapper = ({ children, node, className = "", ...props }: MarkdownElementProps<"table">) => {
  void node;
  return (
    <div className={`overflow-hidden rounded-2xl border border-border/60 bg-surface/70 ${className}`.trim()}>
      <table className="w-full border-collapse text-sm text-inherit" {...props}>
        {children}
      </table>
    </div>
  );
};

const TableHeadCell = ({ children, node, className = "", ...props }: MarkdownElementProps<"th">) => {
  void node;
  return (
    <th
      className={`border-b border-border/60 bg-background-card/80 px-3 py-2 text-left font-semibold text-text ${className}`.trim()}
      {...props}
    >
      {children}
    </th>
  );
};

const TableCell = ({ children, node, className = "", ...props }: MarkdownElementProps<"td">) => {
  void node;
  return (
    <td className={`border-b border-border/40 px-3 py-2 text-text ${className}`.trim()} {...props}>
      {children}
    </td>
  );
};

const Heading = ({
  children,
  level,
}: {
  children?: ReactNode;
  level: 1 | 2 | 3 | 4 | 5 | 6;
}) => {
  const Tag = (`h${level}`) as keyof JSX.IntrinsicElements;
  const sizes: Record<number, string> = {
    1: "text-2xl",
    2: "text-xl",
    3: "text-lg",
    4: "text-base",
    5: "text-sm",
    6: "text-xs",
  };

  return (
    <Tag className={`font-semibold leading-tight text-current ${sizes[level]}`.trim()}>{children}</Tag>
  );
};

interface ChatMarkdownProps {
  content: string;
  tone: MarkdownTone;
}

const CodeRenderer = ({ inline = false, className, children, node, ...props }: CodeRendererProps) => {
  void node;
  if (inline) {
    return (
      <InlineCode className={className} {...props}>
        {children}
      </InlineCode>
    );
  }
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
};

const ChatMarkdown = ({ content, tone }: ChatMarkdownProps) => {
  const components = useMemo<Components>(() => ({
    p: Paragraph,
    strong: Strong,
    em: Emphasis,
    blockquote: Blockquote,
    ul: UnorderedList,
    ol: OrderedList,
    li: ListItem,
    hr: Divider,
    a: Anchor,
    table: TableWrapper,
    th: TableHeadCell,
    td: TableCell,
    pre: (preProps) => <PreBlock {...preProps} tone={tone} />,
    code: CodeRenderer,
    h1: ({ node, ...props }) => {
      void node;
      return <Heading level={1} {...props} />;
    },
    h2: ({ node, ...props }) => {
      void node;
      return <Heading level={2} {...props} />;
    },
    h3: ({ node, ...props }) => {
      void node;
      return <Heading level={3} {...props} />;
    },
    h4: ({ node, ...props }) => {
      void node;
      return <Heading level={4} {...props} />;
    },
    h5: ({ node, ...props }) => {
      void node;
      return <Heading level={5} {...props} />;
    },
    h6: ({ node, ...props }) => {
      void node;
      return <Heading level={6} {...props} />;
    },
  }), [tone]);

  const toneClass = tone === "assistant" ? "text-text" : "text-white";

  return (
    <ReactMarkdown
      className={`markdown-body flex flex-col gap-4 text-[0.95rem] leading-7 ${toneClass}`}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
};

export default ChatMarkdown;
