"use client";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { Document, UploadResult } from "@/lib/types";
import DocList from "@/components/DocList";
import UploadDropzone from "@/components/UploadDropzone";

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["docs"] }),
  });

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
          <UploadDropzone
            onUpload={(f) => upload.mutate(f)}
            disabled={upload.isPending}
          />
        </div>
        {upload.isPending && (
          <div className="mt-3 flex items-center gap-2 text-sm text-foreground/70">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-foreground/60" />
            Uploading and indexing… first PDF can take ~10–20s.
          </div>
        )}
        {upload.isError && (
          <p className="mt-3 text-sm text-red-500">
            {(upload.error as Error).message}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Your documents</h2>
          {docsQ.data && docsQ.data.length > 0 && (
            <span className="text-xs text-foreground/50">
              {docsQ.data.length} total
            </span>
          )}
        </div>
        {docsQ.isLoading ? (
          <SkeletonRows />
        ) : docsQ.isError ? (
          <p className="text-sm text-red-500">
            {(docsQ.error as Error).message}
          </p>
        ) : (
          <DocList docs={docsQ.data ?? []} onDelete={(id) => del.mutate(id)} />
        )}
      </section>
    </main>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-lg border border-foreground/10 bg-foreground/5"
        />
      ))}
    </div>
  );
}
