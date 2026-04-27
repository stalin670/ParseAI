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
      Accept: "text/event-stream",
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
  let event = "message";
  let dataLines: string[] = [];

  const dispatch = () => {
    if (dataLines.length === 0 && event === "message") return;
    const data = dataLines.join("\n");
    if (event === "token") opts.onToken(data);
    else if (event === "sources") {
      try {
        opts.onSources(JSON.parse(data));
      } catch {
        // ignore malformed source frame
      }
    } else if (event === "error") opts.onError(new Error(data || "stream error"));
    else if (event === "done") opts.onDone();
    event = "message";
    dataLines = [];
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });

      // Normalise to LF-only line endings, then process one line at a time.
      let nl = -1;
      while ((nl = buf.search(/\r\n|\r|\n/)) !== -1) {
        const line = buf.slice(0, nl);
        const sepLen = buf[nl] === "\r" && buf[nl + 1] === "\n" ? 2 : 1;
        buf = buf.slice(nl + sepLen);

        if (line === "") {
          dispatch();
          continue;
        }
        if (line.startsWith(":")) continue; // SSE comment / keepalive
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value =
          colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");

        if (field === "event") event = value || "message";
        else if (field === "data") dataLines.push(value);
      }
    }
    // flush trailing event without terminating blank line
    dispatch();
  } catch (e) {
    opts.onError(e as Error);
  }
}
