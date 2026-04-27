import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-16 text-center">
      <span className="rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1 text-xs uppercase tracking-widest text-foreground/65">
        RAG · Gemini · Pinecone
      </span>
      <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
        Chat with your PDFs.
      </h1>
      <p className="max-w-xl text-base text-foreground/65 sm:text-lg">
        Upload a document, ask anything, and get answers grounded in the source
        with page-level citations.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Show when="signed-out">
          <Button asChild size="default">
            <Link href="/sign-up">Get started</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </Show>
        <Show when="signed-in">
          <Button asChild>
            <Link href="/dashboard">Open dashboard →</Link>
          </Button>
        </Show>
      </div>
      <FeatureRow />
    </main>
  );
}

function FeatureRow() {
  const features = [
    {
      title: "Per-user isolation",
      body: "Vectors are namespaced by user. Your docs stay yours.",
    },
    {
      title: "Free tier stack",
      body: "Gemini, Pinecone, Supabase, Upstash, Clerk. No bill.",
    },
    {
      title: "Streaming answers",
      body: "Tokens stream in, with page-number citations beneath each reply.",
    },
  ];
  return (
    <div className="mt-8 grid w-full gap-4 text-left sm:grid-cols-3">
      {features.map((f) => (
        <div
          key={f.title}
          className="rounded-xl border border-foreground/10 bg-foreground/[0.03] p-4"
        >
          <p className="text-sm font-medium">{f.title}</p>
          <p className="mt-1 text-xs text-foreground/60">{f.body}</p>
        </div>
      ))}
    </div>
  );
}
