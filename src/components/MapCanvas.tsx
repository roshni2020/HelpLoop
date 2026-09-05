"use client";

// ─────────────────────────────────────────────────────────────
// Track 4 — the live 3D community map.
//
// Everything the other three tracks produce lands here: researched
// resources become pins, the ranked best match glows, live Convex
// requests pulse until someone takes them, volunteers (human and bot)
// drift around at privacy-rounded positions, and an accepted mission
// draws a route the courier's dot actually travels — driven by the
// tracking stream when there is one, by a canned animation when not.
//
// 3D: real building extrusions from the basemap's vector tiles, real
// terrain from AWS's open elevation tiles, hillshade and a sky dome.
// ─────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef } from "react";
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useTheme, type Theme } from "./ThemeProvider";
import type { HelpRequest, Resource, VolunteerPublic } from "@/lib/types";

// Light: OpenFreeMap "Liberty" - full-colour OSM cartography, keyless, and
// it carries building heights so the 3D extrusions work. Dark: CARTO's
// dark matter as the ground, with our own neon height-coloured buildings.
const STYLES: Record<Theme, string> = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://tiles.openfreemap.org/styles/liberty",
};

/** Open elevation tiles (Mapzen/AWS), keyless. */
const TERRAIN_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

export interface MissionState {
  requestId: string;
  phase: HelpRequest["status"];
  volunteer: { lat: number; lng: number };
  resource: { lat: number; lng: number; name: string };
  requester: { lat: number; lng: number };
  /** True when `volunteer` is a live (rounded) position rather than a guess. */
  tracked: boolean;
}

export interface MapCanvasProps {
  center: { lat: number; lng: number } | null;
  origin?: { lat: number; lng: number; label?: string } | null;
  resources?: Resource[];
  bestResourceId?: string | null;
  selectedResourceId?: string | null;
  scores?: Record<string, number>;
  onSelectResource?: (id: string) => void;
  requests?: HelpRequest[];
  onSelectRequest?: (id: string) => void;
  /** The viewer's own request, so their pin reads "You", not the helper's name. */
  selfRequestId?: string | null;
  /** Everyone helping, at privacy-rounded positions. */
  volunteers?: VolunteerPublic[];
  /** The viewer's own volunteer row — drawn from `origin` instead, so skip it here. */
  selfVolunteerId?: string | null;
  mission?: MissionState | null;
  className?: string;
}

interface MarkerEntry {
  marker: maplibregl.Marker;
  key: string;
}

