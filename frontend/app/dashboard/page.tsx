"use client";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Document, UploadResult } from "@/lib/types";
import DocList from "@/components/DocList";
import UndoToast from "@/components/UndoToast";
import UploadDropzone from "@/components/UploadDropzone";
import UploadProgress from "@/components/UploadProgress";

const UNDO_WINDOW_MS = 5000;

export default function DashboardPage() {
  const { getToken, isLoaded } = useAuth();
  const tokenGetter = async () => getToken();
  const qc = useQueryClient();
  const router = useRouter();

  const docsQ = useQuery({
    queryKey: ["docs"],
    queryFn: () => apiFetch<Document[]>("/docs", { tokenGetter }),
    enabled: isLoaded,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return apiFetch<UploadResult>("/docs", {
        method: "POST",
        body: fd,
        tokenGetter,
      });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["docs"] });
      router.push(`/chat/${r.doc_id}`);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/docs/${id}`, { method: "DELETE", tokenGetter }),
    onError: (_e, id) => {
      // Server delete failed — restore the row from the snapshot we kept locally.
      // The undo state already pinned the doc; just invalidate to resync.
      qc.invalidateQueries({ queryKey: ["docs"] });
      console.error(`Failed to delete document ${id}`);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["docs"] });
    },
  });

  const [undoDoc, setUndoDoc] = useState<Document | null>(null);
  const undoRef = useRef<Document | null>(null);
  useEffect(() => {
    undoRef.current = undoDoc;
  }, [undoDoc]);

  const handleDelete = useCallback(
    (doc: Document) => {
      // If a previous delete still has its undo window open, commit it now —
      // we only show one undo toast at a time.
      const prev = undoRef.current;
      if (prev && prev.id !== doc.id) del.mutate(prev.id);

      qc.cancelQueries({ queryKey: ["docs"] });
      qc.setQueryData<Document[]>(["docs"], (old) =>
        old ? old.filter((d) => d.id !== doc.id) : old,
      );
      setUndoDoc(doc);
    },
    [qc, del],
  );

  const undo = useCallback(() => {
    const doc = undoRef.current;
    if (!doc) return;
    qc.setQueryData<Document[]>(["docs"], (old) => {
      if (!old) return old;
      if (old.some((d) => d.id === doc.id)) return old;
      const next = [doc, ...old];
      next.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      return next;
    });
    setUndoDoc(null);
  }, [qc]);

  const expire = useCallback(() => {
    const doc = undoRef.current;
    if (!doc) return;
    setUndoDoc(null);
    del.mutate(doc.id);
  }, [del]);

  // useMutation returns a fresh object each render, so capture the latest
  // mutate via a ref — otherwise the unmount cleanup below would fire on
  // every render and commit the delete before the undo window elapses.
  const delMutateRef = useRef(del.mutate);
  useEffect(() => {
    delMutateRef.current = del.mutate;
  }, [del]);

  // Commit the pending delete if the user navigates away. Treat nav-away
  // as confirmation (matches Gmail/iOS undo-toast pattern).
  useEffect(() => {
    return () => {
      const doc = undoRef.current;
      if (doc) delMutateRef.current(doc.id);
    };
  }, []);

  const [search, setSearch] = useState("");

  // While the undo toast is open the doc is "soft-deleted" from the user's
  // perspective. Hide it even if a concurrent refetch (e.g. an upload's
  // invalidate) re-adds it to the cache — otherwise the row reappears
  // under the still-visible toast.
  const visibleDocs = useMemo(() => {
    const all = (docsQ.data ?? []).filter((d) => d.id !== undoDoc?.id);
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((d) => d.filename.toLowerCase().includes(q));
  }, [docsQ.data, search, undoDoc]);

  const total = (docsQ.data?.length ?? 0) - (undoDoc ? 1 : 0);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 overflow-y-auto px-4 py-8">
      <section className="rounded-2xl border border-foreground/10 bg-gradient-to-br from-foreground/[0.04] to-transparent p-6 sm:p-8">
        <p className="text-xs uppercase tracking-widest text-foreground/50">
          ParseWithAI
        </p>
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
          Chat with your PDFs
        </h1>
        <p className="mt-2 max-w-xl text-sm text-foreground/65">
          Upload a document. We chunk it, embed it, and let you ask grounded
          questions with page-level citations.
        </p>
        <div className="mt-6">
          {upload.isPending && upload.variables ? (
            <UploadProgress file={upload.variables} />
          ) : (
            <UploadDropzone onUpload={(f) => upload.mutate(f)} />
          )}
        </div>
        {upload.isError && (
          <p className="mt-3 text-sm text-red-500">
            {(upload.error as Error).message}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Your documents</h2>
          {total > 0 && (
            <div className="flex items-center gap-3">
              <SearchBox value={search} onChange={setSearch} />
              <span className="text-xs text-foreground/50">
                {search ? `${visibleDocs.length} / ${total}` : `${total} total`}
              </span>
            </div>
          )}
        </div>
        {docsQ.isLoading ? (
          <SkeletonRows />
        ) : docsQ.isError ? (
          <p className="text-sm text-red-500">
            {(docsQ.error as Error).message}
          </p>
        ) : search && visibleDocs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-foreground/15 px-4 py-8 text-center text-sm text-foreground/55">
            No documents match “{search}”.
          </p>
        ) : (
          <DocList docs={visibleDocs} onDelete={handleDelete} />
        )}
      </section>

      {undoDoc && (
        <UndoToast
          key={undoDoc.id}
          message={`Deleted “${undoDoc.filename}”`}
          durationMs={UNDO_WINDOW_MS}
          onUndo={undo}
          onExpire={expire}
        />
      )}
    </main>
  );
}

function SearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search documents…"
        className="w-44 rounded-md border border-foreground/15 bg-background py-1.5 pl-8 pr-2.5 text-sm placeholder:text-foreground/40 focus:border-foreground/40 focus:outline-none focus:ring-1 focus:ring-foreground/20 sm:w-56"
        aria-label="Search documents"
      />
    </div>
  );
}

function SkeletonRows() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4"
        >
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-pulse rounded bg-foreground/10" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-foreground/10" />
          </div>
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-foreground/10" />
        </li>
      ))}
    </ul>
  );
}
