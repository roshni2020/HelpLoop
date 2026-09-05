// Geocoding + distance helpers. Uses OpenStreetMap Nominatim, which is
// free and keyless — one more thing that can't break on demo day.

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const UA = "HelpLoop/1.0 (community resource matcher; hackathon project)";

export interface GeoPoint {
  lat: number;
  lng: number;
  label: string;
  /** True when this is a city-table guess, not a real hit for the query. */
  fallback?: boolean;
}

const cache = new Map<string, GeoPoint | null>();

/** Common demo cities, so a keyless/offline run still lands somewhere real. */
const FALLBACK_CITIES: Record<string, GeoPoint> = {
  oakland: { lat: 37.8044, lng: -122.2712, label: "Oakland, California" },
  berkeley: { lat: 37.8715, lng: -122.273, label: "Berkeley, California" },
  "san francisco": { lat: 37.7749, lng: -122.4194, label: "San Francisco, California" },
  sf: { lat: 37.7749, lng: -122.4194, label: "San Francisco, California" },
  "new york": { lat: 40.7128, lng: -74.006, label: "New York, New York" },
  nyc: { lat: 40.7128, lng: -74.006, label: "New York, New York" },
  boston: { lat: 42.3601, lng: -71.0589, label: "Boston, Massachusetts" },
  chicago: { lat: 41.8781, lng: -87.6298, label: "Chicago, Illinois" },
  austin: { lat: 30.2672, lng: -97.7431, label: "Austin, Texas" },
  seattle: { lat: 47.6062, lng: -122.3321, label: "Seattle, Washington" },
  london: { lat: 51.5074, lng: -0.1278, label: "London, United Kingdom" },
  paris: { lat: 48.8566, lng: 2.3522, label: "Paris, France" },
};

function fallbackFor(query: string): GeoPoint {
  const q = query.toLowerCase();
  for (const [key, point] of Object.entries(FALLBACK_CITIES)) {
    if (q.includes(key)) return { ...point, fallback: true };
  }
  return { ...FALLBACK_CITIES.oakland, fallback: true };
}

export async function geocode(query: string): Promise<GeoPoint> {
  const key = query.trim().toLowerCase();
  if (!key) return fallbackFor("");
  if (cache.has(key)) return cache.get(key) ?? fallbackFor(query);

  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    const json = (await res.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
    }>;
    if (!json.length) throw new Error("no result");
    const point: GeoPoint = {
      lat: Number(json[0].lat),
      lng: Number(json[0].lon),
      label: json[0].display_name,
    };
    cache.set(key, point);
    return point;
  } catch {
    const point = fallbackFor(query);
    cache.set(key, point);
    return point;
  }
}

/** Great-circle distance in miles. */
export function distanceMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/**
 * Deterministic scatter around an anchor point, used to place a resource
 * on the map when its street address could not be geocoded. Same input
 * always gives the same spot, so the map doesn't twitch between renders.
 */
export function scatterAround(
  anchor: { lat: number; lng: number },
  seed: string,
  maxMiles = 2.5,
): { lat: number; lng: number } {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const angle = ((h >>> 0) % 360) * (Math.PI / 180);
  const radius = 0.25 + (((h >>> 8) % 100) / 100) * maxMiles;
  const dLat = (radius / 69) * Math.cos(angle);
  const dLng =
    (radius / (69 * Math.cos((anchor.lat * Math.PI) / 180))) * Math.sin(angle);
  return { lat: anchor.lat + dLat, lng: anchor.lng + dLng };
}
