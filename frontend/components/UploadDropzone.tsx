"use client";
import { useState } from "react";
import { useDropzone } from "react-dropzone";

export default function UploadDropzone({
  onUpload,
  disabled = false,
}: {
  onUpload: (file: File) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);

  const handle = (file: File) => {
    setError(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF allowed");
      return;
    }
    onUpload(file);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "application/pdf": [".pdf"] },
    multiple: false,
    disabled,
    onDrop: (files) => files[0] && handle(files[0]),
    onDropRejected: () => setError("Only PDF allowed"),
  });

  return (
    <div>
      <div
        {...getRootProps({
          className: `group cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            isDragActive
              ? "border-foreground/60 bg-foreground/5"
              : "border-foreground/15 hover:border-foreground/30 hover:bg-foreground/[0.03]"
          } ${disabled ? "pointer-events-none opacity-60" : ""}`,
        })}
      >
        <input data-testid="file-input" {...getInputProps()} />
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-foreground/10">
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
            <path d="M12 11v6" />
            <path d="M9 14l3-3 3 3" />
          </svg>
        </div>
        <p className="text-sm font-medium">
          {isDragActive ? "Drop the PDF here" : "Drag a PDF, or click to choose"}
        </p>
        <p className="mt-1 text-xs text-foreground/55">
          Up to 10 MB · 100 pages · text-based PDFs only
        </p>
      </div>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
