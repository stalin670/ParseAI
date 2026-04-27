import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-foreground/10 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-background">
            P
          </span>
          ParseWithAI
        </Link>
        <Show when="signed-in">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-foreground/70 hover:text-foreground">
              Dashboard
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </Show>
        <Show when="signed-out">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">Sign up</Link>
            </Button>
          </div>
        </Show>
      </div>
    </header>
  );
}
