"use client";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { Document, UploadResult } from "@/lib/types";
import DocList from "@/components/DocList";
import UploadDropzone from "@/components/UploadDropzone";

export default function DashboardPage() {
  const { getToken } = useAuth();
  const tokenGetter = async () => getToken();
  const qc = useQueryClient();
  const router = useRouter();

  const docsQ = useQuery({
    queryKey: ["docs"],
    queryFn: () => apiFetch<Document[]>("/docs", { tokenGetter }),
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
    <main className="mx-auto w-full max-w-3xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Your documents</h1>
      <UploadDropzone onUpload={(f) => upload.mutate(f)} />
      {upload.isPending && <p>Uploading and indexing...</p>}
      {upload.isError && (
        <p className="text-red-500">{(upload.error as Error).message}</p>
      )}
      {docsQ.isLoading ? (
        <p>Loading...</p>
      ) : (
        <DocList docs={docsQ.data ?? []} onDelete={(id) => del.mutate(id)} />
      )}
    </main>
  );
}
