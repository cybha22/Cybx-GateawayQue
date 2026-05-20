"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage as ChatMessageType } from "@/stores/chat";
import { cn } from "@/lib/utils";
import { Copy, Check, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/utils";
import type { ToolStatus } from "@/components/chat/ChatArea";

interface Props {
  message: ChatMessageType;
  isStreaming?: boolean;
  toolStatuses?: ToolStatus[];
}


function CodeBlockHeader({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-muted/80 border-b border-border rounded-t-lg">
      <span className="text-[11px] font-mono text-muted-foreground">
        {language || "code"}
      </span>
      <button
        onClick={handleCopy}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        {copied ? (
          <>
            <Check className="size-3 text-green-500" />
            <span className="text-green-500">Copied!</span>
          </>
        ) : (
          <>
            <Copy className="size-3" />
            <span>Copy</span>
          </>
        )}
      </button>
    </div>
  );
}


const highlightCache = new Map<string, string>();

const cybxaiDarkTheme = {
  name: "cybxai-dark",
  type: "dark" as const,
  colors: {
    "editor.background": "#1a1625",
    "editor.foreground": "#e0def4",
  },
  tokenColors: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#6e6a86", fontStyle: "italic" } },

    { scope: ["keyword", "keyword.control", "storage.type", "storage.modifier", "keyword.other.unit"], settings: { foreground: "#c4a7e7" } },
    { scope: ["keyword.control.import", "keyword.control.export", "keyword.control.from"], settings: { foreground: "#c4a7e7" } },

    { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: "#7dd3c0" } },
    { scope: ["entity.name.method", "support.method"], settings: { foreground: "#7dd3c0" } },

    { scope: ["string", "string.quoted", "string.template"], settings: { foreground: "#f6c177" } },
    { scope: ["string.regexp"], settings: { foreground: "#e8a86e" } },

    { scope: ["constant.numeric", "constant.language.boolean"], settings: { foreground: "#a6e3a1" } },
    { scope: ["constant.language.null", "constant.language.undefined"], settings: { foreground: "#f38ba8" } },

    { scope: ["entity.name.type", "support.type", "support.class", "entity.name.class"], settings: { foreground: "#f0abcf" } },
    { scope: ["entity.other.inherited-class"], settings: { foreground: "#f0abcf", fontStyle: "italic" } },

    { scope: ["entity.name.type.interface", "entity.name.type.alias", "entity.name.type.enum"], settings: { foreground: "#e8b4d8" } },

    { scope: ["variable", "variable.other.readwrite"], settings: { foreground: "#e0def4" } },

    { scope: ["variable.parameter", "variable.other.jsdoc"], settings: { foreground: "#b4befe" } },

    { scope: ["variable.other.constant", "constant.other", "variable.other.enummember"], settings: { foreground: "#fab387" } },

    { scope: ["meta.object-literal.key", "support.type.property-name", "entity.name.tag.yaml"], settings: { foreground: "#89b4fa" } },
    { scope: ["variable.other.property", "variable.other.object.property"], settings: { foreground: "#b4c8f0" } },

    { scope: ["entity.name.tag", "punctuation.definition.tag"], settings: { foreground: "#f38ba8" } },
    { scope: ["entity.other.attribute-name"], settings: { foreground: "#fab387" } },

    { scope: ["support.type.property-name.css", "meta.property-name.css"], settings: { foreground: "#89b4fa" } },
    { scope: ["support.constant.property-value.css", "constant.other.color"], settings: { foreground: "#a6e3a1" } },
    { scope: ["entity.other.attribute-name.class.css", "entity.other.attribute-name.id.css"], settings: { foreground: "#f6c177" } },

    { scope: ["keyword.operator", "keyword.operator.assignment"], settings: { foreground: "#94e2d5" } },
    { scope: ["keyword.operator.logical", "keyword.operator.comparison"], settings: { foreground: "#c4a7e7" } },
    { scope: ["punctuation", "meta.brace", "punctuation.separator", "punctuation.terminator"], settings: { foreground: "#7f7a93" } },
    { scope: ["punctuation.definition.string"], settings: { foreground: "#f6c177" } },

    { scope: ["punctuation.definition.template-expression", "string.template punctuation"], settings: { foreground: "#c4a7e7" } },
    { scope: ["meta.template.expression"], settings: { foreground: "#e0def4" } },

    { scope: ["meta.decorator", "punctuation.decorator"], settings: { foreground: "#f9e2af" } },

    { scope: ["support.module", "entity.name.import", "entity.name.package"], settings: { foreground: "#89b4fa" } },

    { scope: ["support.type.property-name.json"], settings: { foreground: "#89b4fa" } },

    { scope: ["markup.heading"], settings: { foreground: "#c4a7e7", fontStyle: "bold" } },
    { scope: ["markup.bold"], settings: { foreground: "#fab387", fontStyle: "bold" } },
    { scope: ["markup.italic"], settings: { foreground: "#f0abcf", fontStyle: "italic" } },
    { scope: ["markup.inline.raw", "markup.fenced_code"], settings: { foreground: "#a6e3a1" } },
    { scope: ["markup.link", "string.other.link"], settings: { foreground: "#89b4fa" } },
    { scope: ["markup.list.numbered", "markup.list.unnumbered"], settings: { foreground: "#fab387" } },

    { scope: ["variable.other.normal.shell", "punctuation.definition.variable.shell"], settings: { foreground: "#b4befe" } },

    { scope: ["support.type.python", "meta.function.decorator.python"], settings: { foreground: "#f9e2af" } },
    { scope: ["variable.parameter.function.language.special.self"], settings: { foreground: "#f38ba8", fontStyle: "italic" } },
  ],
};