export default function MapCanvas({
  center,
  origin,
  resources = [],
  bestResourceId,
  selectedResourceId,
  scores = {},
  onSelectResource,
  requests = [],
  onSelectRequest,
  selfRequestId,
  volunteers = [],
  selfVolunteerId,
  mission,
  className = "",
}: MapCanvasProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const readyRef = useRef(false);
  const markersRef = useRef(new Map<string, MarkerEntry>());
  const courierRef = useRef<maplibregl.Marker | null>(null);
  const rafRef = useRef<number | null>(null);
  const flownRef = useRef(false);
  const lastFitRef = useRef<string>("");
  const missionRef = useRef<MissionState | null | undefined>(mission);
  missionRef.current = mission;

  // Callbacks change identity between renders; keep the latest without
  // forcing every marker to be rebuilt.
  const selectResourceRef = useRef(onSelectResource);
  const selectRequestRef = useRef(onSelectRequest);
  selectResourceRef.current = onSelectResource;
  selectRequestRef.current = onSelectRequest;

  // ── init ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE?.trim() || STYLES[theme],
      center: [center?.lng ?? -122.2712, center?.lat ?? 37.8044],
      zoom: 13.2,
      pitch: 60,
      bearing: -20,
      maxPitch: 75,
      canvasContextAttributes: { antialias: true },
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // Dev-only handle so a driver script (scripts/drive.mjs) can steer the camera.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as { __helploopMap?: MLMap }).__helploopMap = map;
    }

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map.scrollZoom.setWheelZoomRate(1 / 600);

    // Custom layers live on top of whatever basemap is loaded, so they
    // are (re)built every time a style finishes loading — including
    // after a theme switch replaces the style wholesale.
    map.on("style.load", () => {
      readyRef.current = true;
      setupScene(map, currentTheme(map));
      map.resize();
      const m = missionRef.current;
      if (m) drawRoute(map, m);
    });

    // The container is laid out by flexbox, so its size can settle after
    // the map is constructed. Without this the canvas keeps whatever size
    // it saw first.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      markersRef.current.forEach((m) => m.marker.remove());
      markersRef.current.clear();
      courierRef.current?.remove();
      courierRef.current = null;
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // Intentionally mount-only: later prop changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── theme → basemap ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || process.env.NEXT_PUBLIC_MAP_STYLE?.trim()) return;
    if (currentTheme(map) === theme && readyRef.current) return;
    readyRef.current = false;
    map.setStyle(STYLES[theme], { diff: false });
  }, [theme]);

  // ── recentre when we learn where the person is ──────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;
    const fly = () =>
      map.flyTo({
        center: [center.lng, center.lat],
        zoom: flownRef.current ? map.getZoom() : 13.8,
        pitch: 60,
        duration: 1600,
        essential: true,
      });
    if (readyRef.current) fly();
    else map.once("style.load", fly);
    flownRef.current = true;
  }, [center?.lat, center?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── markers ─────────────────────────────────────────────
  const markerSpecs = useMemo(
    () =>
      buildMarkerSpecs({
        origin,
        resources,
        bestResourceId,
        selectedResourceId,
        scores,
        requests,
        selfRequestId,
        volunteers,
        selfVolunteerId,
      }),
    [
      origin,
      resources,
      bestResourceId,
      selectedResourceId,
      scores,
      requests,
      selfRequestId,
      volunteers,
      selfVolunteerId,
    ],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const live = new Set<string>();
      for (const spec of markerSpecs) {
        live.add(spec.id);
        const existing = markersRef.current.get(spec.id);
        if (existing && existing.key === spec.key) {
          glide(existing.marker, [spec.lng, spec.lat], 900);
          continue;
        }
        existing?.marker.remove();

        const el = renderMarker(spec);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          if (spec.kind === "resource") selectResourceRef.current?.(spec.refId);
          if (spec.kind === "request") selectRequestRef.current?.(spec.refId);
        });

        const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([spec.lng, spec.lat])
          .addTo(map);
        markersRef.current.set(spec.id, { marker, key: spec.key });
      }
      for (const [id, entry] of markersRef.current) {
        if (!live.has(id)) {
          entry.marker.remove();
          markersRef.current.delete(id);
        }
      }
    };

    if (readyRef.current) apply();
    else map.once("style.load", apply);
  }, [markerSpecs]);

  // ── mission route + courier ─────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (!mission) {
        clearRoute(map);
        courierRef.current?.remove();
        courierRef.current = null;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        lastFitRef.current = "";
        return;
      }

      const { legA, legB } = drawRoute(map, mission);

      if (!courierRef.current) {
        const el = document.createElement("div");
        el.className = "hl-marker";
        el.innerHTML = `<div class="hl-avatar hl-avatar--rider is-active"><span class="hl-face">🛵</span></div><div class="hl-shadow"></div>`;
        courierRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([mission.volunteer.lng, mission.volunteer.lat])
          .addTo(map);
      }
      const courier = courierRef.current;

      if (mission.tracked) {
        // Live: the dot IS the (rounded) position. Ease to each update.
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        glide(courier, [mission.volunteer.lng, mission.volunteer.lat], 1600);
      } else {
        // No stream: act the status out along the route.
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (mission.phase === "assigned") travel(courier, legA, 4200, rafRef);
        else if (mission.phase === "picked_up") courier.setLngLat([mission.resource.lng, mission.resource.lat]);
        else if (mission.phase === "on_the_way") travel(courier, legB, 5200, rafRef);
        else if (mission.phase === "delivered") courier.setLngLat([mission.requester.lng, mission.requester.lat]);
      }

      // Frame the whole mission once per phase, not on every position tick.
      const fitKey = `${mission.requestId}:${mission.phase}`;
      if (lastFitRef.current !== fitKey) {
        lastFitRef.current = fitKey;
        const bounds = new maplibregl.LngLatBounds();
        for (const p of [mission.volunteer, mission.resource, mission.requester]) {
          bounds.extend([p.lng, p.lat]);
        }
        const camera = map.cameraForBounds(bounds, { padding: 110, pitch: 0, bearing: map.getBearing() });
        if (camera) {
          map.easeTo({
            center: camera.center,
            zoom: Math.min((camera.zoom ?? 13) - 1.1, 14.8),
            pitch: 56,
            duration: 1400,
            essential: true,
          });
        }
      }
    };

    if (readyRef.current) apply();
    else map.once("style.load", apply);
  }, [mission]);

  return (
    <div className={`relative h-full w-full ${className}`}>
      {/* Sized with h-full, not `absolute inset-0`: maplibre-gl.css sets
          `.maplibregl-map { position: relative }` on this very element and
          loads after Tailwind, so the absolute positioning is overridden
          and the container collapses to zero height. */}
      <div ref={containerRef} className="h-full w-full" />
      {/* Vignette so overlay panels stay legible over bright tiles */}
      <div
        className={`pointer-events-none absolute inset-0 ${
          theme === "light"
            ? "bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(243,245,250,0.6)_100%)]"
            : "bg-[radial-gradient(ellipse_at_center,transparent_45%,rgba(5,7,15,0.75)_100%)]"
        }`}
      />
    </div>
  );
}

