"use client";

// The Linkup track, made visible. Judges should be able to watch the
// system notice a hole in what it knows and go fill it.

import { useEffect, useRef, useState } from "react";
import { Chip, Panel, PanelHeader } from "./ui";
import type { ResearchLogLine } from "@/hooks/useResearch";
import type { ResearchFinding } from "@/lib/types";

const TONE_STYLES: Record<ResearchLogLine["tone"], string> = {
  status: "text-mist-400",
  finding: "text-mist-200",
  gap: "text-sky-300",
  conflict: "text-amber-300",
  resolved: "text-emerald-300",
  error: "text-rose-300",
};

export default function ResearchFeed({
  log,
  findings,
  running,
}: {
  log: ResearchLogLine[];
  findings: ResearchFinding[];
  running: boolean;
}) {
  const [tab, setTab] = useState<"live" | "findings">("live");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (tab === "live" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [log.length, tab]);

  const followUps = findings.filter((f) => f.kind !== "seed").length;
  const conflictQueries = findings.filter((f) => f.kind === "conflict").length;

  return (
    <Panel className="hl-rise flex min-h-0 flex-col overflow-hidden">
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            Research trail
            {running && (
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
            )}
          </span>
        }
        subtitle={`${findings.length} findings stored · ${followUps} follow-up ${
          followUps === 1 ? "query" : "queries"
        }${conflictQueries ? ` · ${conflictQueries} conflict check${conflictQueries === 1 ? "" : "s"}` : ""}`}
        right={
          <div className="flex shrink-0 gap-1 rounded-lg border border-white/10 bg-ink-800/70 p-0.5">
            {(["live", "findings"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-2 py-1 text-[11.5px] font-semibold capitalize transition ${
                  tab === t ? "bg-white/10 text-white" : "text-mist-400 hover:text-white"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        }
      />

      {running && (
        <div className="h-0.5 w-full overflow-hidden bg-white/5">
          <div className="hl-shimmer h-full w-full" />
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {tab === "live" ? (
          <ol className="space-y-2">
            {log.map((line) => (
              <li key={line.id} className="hl-rise flex gap-2.5">
                <span className="mt-px w-4 shrink-0 text-center text-[13.5px] leading-5">
                  {line.icon}
                </span>
                <div className="min-w-0">
                  <p className={`text-[13.5px] leading-5 ${TONE_STYLES[line.tone]}`}>
                    {line.text}
                  </p>
                  {line.detail && (
                    <p className="mt-0.5 border-l border-white/10 pl-2 font-mono text-[11.5px] leading-4 text-ink-500">
                      {line.detail}
                    </p>
                  )}
                </div>
              </li>
            ))}
            {!log.length && (
              <li className="py-6 text-center text-[12.5px] text-ink-500">
                The research log appears here.
              </li>
            )}
          </ol>
        ) : (
          <ol className="space-y-2.5">
            {findings.map((f) => (
              <li
                key={f.id}
                className="rounded-xl border border-white/8 bg-white/[0.025] p-2.5"
              >
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Chip
                    tone={
                      f.kind === "seed" ? "brand" : f.kind === "conflict" ? "warn" : "neutral"
                    }
                  >
                    {f.kind === "seed"
                      ? "seed search"
                      : f.kind === "conflict"
                        ? "conflict check"
                        : "gap follow-up"}
                  </Chip>
                  <Chip tone={f.certainty >= 0.8 ? "good" : f.certainty >= 0.5 ? "warn" : "bad"}>
                    certainty {Math.round(f.certainty * 100)}%
                  </Chip>
                  {f.needsFollowUp && <Chip tone="warn">needs follow-up</Chip>}
                </div>
                <p className="font-mono text-[11.5px] leading-4 text-sky-300/80">
                  ? {f.query}
                </p>
                <p className="mt-1 text-[13px] leading-5 text-mist-200">{f.finding}</p>
                {f.sources.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {f.sources.slice(0, 3).map((s, i) => (
                      <a
                        key={`${f.id}-src-${i}`}
                        href={s}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="max-w-[200px] truncate rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-mist-400 hover:border-white/25 hover:text-mist-200"
                      >
                        {hostOf(s)}
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
            {!findings.length && (
              <li className="py-6 text-center text-[12.5px] text-ink-500">
                Stored findings appear here as they come in.
              </li>
            )}
          </ol>
        )}
      </div>
    </Panel>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 30);
  }
}
