import type { Source } from "@/lib/types";

export async function streamChat(opts: {
  docId: string;
  question: string;
  token: string | null;
  onToken: (t: string) => void;
  onSources: (s: Source[]) => void;
  onDone: () => void;
  onError: (e: Error) => void;
}) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  const res = await fetch(`${base}/chat/${opts.docId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: JSON.stringify({ question: opts.question }),
  });
  if (!res.ok || !res.body) {
    opts.onError(new Error(`HTTP ${res.status}`));
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const events = buf.split("\n\n");
    buf = events.pop() ?? "";
    for (const ev of events) {
      const lines = ev.split("\n");
      let event = "message";
      let data = "";
      for (const ln of lines) {
        if (ln.startsWith("event: ")) event = ln.slice(7).trim();
        else if (ln.startsWith("data: ")) data += ln.slice(6);
      }
      if (event === "token") opts.onToken(data);
      else if (event === "sources") opts.onSources(JSON.parse(data));
      else if (event === "done") opts.onDone();
    }
  }
}
