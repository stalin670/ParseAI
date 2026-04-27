"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import ChatWindow from "@/components/ChatWindow";
import { apiFetch } from "@/lib/api";
import { streamChat } from "@/lib/streamChat";
import type { Document, Source } from "@/lib/types";
import Link from "next/link";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatPage() {
  const { docId } = useParams<{ docId: string }>();
  const { getToken, isLoaded } = useAuth();
  const tokenGetter = async () => getToken();
  const router = useRouter();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [streaming, setStreaming] = useState(false);

  const docQ = useQuery({
    queryKey: ["doc", docId],
    queryFn: () => apiFetch<Document>(`/docs/${docId}`, { tokenGetter }),
    enabled: isLoaded,
  });

  const historyQ = useQuery<Msg[]>({
    queryKey: ["chats", docId],
    queryFn: () => apiFetch<Msg[]>(`/docs/${docId}/chats`, { tokenGetter }),
    enabled: isLoaded,
  });

  useEffect(() => {
    if (historyQ.data) setMessages(historyQ.data);
  }, [historyQ.data]);

  useEffect(() => {
    if (docQ.error) router.push("/dashboard");
  }, [docQ.error, router]);

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
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            content: `Error: ${e.message}`,
          };
          return copy;
        });
      },
    });
  };

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-4 pt-4 pb-6 min-h-0">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-xs text-foreground/55 hover:text-foreground"
        >
          ← All documents
        </Link>
        {docQ.data && (
          <span className="text-xs text-foreground/55">
            {docQ.data.page_count} pages · {docQ.data.chunk_count} chunks
          </span>
        )}
      </div>
      <h1 className="truncate text-xl font-semibold" title={docQ.data?.filename}>
        {docQ.data?.filename ?? "…"}
      </h1>
      <ChatWindow
        messages={messages}
        sources={sources}
        streaming={streaming}
        onSend={handleSend}
      />
    </main>
  );
}
