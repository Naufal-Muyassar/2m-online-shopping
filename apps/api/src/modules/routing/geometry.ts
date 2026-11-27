import { haversineM } from "../../shared/geo";

// [lat, lng], the order Leaflet and the API contract use.
export type LatLng = [number, number];

const M_PER_DEG_LAT = 111_320;

// Local flat projection around `origin`, in metres. Good to well under 1% over a city-sized delivery route.
function toXY(p: LatLng, origin: LatLng): [number, number] {
  const kx = M_PER_DEG_LAT * Math.cos((origin[0] * Math.PI) / 180);
  return [(p[1] - origin[1]) * kx, (p[0] - origin[0]) * M_PER_DEG_LAT];
}

// Cumulative distance in metres from the first point to each point.
export function cumulativeM(path: LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    out.push(out[i - 1]! + haversineM(a[0], a[1], b[0], b[1]));
  }
  return out;
}

export interface Projection {
  // Distance from the point to the nearest point on the path.
  offRouteM: number;
  // Distance along the path from that nearest point to the path's end.
  remainingM: number;
  // The nearest point followed by the rest of the path.
  ahead: LatLng[];
}

// Snaps `p` onto the path and measures what is left of it. `cum` is cumulativeM(path).
export function projectOnPath(p: LatLng, path: LatLng[], cum: number[]): Projection {
  if (path.length === 1) {
    const only = path[0]!;
    return { offRouteM: haversineM(p[0], p[1], only[0], only[1]), remainingM: 0, ahead: [only] };
  }
  let best = { dist2: Infinity, seg: 0, t: 0 };
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = toXY(path[i]!, p);
    const [bx, by] = toXY(path[i + 1]!, p);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    // p sits at (0, 0) in its own projection.
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const dist2 = qx * qx + qy * qy;
    if (dist2 < best.dist2) best = { dist2, seg: i, t };
  }
  const a = path[best.seg]!;
  const b = path[best.seg + 1]!;
  const snapped: LatLng = [a[0] + (b[0] - a[0]) * best.t, a[1] + (b[1] - a[1]) * best.t];
  const segLen = cum[best.seg + 1]! - cum[best.seg]!;
  const total = cum[cum.length - 1]!;
  return {
    offRouteM: Math.sqrt(best.dist2),
    remainingM: Math.max(0, total - cum[best.seg]! - segLen * best.t),
    ahead: [snapped, ...path.slice(best.seg + 1)],
  };
}

function perpendicularM(p: LatLng, a: LatLng, b: LatLng): number {
  const [px, py] = toXY(p, a);
  const [bx, by] = toXY(b, a);
  const len2 = bx * bx + by * by;
  if (len2 === 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - t * bx, py - t * by);
}

// Douglas–Peucker: drops points closer than `toleranceM` to the simplified line. Keeps the first and last point.
export function simplify(path: LatLng[], toleranceM: number): LatLng[] {
  if (path.length < 3) return path;
  const keep = new Uint8Array(path.length);
  keep[0] = 1;
  keep[path.length - 1] = 1;
  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    for (let i = from + 1; i < to; i++) {
      const d = perpendicularM(path[i]!, path[from]!, path[to]!);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > toleranceM) {
      keep[idx] = 1;
      stack.push([from, idx], [idx, to]);
    }
  }
  return path.filter((_, i) => keep[i]);
}

// 5 decimals is about 1 m: plenty for a drawn line, and it keeps the payload small.
export const roundPath = (path: LatLng[]): LatLng[] =>
  path.map(([lat, lng]) => [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5]);