// ── scene (terrain, sky, buildings, routes) ─────────────────

function currentTheme(map: MLMap): Theme {
  const style = map.getStyle();
  const sprite = (style?.sprite as string | undefined) ?? "";
  const name = (style?.name ?? "").toLowerCase();
  return sprite.includes("openfreemap") || name.includes("liberty") ? "light" : "dark";
}

/**
 * Terrain makes MapLibre read pixels back from a framebuffer on every
 * marker update. Hardware GPUs don't notice; software renderers (headless
 * test browsers) crawl. `?noterrain=1` lets the drivers opt out.
 */
function terrainEnabled(): boolean {
  if (typeof window === "undefined") return true;
  return !/[?&]noterrain=1/.test(window.location.search);
}

function setupScene(map: MLMap, theme: Theme) {
  if (theme === "dark") tintDarkBasemap(map);
  if (terrainEnabled()) addTerrain(map, theme);
  addSky(map, theme);
  addExtrudedBuildings(map, theme);
  addRouteLayers(map);
}

/** Dark matter is monochrome; give water and parks some colour. */
function tintDarkBasemap(map: MLMap) {
  const tints: Record<string, string> = {
    water: "#0d2a52",
    park: "#0f3a2e",
    landcover_grass: "#0f3a2e",
    landcover_wood: "#0c3326",
    landuse_residential: "#12172b",
  };
  for (const layer of map.getStyle()?.layers ?? []) {
    const tint = tints[layer.id];
    if (!tint) continue;
    try {
      if (layer.type === "fill") map.setPaintProperty(layer.id, "fill-color", tint);
    } catch {
      /* not every style has these ids */
    }
  }
}

function addTerrain(map: MLMap, theme: Theme) {
  try {
    if (!map.getSource("hl-dem")) {
      map.addSource("hl-dem", {
        type: "raster-dem",
        tiles: [TERRAIN_TILES],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 14,
        attribution: "Terrain: Mapzen / AWS Open Data",
      });
    }
    // Real hills, slightly exaggerated so they read at a 60° pitch.
    map.setTerrain({ source: "hl-dem", exaggeration: 1.35 });

    if (!map.getLayer("hl-hillshade")) {
      map.addLayer(
        {
          id: "hl-hillshade",
          type: "hillshade",
          source: "hl-dem",
          paint: {
            "hillshade-exaggeration": theme === "light" ? 0.35 : 0.55,
            "hillshade-shadow-color": theme === "light" ? "#9aa3b8" : "#04060c",
            "hillshade-highlight-color": theme === "light" ? "#ffffff" : "#2a3352",
            "hillshade-accent-color": theme === "light" ? "#c7cede" : "#141a2c",
          },
        },
        firstSymbolLayer(map),
      );
    }
  } catch {
    /* terrain unavailable — the map stays flat, everything else works */
  }
}

function addSky(map: MLMap, theme: Theme) {
  try {
    map.setSky(
      theme === "light"
        ? {
            "sky-color": "#bcd7ff",
            "horizon-color": "#e8f0fb",
            "fog-color": "#f3f5fa",
            "sky-horizon-blend": 0.6,
            "horizon-fog-blend": 0.6,
            "fog-ground-blend": 0.35,
            "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 10, 1, 13, 0.3],
          }
        : {
            "sky-color": "#0b1230",
            "horizon-color": "#1a2350",
            "fog-color": "#05070f",
            "sky-horizon-blend": 0.7,
            "horizon-fog-blend": 0.7,
            "fog-ground-blend": 0.45,
            "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 10, 1, 13, 0.35],
          },
    );
  } catch {
    /* older style spec — no sky, no harm */
  }
}

