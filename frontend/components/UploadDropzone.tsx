"use client";
import { useState } from "react";

export default function UploadDropzone({
  onUpload,
}: {
  onUpload: (file: File) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-md border-2 border-dashed border-foreground/20 p-8 text-center">
      <p className="mb-3 text-sm">Drop a PDF here, or pick one:</p>
      <input
        data-testid="file-input"
        type="file"
        accept="application/pdf"
        onChange={(e) => {
          setError(null);
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.type !== "application/pdf") {
            setError("Only PDF allowed");
            return;
          }
          onUpload(f);
        }}
      />
      {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
    </div>
  );
}