const cybxaiLightTheme = {
  name: "cybxai-light",
  type: "light" as const,
  colors: {
    "editor.background": "#faf9fb",
    "editor.foreground": "#393552",
  },
  tokenColors: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#9ca3af", fontStyle: "italic" } },

    { scope: ["keyword", "keyword.control", "storage.type", "storage.modifier", "keyword.other.unit"], settings: { foreground: "#7c3aed" } },
    { scope: ["keyword.control.import", "keyword.control.export", "keyword.control.from"], settings: { foreground: "#7c3aed" } },

    { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: "#0d9488" } },
    { scope: ["entity.name.method", "support.method"], settings: { foreground: "#0d9488" } },

    { scope: ["string", "string.quoted", "string.template"], settings: { foreground: "#b45309" } },
    { scope: ["string.regexp"], settings: { foreground: "#c2410c" } },

    { scope: ["constant.numeric", "constant.language.boolean"], settings: { foreground: "#047857" } },
    { scope: ["constant.language.null", "constant.language.undefined"], settings: { foreground: "#be123c" } },

    { scope: ["entity.name.type", "support.type", "support.class", "entity.name.class"], settings: { foreground: "#be185d" } },
    { scope: ["entity.other.inherited-class"], settings: { foreground: "#be185d", fontStyle: "italic" } },

    { scope: ["entity.name.type.interface", "entity.name.type.alias", "entity.name.type.enum"], settings: { foreground: "#9d174d" } },

    { scope: ["variable", "variable.other.readwrite"], settings: { foreground: "#393552" } },

    { scope: ["variable.parameter", "variable.other.jsdoc"], settings: { foreground: "#4338ca" } },

    { scope: ["variable.other.constant", "constant.other", "variable.other.enummember"], settings: { foreground: "#c2410c" } },

    { scope: ["meta.object-literal.key", "support.type.property-name", "entity.name.tag.yaml"], settings: { foreground: "#1d4ed8" } },
    { scope: ["variable.other.property", "variable.other.object.property"], settings: { foreground: "#3b5998" } },

    { scope: ["entity.name.tag", "punctuation.definition.tag"], settings: { foreground: "#be123c" } },
    { scope: ["entity.other.attribute-name"], settings: { foreground: "#c2410c" } },

    { scope: ["support.type.property-name.css", "meta.property-name.css"], settings: { foreground: "#1d4ed8" } },
    { scope: ["support.constant.property-value.css", "constant.other.color"], settings: { foreground: "#047857" } },
    { scope: ["entity.other.attribute-name.class.css", "entity.other.attribute-name.id.css"], settings: { foreground: "#b45309" } },

    { scope: ["keyword.operator", "keyword.operator.assignment"], settings: { foreground: "#0d9488" } },
    { scope: ["keyword.operator.logical", "keyword.operator.comparison"], settings: { foreground: "#7c3aed" } },
    { scope: ["punctuation", "meta.brace", "punctuation.separator", "punctuation.terminator"], settings: { foreground: "#6b7280" } },
    { scope: ["punctuation.definition.string"], settings: { foreground: "#b45309" } },

    { scope: ["punctuation.definition.template-expression", "string.template punctuation"], settings: { foreground: "#7c3aed" } },
    { scope: ["meta.template.expression"], settings: { foreground: "#393552" } },

    { scope: ["meta.decorator", "punctuation.decorator"], settings: { foreground: "#92400e" } },

    { scope: ["support.module", "entity.name.import", "entity.name.package"], settings: { foreground: "#1d4ed8" } },

    { scope: ["support.type.property-name.json"], settings: { foreground: "#1d4ed8" } },

    { scope: ["markup.heading"], settings: { foreground: "#7c3aed", fontStyle: "bold" } },
    { scope: ["markup.bold"], settings: { foreground: "#c2410c", fontStyle: "bold" } },
    { scope: ["markup.italic"], settings: { foreground: "#be185d", fontStyle: "italic" } },
    { scope: ["markup.inline.raw", "markup.fenced_code"], settings: { foreground: "#047857" } },
    { scope: ["markup.link", "string.other.link"], settings: { foreground: "#1d4ed8" } },
    { scope: ["markup.list.numbered", "markup.list.unnumbered"], settings: { foreground: "#c2410c" } },

    { scope: ["variable.other.normal.shell", "punctuation.definition.variable.shell"], settings: { foreground: "#4338ca" } },

    { scope: ["support.type.python", "meta.function.decorator.python"], settings: { foreground: "#92400e" } },
    { scope: ["variable.parameter.function.language.special.self"], settings: { foreground: "#be123c", fontStyle: "italic" } },
  ],
};

