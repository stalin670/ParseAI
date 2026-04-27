"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { Document } from "@/lib/types";

export default function DocList({
  docs,
  onDelete,
}: {
  docs: Document[];
  onDelete: (doc: Document) => void;
}) {
  const [exiting, setExiting] = useState<Record<string, true>>({});

  // Derive the live exit set so a doc reappearing (e.g. mutation rollback)
  // immediately renders normally, even though `exiting` keeps the stale id.
  const liveExiting = useMemo(() => {
    const ids = new Set(docs.map((d) => d.id));
    const filtered: Record<string, true> = {};
    for (const id of Object.keys(exiting)) {
      if (ids.has(id)) filtered[id] = true;
    }
    return filtered;
  }, [docs, exiting]);

  if (docs.length === 0) {
    return <EmptyState />;
  }

  const beginExit = (id: string) => {
    setExiting((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
  };

  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {docs.map((d) => {
        const isExiting = !!liveExiting[d.id];
        return (
          <li
            key={d.id}
            className={`grid overflow-hidden transition-[grid-template-rows,opacity,transform,margin] duration-300 ease-out ${
              isExiting
                ? "pointer-events-none grid-rows-[0fr] -translate-y-1 scale-[0.98] opacity-0"
                : "grid-rows-[1fr] translate-y-0 scale-100 opacity-100"
            }`}
            onTransitionEnd={(e) => {
              if (
                isExiting &&
                e.propertyName === "grid-template-rows" &&
                e.target === e.currentTarget
              ) {
                onDelete(d);
              }
            }}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="group flex items-start justify-between gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4 transition-colors hover:bg-foreground/[0.05]">
                <Link href={`/chat/${d.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <PdfIcon />
                    <span className="truncate font-medium" title={d.filename}>
                      {d.filename}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-foreground/55">
                    {d.page_count} pages · {d.chunk_count} chunks ·{" "}
                    <time dateTime={d.created_at} title={new Date(d.created_at).toLocaleString()}>
                      {timeAgo(d.created_at)}
                    </time>
                  </p>
                </Link>
                <button
                  onClick={() => beginExit(d.id)}
                  className="rounded-md p-1.5 text-foreground/40 opacity-60 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
                  aria-label={`Delete ${d.filename}`}
                  title="Delete"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-foreground/15 px-4 py-12 text-center">
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-foreground/5 text-foreground/40">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M14 3v4a1 1 0 0 0 1 1h4" />
          <path d="M5 21V5a2 2 0 0 1 2-2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
        </svg>
      </div>
      <p className="text-sm font-medium">No documents yet</p>
      <p className="mt-1 text-xs text-foreground/55">
        Drop a PDF in the box above to get started.
      </p>
    </div>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return "";
  const sec = Math.max(1, Math.floor(diff / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.floor(day / 7)}w ago`;
  if (day < 365) return `${Math.floor(day / 30)}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

function PdfIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0 text-foreground/55"
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 21V5a2 2 0 0 1 2-2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
