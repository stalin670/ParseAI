import type { Source } from "@/lib/types";

export default function SourceCitation({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <div className="mt-1 text-xs text-foreground/60">
      Sources:{" "}
      {sources.map((s, i) => (
        <span key={i} className="mr-2">
          [p. {s.page}]
        </span>
      ))}
    </div>
  );
}
