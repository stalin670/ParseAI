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
        className={`max-w-[78%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "rounded-br-md bg-foreground text-background"
            : "rounded-bl-md border border-foreground/10 bg-foreground/[0.04] text-foreground"
        }`}
      >
        {content || (pending ? <TypingDots /> : "")}
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
