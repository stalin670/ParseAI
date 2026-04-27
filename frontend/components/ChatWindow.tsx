"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
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

  return (
    <div className="flex h-[70vh] flex-col gap-3 rounded-md border border-foreground/15 p-4">
      <div className="flex-1 space-y-2 overflow-y-auto">
        {messages.map((m, i) => (
          <MessageBubble key={i} role={m.role} content={m.content} />
        ))}
        <SourceCitation sources={sources} />
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onSend(text);
          setText("");
        }}
      >
        <Input
          placeholder="Ask a question..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={streaming}
        />
        <Button type="submit" disabled={streaming}>
          {streaming ? "..." : "Send"}
        </Button>
      </form>
    </div>
  );
}
