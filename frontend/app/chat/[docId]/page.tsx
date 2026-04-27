"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import ChatWindow from "@/components/ChatWindow";
import { streamChat } from "@/lib/streamChat";
import type { Source } from "@/lib/types";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatPage() {
  const { docId } = useParams<{ docId: string }>();
  const { getToken } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [streaming, setStreaming] = useState(false);

  const handleSend = async (text: string) => {
    setMessages((m) => [
      ...m,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    setSources([]);
    setStreaming(true);
    const token = await getToken();
    await streamChat({
      docId,
      question: text,
      token,
      onToken: (t) =>
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            ...copy[copy.length - 1],
            content: copy[copy.length - 1].content + t,
          };
          return copy;
        }),
      onSources: setSources,
      onDone: () => setStreaming(false),
      onError: (e) => {
        setStreaming(false);
        setMessages((m) => [...m, { role: "assistant", content: `Error: ${e.message}` }]);
      },
    });
  };

  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 p-8">
      <h1 className="text-xl font-semibold">Chat</h1>
      <ChatWindow
        messages={messages}
        sources={sources}
        streaming={streaming}
        onSend={handleSend}
      />
    </main>
  );
}
