"use client";
import Link from "next/link";
import type { Document } from "@/lib/types";

export default function DocList({
  docs,
  onDelete,
}: {
  docs: Document[];
  onDelete: (id: string) => void;
}) {
  if (docs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-foreground/15 px-4 py-10 text-center text-sm text-foreground/55">
        No documents yet. Upload one to start.
      </div>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {docs.map((d) => (
        <li
          key={d.id}
          className="group flex items-start justify-between gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4 transition-colors hover:bg-foreground/[0.05]"
        >
          <Link href={`/chat/${d.id}`} className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <PdfIcon />
              <span className="truncate font-medium" title={d.filename}>
                {d.filename}
              </span>
            </div>
            <p className="mt-1 text-xs text-foreground/55">
              {d.page_count} pages · {d.chunk_count} chunks ·{" "}
              {new Date(d.created_at).toLocaleDateString()}
            </p>
          </Link>
          <button
            onClick={() => onDelete(d.id)}
            className="rounded-md p-1.5 text-foreground/40 opacity-0 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
            aria-label="Delete"
            title="Delete"
          >
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
          </button>
        </li>
      ))}
    </ul>
  );
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
