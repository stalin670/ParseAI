"use client";
import Link from "next/link";
import { useState } from "react";
import type { Document } from "@/lib/types";
import ConfirmDialog from "@/components/ConfirmDialog";

export default function DocList({
  docs,
  onDelete,
  deletingId,
}: {
  docs: Document[];
  onDelete: (id: string) => void;
  deletingId?: string | null;
}) {
  const [pending, setPending] = useState<Document | null>(null);

  if (docs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-foreground/15 px-4 py-10 text-center text-sm text-foreground/55">
        No documents yet. Upload one to start.
      </div>
    );
  }

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2">
        {docs.map((d) => {
          const removing = deletingId === d.id;
          return (
            <li
              key={d.id}
              className={`group flex items-start justify-between gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4 transition-all duration-200 hover:bg-foreground/[0.05] ${
                removing
                  ? "pointer-events-none -translate-y-1 scale-[0.98] opacity-0"
                  : "translate-y-0 scale-100 opacity-100"
              }`}
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
                onClick={() => setPending(d)}
                disabled={removing}
                className="rounded-md p-1.5 text-foreground/40 opacity-0 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100 focus:opacity-100 disabled:opacity-50"
                aria-label="Delete"
                title="Delete"
              >
                {removing ? (
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <TrashIcon />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={pending !== null}
        title="Delete this document?"
        description={
          pending
            ? `“${pending.filename}” and its chat history will be permanently removed. This can't be undone.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        busy={pending !== null && deletingId === pending.id}
        onClose={() => setPending(null)}
        onConfirm={() => {
          if (pending) {
            onDelete(pending.id);
            setPending(null);
          }
        }}
      />
    </>
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
