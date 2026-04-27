import type { Source } from "@/lib/types";

export default function SourceCitation({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <div className="ml-9 mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-foreground/45">
        Sources
      </span>
      {sources.map((s, i) => (
        <span
          key={i}
          className="rounded-full border border-foreground/10 bg-foreground/[0.05] px-2 py-0.5 text-[11px] text-foreground/70"
          title={`relevance ${(s.score * 100).toFixed(0)}%`}
        >
          p. {s.page}
        </span>
      ))}
    </div>
  );
}