async function highlightCode(code: string, language: string): Promise<string | null> {
  const cacheKey = `${language}:${code}`;
  const cached = highlightCache.get(cacheKey);
  if (cached) return cached;

  try {
    const { codeToHtml } = await import("shiki");
    const result = await codeToHtml(code, {
      lang: language || "text",
      themes: { light: cybxaiLightTheme, dark: cybxaiDarkTheme },
      defaultColor: false,
    });
    highlightCache.set(cacheKey, result);
    return result;
  } catch {
    try {
      const { codeToHtml } = await import("shiki");
      const result = await codeToHtml(code, {
        lang: "text",
        themes: { light: cybxaiLightTheme, dark: cybxaiDarkTheme },
        defaultColor: false,
      });
      highlightCache.set(cacheKey, result);
      return result;
    } catch {
      return null;
    }
  }
}

/** Static code block — highlights once */
function HighlightedCode({ code, language }: { code: string; language: string }) {
  const [html, setHtml] = useState<string | null>(() => highlightCache.get(`${language}:${code}`) ?? null);

  useEffect(() => {
    if (html) return; // Already have it
    let cancelled = false;
    highlightCode(code, language).then((result) => {
      if (!cancelled && result) setHtml(result);
    });
    return () => { cancelled = true; };
  }, [code, language, html]);

  if (html) {
    return (
      <div
        className="shiki-wrapper overflow-x-auto p-3 text-[13px] leading-relaxed [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:!font-mono"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed">
      <code className={cn("font-mono", language && `language-${language}`)}>
        {code}
      </code>
    </pre>
  );
}

/** Streaming code block — re-highlights throttled as content grows */
function StreamingHighlightedCode({ code, language }: { code: string; language: string }) {
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [highlightedCode, setHighlightedCode] = useState("");
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightingRef = useRef(false);

  const doHighlight = useCallback(async (text: string) => {
    if (highlightingRef.current) {
      pendingRef.current = text;
      return;
    }
    highlightingRef.current = true;
    const result = await highlightCode(text, language);
    highlightingRef.current = false;

    if (result) {
      setHighlightedHtml(result);
      setHighlightedCode(text);
    }

    // Process queued highlight
    if (pendingRef.current && pendingRef.current !== text) {
      const next = pendingRef.current;
      pendingRef.current = null;
      doHighlight(next);
    }
  }, [language]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    // Throttle: highlight every 150ms
    timerRef.current = setTimeout(() => {
      doHighlight(code);
    }, code.length < 50 ? 0 : 150); // Immediate for first few chars

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [code, doHighlight]);

  // Build combined HTML: highlighted portion + raw tail + cursor
  if (highlightedHtml) {
    // Get the un-highlighted tail (chars added since last highlight)
    const tail = code.length > highlightedCode.length ? code.slice(highlightedCode.length) : "";
    // Inject tail text + cursor before closing </code></pre>
    const cursorHtml = `<span class="streaming-cursor"></span>`;
    const tailHtml = tail ? escapeHtml(tail) + cursorHtml : cursorHtml;
    // Insert before </code></pre> (shiki output ends with </code></pre>)
    const combined = highlightedHtml.replace(/<\/code><\/pre>\s*$/, tailHtml + "</code></pre>");

    return (
      <div
        className="shiki-wrapper overflow-x-auto p-3 text-[13px] leading-relaxed [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:!font-mono"
        dangerouslySetInnerHTML={{ __html: combined }}
      />
    );
  }

  // Fallback while first highlight loads
  return (
    <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed">
      <code className={cn("font-mono", language && `language-${language}`)}>
        {code}
        <span className="streaming-cursor" />
      </code>
    </pre>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------------ */
/*  Streaming content parser                                           */
/*  Splits into: code blocks (custom render) + markdown text           */
/* ------------------------------------------------------------------ */

interface MdPart { type: "md"; content: string }
interface CodePart { type: "code"; language: string; content: string; closed: boolean }
type Part = MdPart | CodePart;

function parseIntoParts(raw: string): Part[] {
  const parts: Part[] = [];
  let cursor = 0;

  while (cursor < raw.length) {
    const fenceStart = raw.indexOf("```", cursor);

    if (fenceStart === -1) {
      const text = raw.slice(cursor);
      if (text) parts.push({ type: "md", content: text });
      break;
    }

    if (fenceStart > cursor) {
      parts.push({ type: "md", content: raw.slice(cursor, fenceStart) });
    }

    const afterFence = fenceStart + 3;
    const lineEnd = raw.indexOf("\n", afterFence);
    let language = "";
    let codeStart: number;

    if (lineEnd === -1) {
      language = raw.slice(afterFence).trim();
      parts.push({ type: "code", language, content: "", closed: false });
      break;
    } else {
      language = raw.slice(afterFence, lineEnd).trim();
      codeStart = lineEnd + 1;
    }

    const closingFence = raw.indexOf("\n```", codeStart);
    if (closingFence === -1) {
      parts.push({ type: "code", language, content: raw.slice(codeStart), closed: false });
      break;
    } else {
      parts.push({ type: "code", language, content: raw.slice(codeStart, closingFence), closed: true });
      cursor = closingFence + 4;
      if (cursor < raw.length && raw[cursor] === "\n") cursor++;
    }
  }

  return parts;
}


const mdComponents = {
  pre({ children }: { children?: React.ReactNode }) {
    const codeChild = Array.isArray(children) ? children[0] : children;
    let language = "";
    let codeText = "";

    if (codeChild && typeof codeChild === "object" && "props" in codeChild) {
      const codeProps = codeChild.props as { className?: string; children?: React.ReactNode };
      const match = codeProps.className?.match(/language-(\w+)/);
      language = match ? match[1] : "";
      codeText = typeof codeProps.children === "string" ? codeProps.children : String(codeProps.children ?? "");
    }

    return (
      <div className="chat-code-block rounded-lg border border-border overflow-hidden my-3 not-prose">
        <CodeBlockHeader language={language} code={codeText.trimEnd()} />
        <HighlightedCode code={codeText} language={language} />
      </div>
    );
  },
  code({ className, children, ...props }: { className?: string; children?: React.ReactNode }) {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 text-[13px] font-mono" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={cn("text-[13px] font-mono", className)} {...props}>
        {children}
      </code>
    );
  },
  a({ children, ...props }: { children?: React.ReactNode }) {
    return (
      <a className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props}>
        {children}
      </a>
    );
  },
  table({ children, ...props }: { children?: React.ReactNode }) {
    return (
      <div className="overflow-x-auto my-3">
        <table className="border-collapse border border-border text-sm" {...props}>
          {children}
        </table>
      </div>
    );
  },
  th({ children, ...props }: { children?: React.ReactNode }) {
    return (
      <th className="border border-border px-3 py-1.5 bg-muted/50 text-left font-medium text-sm" {...props}>
        {children}
      </th>
    );
  },
  td({ children, ...props }: { children?: React.ReactNode }) {
    return (
      <td className="border border-border px-3 py-1.5 text-sm" {...props}>
        {children}
      </td>
    );
  },
};

function StreamingContent({ content }: { content: string }) {
  const parts = useMemo(() => parseIntoParts(content), [content]);
  const lastPart = parts[parts.length - 1];
  const cursorInCode = lastPart?.type === "code" && !lastPart.closed;

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "code") {
          return (
            <div key={`code-${i}`} className="chat-code-block rounded-lg border border-border overflow-hidden my-3 not-prose">
              <CodeBlockHeader language={part.language} code={part.content.trimEnd()} />
              {part.closed ? (
                <HighlightedCode code={part.content} language={part.language} />
              ) : (
                <StreamingHighlightedCode code={part.content} language={part.language} />
              )}
            </div>
          );
        }

        // Markdown text — render through ReactMarkdown
        return (
          <ReactMarkdown key={`md-${i}`} remarkPlugins={[remarkGfm]} components={mdComponents}>
            {part.content}
          </ReactMarkdown>
        );
      })}

      {/* Cursor at the end (only if not inside an open code block) */}
      {!cursorInCode && (
        <span className="streaming-cursor" />
      )}

      {parts.length === 0 && (
        <span className="streaming-cursor" />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main ChatMessage component                                         */
/* ------------------------------------------------------------------ */

export function ChatMessage({ message, isStreaming, toolStatuses }: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const handleCopy = async () => {
    await copyText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "group flex gap-3",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {/* Message bubble */}
      <div
        className={cn(
          "relative max-w-[90%] px-4 py-3 text-[15px] leading-relaxed",
          isUser
            ? "chat-message-user"
            : "chat-message-assistant"
        )}
      >
        {isUser ? (
          <div>
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {message.attachments.map((att, i) => (
                  <img
                    key={i}
                    src={att.url}
                    alt={att.name}
                    className="max-w-[200px] max-h-[200px] rounded-lg object-cover border border-border/50"
                  />
                ))}
              </div>
            )}
            {message.content && (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            )}
          </div>
        ) : (
          <div className="prose prose-base dark:prose-invert max-w-none break-words prose-p:my-2.5 prose-pre:my-3 prose-ul:my-2.5 prose-ol:my-2.5 prose-headings:my-3 prose-li:my-1">
            {/* Tool status indicators */}
            {toolStatuses && toolStatuses.length > 0 && (
              <div className="not-prose mb-3 space-y-1.5">
                {toolStatuses.map((ts, i) => (
                  <div
                    key={`${ts.tool}-${ts.query}-${i}`}
                    className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-2.5 py-1.5"
                  >
                    {ts.status === "executing" ? (
                      <Loader2 className="size-3 animate-spin text-blue-500" />
                    ) : (
                      <Globe className="size-3 text-green-500" />
                    )}
                    <span className="font-medium">
                      {ts.status === "executing" ? "Searching" : "Searched"}:
                    </span>
                    <span className="italic truncate max-w-[300px]">{ts.query}</span>
                  </div>
                ))}
              </div>
            )}
            {isStreaming ? (
              <StreamingContent content={message.content} />
            ) : message.content ? (
              <MarkdownContent content={message.content} />
            ) : null}
          </div>
        )}

        {/* Copy button for assistant messages */}
        {isAssistant && message.content && (
          <div className="absolute -bottom-6 left-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={handleCopy}
              title="Copy message"
            >
              {copied ? (
                <Check className="size-3 text-green-500" />
              ) : (
                <Copy className="size-3" />
              )}
            </Button>
          </div>
        )}
      </div>

    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Markdown renderer (only used after streaming completes)            */
/* ------------------------------------------------------------------ */

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        pre({ children }) {
          const codeChild = Array.isArray(children) ? children[0] : children;
          let language = "";
          let codeText = "";

          if (codeChild && typeof codeChild === "object" && "props" in codeChild) {
            const codeProps = codeChild.props as { className?: string; children?: React.ReactNode };
            const match = codeProps.className?.match(/language-(\w+)/);
            language = match ? match[1] : "";
            codeText = typeof codeProps.children === "string" ? codeProps.children : String(codeProps.children ?? "");
          }

          return (
            <div className="chat-code-block rounded-lg border border-border overflow-hidden my-3 not-prose">
              <CodeBlockHeader language={language} code={codeText.trimEnd()} />
              <HighlightedCode code={codeText} language={language} />
            </div>
          );
        },
        code({ className, children, ...props }) {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="rounded bg-muted px-1.5 py-0.5 text-[13px] font-mono" {...props}>
                {children}
              </code>
            );
          }
          return (
            <code className={cn("text-[13px] font-mono", className)} {...props}>
              {children}
            </code>
          );
        },
        a({ children, ...props }) {
          return (
            <a className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props}>
              {children}
            </a>
          );
        },
        table({ children, ...props }) {
          return (
            <div className="overflow-x-auto my-3">
              <table className="border-collapse border border-border text-sm" {...props}>
                {children}
              </table>
            </div>
          );
        },
        th({ children, ...props }) {
          return (
            <th className="border border-border px-3 py-1.5 bg-muted/50 text-left font-medium text-sm" {...props}>
              {children}
            </th>
          );
        },
        td({ children, ...props }) {
          return (
            <td className="border border-border px-3 py-1.5 text-sm" {...props}>
              {children}
            </td>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
