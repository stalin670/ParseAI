import Link from "next/link";
import { Show, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";

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
        <div className="flex items-center gap-3">
          <Show when="signed-in">
            <Link
              href="/dashboard"
              className="text-sm text-foreground/70 hover:text-foreground"
            >
              Dashboard
            </Link>
          </Show>
          <ThemeToggle />
          <Show when="signed-in">
            <UserButton afterSignOutUrl="/" />
          </Show>
          <Show when="signed-out">
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">Sign up</Link>
            </Button>
          </Show>
        </div>
      </div>
    </header>
  );
}