function firstSymbolLayer(map: MLMap): string | undefined {
  return map.getStyle()?.layers?.find((l) => l.type === "symbol")?.id;
}

/** OpenMapTiles-schema basemaps carry building footprints with heights. */
function addExtrudedBuildings(map: MLMap, theme: Theme) {
  try {
    const style = map.getStyle();
    const sourceId = Object.keys(style.sources ?? {}).find((id) => {
      const src = style.sources![id] as { type?: string };
      return src?.type === "vector";
    });
    if (!sourceId || map.getLayer("hl-buildings")) return;
    // Liberty ships its own 3D buildings; tune those instead of doubling up.
    const existing = style.layers?.find((l) => l.type === "fill-extrusion");
    if (existing) {
      map.setPaintProperty(existing.id, "fill-extrusion-opacity", 0.92);
      map.setPaintProperty(existing.id, "fill-extrusion-vertical-gradient", true);
      map.setLayerZoomRange(existing.id, 12.5, 24);
      return;
    }

    const dark = theme === "dark";
    map.addLayer(
      {
        id: "hl-buildings",
        type: "fill-extrusion",
        source: sourceId,
        "source-layer": "building",
        minzoom: 12.5,
        paint: {
          // Height -> colour. Dark mode goes neon so the skyline reads
          // as a skyline from across the bay, not a grey smear.
          "fill-extrusion-color": [
            "interpolate",
            ["linear"],
            ["coalesce", ["get", "render_height"], 12],
            0,
            dark ? "#1f2d6e" : "#dfe5f0",
            25,
            dark ? "#4c3fd8" : "#cfd7e6",
            60,
            dark ? "#8b5cf6" : "#b9c4d8",
            120,
            dark ? "#22d3ee" : "#9fb0cb",
            220,
            dark ? "#ff4d9d" : "#8a9dbd",
          ],
          // Heights lifted a touch: true scale reads flat from this camera.
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["zoom"],
            12.5,
            0,
            14.5,
            ["*", ["coalesce", ["get", "render_height"], 12], 1.35],
          ],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": dark ? 0.9 : 0.95,
          "fill-extrusion-vertical-gradient": true,
        },
      },
      firstSymbolLayer(map),
    );
  } catch {
    // Style without building data — the map simply stays flat-shaded.
  }
}

function addRouteLayers(map: MLMap) {
  for (const [id, color, dash] of [
    ["route-pickup", "#ffb020", true],
    ["route-dropoff", "#46b5ff", false],
  ] as const) {
    if (map.getSource(id)) continue;
    map.addSource(id, {
      type: "geojson",
      data: { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} },
    });
    map.addLayer({
      id: `${id}-glow`,
      type: "line",
      source: id,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color, "line-width": 12, "line-opacity": 0.18, "line-blur": 6 },
    });
    map.addLayer({
      id: `${id}-line`,
      type: "line",
      source: id,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": color,
        "line-width": 3.2,
        "line-opacity": 0.95,
        ...(dash ? { "line-dasharray": [1.4, 1.6] } : {}),
      },
    });
  }
}

type Coord = [number, number];

function drawRoute(map: MLMap, mission: MissionState): { legA: Coord[]; legB: Coord[] } {
  // Before pickup: courier → pantry → person. After: courier → person.
  const beforePickup = mission.phase === "assigned";
  const legA = beforePickup ? arc(mission.volunteer, mission.resource) : [];
  const legB = beforePickup
    ? arc(mission.resource, mission.requester)
    : arc(mission.tracked ? mission.volunteer : mission.resource, mission.requester);
  setRoute(map, "route-pickup", legA);
  setRoute(map, "route-dropoff", legB);
  return { legA, legB };
}

function setRoute(map: MLMap, id: string, coords: Coord[]) {
  const source = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  source?.setData({
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: coords },
  });
}

function clearRoute(map: MLMap) {
  for (const id of ["route-pickup", "route-dropoff"]) {
    if (map.getSource(id)) setRoute(map, id, []);
  }
}

/**
 * A gentle bezier arc between two points. Straight lines read as data;
 * a curve reads as a trip someone is taking.
 */
