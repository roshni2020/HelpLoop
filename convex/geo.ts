// Small, dependency-free geo helpers for Convex functions.
// (Kept inside convex/ so the function bundle never reaches into src/.)

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_M = 6_371_000;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(h));
}

/** Compass bearing from a to b, degrees clockwise from north. */
export function bearing(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Step `meters` from a toward b, without overshooting. */
export function moveToward(a: LatLng, b: LatLng, meters: number): LatLng {
  const total = distanceMeters(a, b);
  if (total <= meters || total === 0) return { lat: b.lat, lng: b.lng };
  const t = meters / total;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Offset a point by (north, east) metres. */
export function offsetMeters(p: LatLng, north: number, east: number): LatLng {
  const dLat = north / 111_320;
  const dLng = east / (111_320 * Math.cos((p.lat * Math.PI) / 180));
  return { lat: p.lat + dLat, lng: p.lng + dLng };
}

/**
 * Privacy rounding. Snaps to a ~440 m grid, which is coarse enough that a
 * home or workplace cannot be picked out, while still showing progress
 * along a route. This is the ONLY form in which another user ever sees
 * a volunteer's position.
 */
export const FUZZ_DEG = 0.004;

export function fuzz(p: LatLng): LatLng {
  return {
    lat: Math.round(p.lat / FUZZ_DEG) * FUZZ_DEG,
    lng: Math.round(p.lng / FUZZ_DEG) * FUZZ_DEG,
  };
}
