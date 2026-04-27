"use client";
import Link from "next/link";
import type { Document } from "@/lib/types";
import { Button } from "@/components/ui/button";

export default function DocList({
  docs,
  onDelete,
}: {
  docs: Document[];
  onDelete: (id: string) => void;
}) {
  if (docs.length === 0) {
    return <p className="text-foreground/60">No documents yet. Upload one to start.</p>;
  }
  return (
    <ul className="divide-y divide-foreground/10 rounded-md border border-foreground/15">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-3 p-3">
          <div className="flex flex-col">
            <Link href={`/chat/${d.id}`} className="font-medium hover:underline">
              {d.filename}
            </Link>
            <span className="text-xs text-foreground/60">
              {d.page_count} pages · {d.chunk_count} chunks
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onDelete(d.id)}>
            Delete
          </Button>
        </li>
      ))}
    </ul>
  );
}
