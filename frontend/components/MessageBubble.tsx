import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function MessageBubble({
  role,
  content,
  pending = false,
}: {
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mr-2 mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foreground/10 text-xs font-semibold">
          AI
        </div>
      )}
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "rounded-br-md whitespace-pre-wrap bg-foreground text-background"
            : "prose prose-sm prose-invert rounded-bl-md border border-foreground/10 bg-foreground/[0.04] text-foreground"
        }`}
      >
        {!content && pending ? (
          <TypingDots />
        ) : isUser ? (
          content
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: (props) => <p className="my-1 first:mt-0 last:mb-0" {...props} />,
              ul: (props) => <ul className="my-1 list-disc pl-5" {...props} />,
              ol: (props) => <ol className="my-1 list-decimal pl-5" {...props} />,
              li: (props) => <li className="my-0.5" {...props} />,
              strong: (props) => <strong className="font-semibold" {...props} />,
              code: (props) => (
                <code
                  className="rounded bg-foreground/10 px-1 py-0.5 text-[0.85em]"
                  {...props}
                />
              ),
              pre: (props) => (
                <pre
                  className="my-2 overflow-x-auto rounded-md bg-foreground/10 p-2 text-[0.85em]"
                  {...props}
                />
              ),
              a: (props) => (
                <a
                  className="underline decoration-foreground/40 underline-offset-2 hover:decoration-foreground"
                  target="_blank"
                  rel="noopener noreferrer"
                  {...props}
                />
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/50 [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/50 [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/50" />
    </span>
  );
}