function arc(a: { lat: number; lng: number }, b: { lat: number; lng: number }, steps = 64): Coord[] {
  const mid: Coord = [(a.lng + b.lng) / 2, (a.lat + b.lat) / 2];
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const control: Coord = [mid[0] - dy * 0.18, mid[1] + dx * 0.18];
  const out: Coord[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const inv = 1 - t;
    out.push([
      inv * inv * a.lng + 2 * inv * t * control[0] + t * t * b.lng,
      inv * inv * a.lat + 2 * inv * t * control[1] + t * t * b.lat,
    ]);
  }
  return out;
}

function travel(
  marker: maplibregl.Marker,
  path: Coord[],
  durationMs: number,
  rafRef: { current: number | null },
) {
  if (path.length < 2) return;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const idx = Math.min(path.length - 1, Math.floor(eased * (path.length - 1)));
    marker.setLngLat(path[idx]);
    if (t < 1) rafRef.current = requestAnimationFrame(step);
    else rafRef.current = null;
  };
  rafRef.current = requestAnimationFrame(step);
}

/** Ease a marker from where it is to a new point, so live updates don't jump. */
const glides = new WeakMap<maplibregl.Marker, number>();
function glide(marker: maplibregl.Marker, to: Coord, durationMs: number) {
  const from = marker.getLngLat();
  const prev = glides.get(marker);
  if (prev) cancelAnimationFrame(prev);
  if (Math.abs(from.lng - to[0]) < 1e-7 && Math.abs(from.lat - to[1]) < 1e-7) return;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    const e = 1 - Math.pow(1 - t, 3);
    marker.setLngLat([from.lng + (to[0] - from.lng) * e, from.lat + (to[1] - from.lat) * e]);
    if (t < 1) glides.set(marker, requestAnimationFrame(step));
    else glides.delete(marker);
  };
  glides.set(marker, requestAnimationFrame(step));
}

// ── marker model ────────────────────────────────────────────

type MarkerKind = "origin" | "resource" | "request" | "volunteer";

interface MarkerSpec {
  id: string;
  key: string;
  kind: MarkerKind;
  refId: string;
  lat: number;
  lng: number;
  emoji: string;
  color: string;
  label?: string;
  badge?: string;
  best?: boolean;
  selected?: boolean;
  pulse?: boolean;
  small?: boolean;
  /** Render as an animated character instead of a pin. */
  avatar?: "need" | "assigned" | "done" | "rider";
  isBot?: boolean;
  heading?: number;
}

