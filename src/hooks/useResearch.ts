"use client";

import { useCallback, useRef, useState } from "react";
import type {
  HelpNeed,
  RankMeta,
  RankedResource,
  ResearchEvent,
  ResearchFinding,
  Resource,
} from "@/lib/types";

export interface ResearchLogLine {
  id: string;
  icon: string;
  text: string;
  tone: "status" | "gap" | "conflict" | "resolved" | "finding" | "error";
  detail?: string;
  at: number;
}

export interface ResearchState {
  phase: "idle" | "running" | "done" | "error";
  origin: { lat: number; lng: number; label: string } | null;
  resources: Resource[];
  findings: ResearchFinding[];
  ranking: RankedResource[];
  rankMeta: RankMeta | null;
  log: ResearchLogLine[];
  error: string | null;
}

const INITIAL: ResearchState = {
  phase: "idle",
  origin: null,
  resources: [],
  findings: [],
  ranking: [],
  rankMeta: null,
  log: [],
  error: null,
};

let lineId = 0;

/** Consumes the /api/research SSE stream and folds it into view state. */
export function useResearch() {
  const [state, setState] = useState<ResearchState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(INITIAL);
  }, []);

  const start = useCallback(async (need: HelpNeed) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ ...INITIAL, phase: "running" });

    const push = (line: Omit<ResearchLogLine, "id" | "at">) =>
      setState((s) => ({
        ...s,
        log: [...s.log, { ...line, id: `l${++lineId}`, at: Date.now() }].slice(-60),
      }));

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(need),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Research failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let event: ResearchEvent;
          try {
            event = JSON.parse(line.slice(6)) as ResearchEvent;
          } catch {
            continue;
          }
          applyEvent(event, setState, push);
        }
      }

      setState((s) => (s.phase === "error" ? s : { ...s, phase: "done" }));
    } catch (err) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : "Research failed";
      setState((s) => ({ ...s, phase: "error", error: message }));
      push({ icon: "⛔", text: message, tone: "error" });
    }
  }, []);

  return { ...state, start, reset };
}

function applyEvent(
  event: ResearchEvent,
  setState: React.Dispatch<React.SetStateAction<ResearchState>>,
  push: (line: Omit<ResearchLogLine, "id" | "at">) => void,
) {
  switch (event.type) {
    case "status":
      push({ icon: event.icon ?? "•", text: event.message, tone: "status" });
      break;

    case "geocoded":
      setState((s) => ({
        ...s,
        origin: { lat: event.lat, lng: event.lng, label: event.label },
      }));
      break;

    case "resource":
      setState((s) => {
        const next = [...s.resources];
        const i = next.findIndex((r) => r.id === event.resource.id);
        if (i >= 0) next[i] = event.resource;
        else next.push(event.resource);
        return { ...s, resources: next };
      });
      break;

    case "finding":
      setState((s) => ({ ...s, findings: [...s.findings, event.finding] }));
      break;

    case "gap":
      push({
        icon: "🔎",
        text: `Missing ${humanField(event.field)} — asking a follow-up`,
        detail: event.query,
        tone: "gap",
      });
      break;

    case "conflict":
      if (event.conflict.status === "resolved") {
        push({
          icon: "✔️",
          text: `Conflict settled: ${humanField(event.conflict.field)}`,
          detail: event.conflict.resolution,
          tone: "resolved",
        });
      } else {
        push({
          icon: "⚠️",
          text: `Conflicting information on ${humanField(event.conflict.field)}`,
          detail: `"${event.conflict.claimA}" vs "${event.conflict.claimB}" — verifying`,
          tone: "conflict",
        });
      }
      break;

    case "resolved":
      push({
        icon: "✅",
        text: `${humanField(event.field)} confirmed: ${event.value}`,
        tone: "resolved",
      });
      break;

    case "ranking":
      setState((s) => ({ ...s, ranking: event.ranking, rankMeta: event.meta }));
      push({
        icon: "🧠",
        text:
          event.meta.source === "nebius"
            ? `Ranked by ${shortModel(event.meta.model)} in ${event.meta.latencyMs} ms`
            : `Ranked by the built-in heuristic in ${event.meta.latencyMs} ms`,
        tone: "status",
      });
      break;

    case "done":
      setState((s) => ({
        ...s,
        phase: "done",
        resources: event.resources,
        findings: event.findings,
      }));
      break;

    case "error":
      setState((s) => ({ ...s, phase: "error", error: event.message }));
      push({ icon: "⛔", text: event.message, tone: "error" });
      break;
  }
}

const FIELD_NAMES: Record<string, string> = {
  hours: "opening hours",
  walkIn: "walk-in policy",
  diet: "dietary options",
  eligibility: "eligibility",
  address: "street address",
};

export function humanField(field: string): string {
  return FIELD_NAMES[field.split(":")[0]] ?? field;
}

export function shortModel(model: string): string {
  return model.split("/").pop() ?? model;
}
