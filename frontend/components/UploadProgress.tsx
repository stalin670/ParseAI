"use client";

const STAGES = ["Uploading", "Parsing pages", "Embedding chunks", "Indexing"];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadProgress({ file }: { file: File }) {
  return (
    <div className="rounded-xl border border-foreground/15 bg-foreground/[0.03] p-5">
      <div className="flex items-start gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-foreground/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 animate-pulse"
            aria-hidden
          >
            <path d="M14 3v4a1 1 0 0 0 1 1h4" />
            <path d="M5 21V5a2 2 0 0 1 2-2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-medium" title={file.name}>
              {file.name}
            </p>
            <span className="shrink-0 text-xs text-foreground/55">
              {formatSize(file.size)}
            </span>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-foreground/10">
            <div className="h-full w-1/3 animate-[uploadbar_1.4s_ease-in-out_infinite] rounded-full bg-foreground/70" />
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground/55">
            {STAGES.map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-foreground/40" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <style jsx>{`
        @keyframes uploadbar {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(400%);
          }
        }
      `}</style>
    </div>
  );
}
