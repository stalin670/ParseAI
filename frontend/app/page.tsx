import Link from "next/link";
import { Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-4xl font-semibold">ParseWithAI</h1>
      <p className="max-w-xl text-center text-foreground/70">
        Upload a PDF, ask questions, get answers grounded in the document with page
        citations.
      </p>
      <div className="flex gap-3">
        <Show when="signed-out">
          <Button asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-up">Sign up</Link>
          </Button>
        </Show>
        <Show when="signed-in">
          <Button asChild>
            <Link href="/dashboard">Open dashboard</Link>
          </Button>
        </Show>
      </div>
    </main>
  );
}
