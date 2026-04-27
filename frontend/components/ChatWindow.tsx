"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import MessageBubble from "@/components/MessageBubble";
import SourceCitation from "@/components/SourceCitation";
import type { Source } from "@/lib/types";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatWindow({
  messages,
  sources,
  streaming,
  onSend,
}: {
  messages: Msg[];
  sources: Source[];
  streaming: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streaming]);

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col gap-3 rounded-2xl border border-foreground/10 bg-foreground/[0.02]">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <p className="mt-10 text-center text-sm text-foreground/55">
            Ask a question about this document to start.
          </p>
        )}
        {messages.map((m, i) => {
          const last = i === messages.length - 1;
          return (
            <div key={i} className="space-y-1">
              <MessageBubble
                role={m.role}
                content={m.content}
                pending={last && m.role === "assistant" && streaming}
              />
              {last && m.role === "assistant" && !streaming && (
                <SourceCitation sources={sources} />
              )}
            </div>
          );
        })}
      </div>
      <form
        className="flex items-center gap-2 border-t border-foreground/10 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || streaming) return;
          onSend(text);
          setText("");
        }}
      >
        <input
          className="h-10 flex-1 rounded-md bg-transparent px-3 text-sm placeholder:text-foreground/40 focus:outline-none"
          placeholder="Ask a question…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={streaming}
        />
        <Button type="submit" size="sm" disabled={streaming || !text.trim()}>
          {streaming ? "…" : "Send"}
        </Button>
      </form>
    </div>
  );
}