function buildMarkerSpecs(args: {
  origin?: { lat: number; lng: number; label?: string } | null;
  resources: Resource[];
  bestResourceId?: string | null;
  selectedResourceId?: string | null;
  scores: Record<string, number>;
  requests: HelpRequest[];
  selfRequestId?: string | null;
  volunteers: VolunteerPublic[];
  selfVolunteerId?: string | null;
}): MarkerSpec[] {
  const specs: MarkerSpec[] = [];
  const {
    origin,
    resources,
    bestResourceId,
    selectedResourceId,
    scores,
    requests,
    selfRequestId,
    volunteers,
    selfVolunteerId,
  } = args;

  if (origin) {
    specs.push({
      id: "origin",
      key: `origin:${origin.label ?? ""}`,
      kind: "origin",
      refId: "origin",
      lat: origin.lat,
      lng: origin.lng,
      emoji: "📍",
      color: "#a78bfa",
      label: origin.label ?? "You",
    });
  }

  for (const r of resources) {
    if (r.lat === undefined || r.lng === undefined) continue;
    const best = r.id === bestResourceId;
    const selected = r.id === selectedResourceId;
    const score = scores[r.id];
    specs.push({
      id: `res:${r.id}`,
      key: `res:${r.id}:${best}:${selected}:${score ?? "-"}:${r.confidence.toFixed(2)}`,
      kind: "resource",
      refId: r.id,
      lat: r.lat,
      lng: r.lng,
      emoji: best ? "⭐" : "🍲",
      color: best ? "#ffb020" : "#f59e0b",
      label: r.name.length > 26 ? r.name.slice(0, 25) + "…" : r.name,
      badge: score !== undefined ? `${score}%` : undefined,
      best,
      selected,
    });
  }

  for (const req of requests) {
    const mine = req._id === selfRequestId;
    if (req.status === "delivered") {
      specs.push({
        id: `req:${req._id}`,
        key: `req:${req._id}:done:${mine}`,
        kind: "request",
        refId: req._id,
        lat: req.lat,
        lng: req.lng,
        emoji: "🎉",
        color: "#21e39a",
        label: mine ? "You" : "Helped",
        avatar: "done",
      });
      continue;
    }
    if (req.status === "cancelled") continue;

    const waiting = req.status === "waiting";
    specs.push({
      id: `req:${req._id}`,
      key: `req:${req._id}:${req.status}:${mine}`,
      kind: "request",
      refId: req._id,
      lat: req.lat,
      lng: req.lng,
      emoji: waiting ? "🙋" : "🧍",
      color: waiting ? "#ff4d6d" : "#facc15",
      // On your own screen this pin is where YOU are — labelling it with
      // the helper's name reads as though they are already standing there.
      label: mine ? "You" : waiting ? "Needs help" : `${req.volunteerName ?? "Help"} coming`,
      avatar: waiting ? "need" : "assigned",
    });

    // The pantry this request is heading to, so volunteers see the leg.
    const res = req.resource;
    if (res.lat !== undefined && res.lng !== undefined) {
      specs.push({
        id: `reqres:${req._id}`,
        key: `reqres:${req._id}`,
        kind: "resource",
        refId: res.id,
        lat: res.lat,
        lng: res.lng,
        emoji: "🍲",
        color: "#f59e0b",
        label: res.name.length > 24 ? res.name.slice(0, 23) + "…" : res.name,
      });
    }
  }

  // Volunteers at their ROUNDED positions (the server never sends exact).
  // Busy ones are represented by the courier dot on the mission, so only
  // idle ones get a pin here — keeps the board readable.
  for (const v of volunteers) {
    if (v.lat === undefined || v.lng === undefined) continue;
    if (v._id === selfVolunteerId) continue;
    if (v.activeRequestId) continue;
    // Humans without a fresh position are not "on the map" - hide them.
    const stale = !v.locationUpdatedAt || Date.now() - v.locationUpdatedAt > 120_000;
    if (!v.isBot && stale) continue;
    specs.push({
      id: `vol:${v._id}`,
      key: `vol:${v._id}:${v.isBot}:${Math.round((v.heading ?? 0) / 15)}`,
      kind: "volunteer",
      refId: v._id,
      lat: v.lat,
      lng: v.lng,
      emoji: "🛵",
      color: "#46b5ff",
      label: v.isBot ? `${v.name} 🤖` : v.name,
      avatar: "rider",
      isBot: v.isBot,
      heading: v.heading,
    });
  }

  // De-duplicate anything sharing a spot; earlier kinds win.
  const seen = new Set<string>();
  return specs.filter((s) => {
    const geoKey = `${s.kind}:${s.lat.toFixed(5)}:${s.lng.toFixed(5)}`;
    if (seen.has(geoKey)) return false;
    seen.add(geoKey);
    return true;
  });
}

function renderMarker(spec: MarkerSpec): HTMLElement {
  const el = document.createElement("div");
  el.className = "hl-marker relative";
  el.style.color = spec.color;

  if (spec.avatar) {
    const cls = ["hl-avatar", `hl-avatar--${spec.avatar}`];
    if (spec.isBot) cls.push("is-bot");
    // Emoji scooters face left; heading is clockwise from north.
    const rot = spec.heading === undefined ? 0 : Math.round(((spec.heading + 90) % 360) - 180);
    el.innerHTML = `
      <div class="${cls.join(" ")}"><span class="hl-face" style="--heading:${rot}deg">${spec.emoji}</span></div>
      <div class="hl-shadow"></div>
      ${spec.label ? `<div class="hl-label" style="top:50px">${escapeHtml(spec.label)}</div>` : ""}
    `;
    return el;
  }

  const classes = ["hl-pin"];
  if (spec.best) classes.push("hl-pin--best");
  if (spec.selected) classes.push("hl-pin--selected");
  if (spec.pulse) classes.push("hl-pulse");
  if (spec.small) classes.push("hl-pin--small");

  el.innerHTML = `
    <div class="${classes.join(" ")}" style="background:${spec.color}">
      <span>${spec.emoji}</span>
    </div>
    ${spec.badge ? `<div class="hl-badge">${spec.badge}</div>` : ""}
    ${spec.label ? `<div class="hl-label">${escapeHtml(spec.label)}</div>` : ""}
  `;
  return el;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
