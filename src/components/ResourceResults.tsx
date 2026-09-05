"use client";

// The Nebius track's output: a ranked list with the reasoning visible,
// plus the research provenance behind each row.

import { Button, Chip, ConfidenceBar, Panel, PanelHeader } from "./ui";
import { describeHours } from "@/lib/gaps";
import { shortModel } from "@/hooks/useResearch";
import type { RankMeta, RankedResource, Resource } from "@/lib/types";

export default function ResourceResults({
  resources,
  ranking,
  meta,
  selectedId,
  onSelect,
  onRequestHelp,
  busy,
  cta = "Need pickup help",
}: {
  resources: Resource[];
  ranking: RankedResource[];
  meta: RankMeta | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRequestHelp: (resource: Resource, rank: RankedResource | undefined) => void;
  busy?: boolean;
  cta?: string;
}) {
  const byId = new Map(resources.map((r) => [r.id, r]));
  const rows = ranking
    .map((rank) => ({ rank, resource: byId.get(rank.resourceId) }))
    .filter((row): row is { rank: RankedResource; resource: Resource } =>
      Boolean(row.resource),
    );

  const best = rows[0];

  return (
    <Panel className="hl-rise flex min-h-0 flex-col overflow-hidden">
      <PanelHeader
        title={`${rows.length} option${rows.length === 1 ? "" : "s"} ranked for you`}
        subtitle={
          meta
            ? meta.source === "nebius"
              ? `${shortModel(meta.model)} via Nebius Token Factory · ${meta.latencyMs} ms${
                  meta.costUsd !== undefined ? ` · $${meta.costUsd.toFixed(5)}` : ""
                }`
              : "Built-in heuristic ranker — add NEBIUS_API_KEY for model ranking"
            : undefined
        }
        right={
          meta && (
            <Chip tone={meta.source === "nebius" ? "brand" : "neutral"}>
              {meta.source === "nebius" ? "Nebius" : "fallback"}
            </Chip>
          )
        }
      />

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {best && (
          <BestMatchCard
            row={best}
            selected={selectedId === best.resource.id}
            onSelect={() => onSelect(best.resource.id)}
            onRequestHelp={() => onRequestHelp(best.resource, best.rank)}
            busy={busy}
            cta={cta}
          />
        )}

        {rows.slice(1).map((row, i) => (
          <ResourceRow
            key={row.resource.id}
            row={row}
            position={i + 2}
            selected={selectedId === row.resource.id}
            onSelect={() => onSelect(row.resource.id)}
            onRequestHelp={() => onRequestHelp(row.resource, row.rank)}
            busy={busy}
          />
        ))}
      </div>
    </Panel>
  );
}

function BestMatchCard({
  row,
  selected,
  onSelect,
  onRequestHelp,
  busy,
  cta = "Need pickup help",
}: {
  row: { rank: RankedResource; resource: Resource };
  selected: boolean;
  onSelect: () => void;
  onRequestHelp: () => void;
  busy?: boolean;
  cta?: string;
}) {
  const { rank, resource } = row;
  return (
    <div
      onClick={onSelect}
      className={`hl-pop cursor-pointer rounded-2xl border p-3.5 transition ${
        selected
          ? "border-amber-300/60 bg-amber-400/[0.09]"
          : "border-amber-400/30 bg-amber-400/[0.055] hover:border-amber-300/50"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-950">
          ⭐ Best match
        </span>
        <span className="font-mono text-2xl font-bold text-amber-300">
          {rank.score}
          <span className="text-sm text-amber-300/60">%</span>
        </span>
      </div>

      <h3 className="text-[15px] font-bold leading-tight text-white">{resource.name}</h3>
      <p className="mt-1 text-[12px] leading-5 text-amber-100/85">{rank.reason}</p>

      <ResourceFacts resource={resource} />

      {rank.concerns && rank.concerns.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {rank.concerns.map((c, i) => (
            <Chip key={i} tone="warn">
              ⚠ {c}
            </Chip>
          ))}
        </div>
      )}

      <Button
        variant="danger"
        size="md"
        className="mt-3 w-full"
        disabled={busy}
        onClick={onRequestHelp}
      >
        🙋 {cta}
      </Button>
    </div>
  );
}

function ResourceRow({
  row,
  position,
  selected,
  onSelect,
  onRequestHelp,
  busy,
}: {
  row: { rank: RankedResource; resource: Resource };
  position: number;
  selected: boolean;
  onSelect: () => void;
  onRequestHelp: () => void;
  busy?: boolean;
}) {
  const { rank, resource } = row;
  const tone =
    rank.score >= 70 ? "text-emerald-300" : rank.score >= 45 ? "text-amber-300" : "text-rose-300";

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-xl border p-3 transition ${
        selected
          ? "border-violet-400/50 bg-violet-500/10"
          : "border-white/8 bg-white/[0.025] hover:border-white/20"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono text-[10px] text-ink-500">#{position}</span>
            <h3 className="truncate text-[13px] font-semibold text-white">{resource.name}</h3>
          </div>
          <p className="mt-0.5 text-[11.5px] leading-4.5 text-mist-400">{rank.reason}</p>
        </div>
        <span className={`shrink-0 font-mono text-lg font-bold ${tone}`}>{rank.score}</span>
      </div>

      <ResourceFacts resource={resource} compact />

      {selected && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2.5 w-full"
          disabled={busy}
          onClick={onRequestHelp}
        >
          Request pickup from here instead
        </Button>
      )}
    </div>
  );
}

function ResourceFacts({
  resource,
  compact,
}: {
  resource: Resource;
  compact?: boolean;
}) {
  const closes = resource.closesAtMinutes;
  const openConflicts = resource.conflicts.filter((c) => c.status === "open");
  const settled = resource.conflicts.filter((c) => c.status === "resolved");

  return (
    <>
      <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "mt-2" : "mt-2.5"}`}>
        {resource.distanceMiles !== undefined && (
          <Chip tone={resource.distanceMiles <= 1.5 ? "good" : "neutral"}>
            📍 {resource.distanceMiles} mi
          </Chip>
        )}
        <Chip tone={closes !== undefined ? "good" : "warn"}>🕐 {describeHours(closes)}</Chip>
        {resource.walkIn === true && <Chip tone="good">🚪 walk-in</Chip>}
        {resource.walkIn === false && <Chip tone="bad">📋 appointment</Chip>}
        {resource.foodTypes.slice(0, 2).map((f) => (
          <Chip key={f}>{f}</Chip>
        ))}
        {resource.verified && <Chip tone="brand">✓ re-verified</Chip>}
      </div>

      {openConflicts.map((c, i) => (
        <p
          key={i}
          className="mt-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-2 py-1.5 text-[10.5px] leading-4 text-amber-200"
        >
          ⚠️ Sources disagree on {c.field}: “{c.claimA}” vs “{c.claimB}”. Call ahead.
        </p>
      ))}
      {settled.map((c, i) => (
        <p
          key={`s${i}`}
          className="mt-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] px-2 py-1.5 text-[10.5px] leading-4 text-emerald-200"
        >
          ✔️ Conflict on {c.field} settled by a follow-up search: {c.resolution}
        </p>
      ))}

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] text-ink-500">
          {resource.address || "address unconfirmed"}
        </span>
        <ConfidenceBar value={resource.confidence} />
      </div>
    </>
  );
}
