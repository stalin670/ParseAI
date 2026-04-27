"use client";
import { useEffect, useRef, useState } from "react";

export default function UndoToast({
  message,
  durationMs = 5000,
  onUndo,
  onExpire,
}: {
  message: string;
  durationMs?: number;
  onUndo: () => void;
  onExpire: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const [remaining, setRemaining] = useState(durationMs);
  const startRef = useRef<number>(0);
  const carryRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (paused) {
      // Stash how much we've burned so far, stop the loop.
      carryRef.current += performance.now() - startRef.current;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      return;
    }
    startRef.current = performance.now();
    const tick = () => {
      const elapsed = carryRef.current + (performance.now() - startRef.current);
      const left = Math.max(0, durationMs - elapsed);
      setRemaining(left);
      if (left <= 0) {
        if (!expiredRef.current) {
          expiredRef.current = true;
          onExpire();
        }
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [paused, durationMs, onExpire]);

  const pct = Math.max(0, Math.min(100, (remaining / durationMs) * 100));

  return (
    <div
      role="status"
      aria-live="polite"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="pointer-events-auto fixed bottom-4 left-1/2 z-40 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-foreground/10 bg-background/95 shadow-2xl backdrop-blur-sm"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex-1 truncate text-sm" title={message}>
          {message}
        </span>
        <button
          onClick={onUndo}
          className="rounded-md px-2.5 py-1 text-sm font-medium text-foreground/80 transition hover:bg-foreground/10 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
        >
          Undo
        </button>
      </div>
      <div
        aria-hidden
        className="h-0.5 bg-foreground/60 transition-[width] duration-100 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
