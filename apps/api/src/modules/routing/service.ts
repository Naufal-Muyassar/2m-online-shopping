import type { DeliveryRoute } from "@2m/shared";
import { env } from "../../config/env";
import { haversineM } from "../../shared/geo";
import { logger } from "../../shared/logger";
import { getRedis } from "../../shared/redis";
import { cumulativeM, projectOnPath, roundPath, simplify, type LatLng } from "./geometry";
import { orsProvider, osrmProvider, ProviderError, type RoutingProvider } from "./providers";

// A route is fetched once per order and reused. Every courier ping only re-projects the courier onto the stored
// line, so the provider is called again only when the courier leaves the route.
export const REROUTE_OFF_ROUTE_M = 150;
// At most one new route per order in this window, however far off the route the courier is (GPS spikes, detours).
export const MIN_REROUTE_MS = 120_000;
// Only one request per order may call a provider at a time; it is not released, so it also spaces out retries
// after every provider failed.
const LOCK_TTL_SEC = 30;
// A provider that timed out, rate-limited or errored is skipped for this long, for every order.
const PROVIDER_DOWN_SEC = 300;
const ROUTE_TTL_SEC = 6 * 3600;
const PROVIDER_TIMEOUT_MS = 3000;
// The destination pin moved further than this (address edited): the stored route is for somewhere else.
const SAME_DESTINATION_M = 30;
const SIMPLIFY_M = 4;

export interface RouteStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  // true when the key did not exist and is now set.
  setNx(key: string, value: string, ttlSec: number): Promise<boolean>;
}

export const redisRouteStore: RouteStore = {
  get: (key) => getRedis().get(key),
  set: async (key, value, ttlSec) => {
    await getRedis().set(key, value, "EX", ttlSec);
  },
  setNx: async (key, value, ttlSec) => (await getRedis().set(key, value, "EX", ttlSec, "NX")) === "OK",
};

interface StoredRoute {
  v: 1;
  to: LatLng;
  path: LatLng[];
  provider: string;
  at: number;
}

export interface RoadRemaining {
  // Snapped courier point → rest of the road route.
  path: LatLng[];
  // Courier → road, along the road, then road end → destination pin.
  remainingM: number;
  provider: string;
}

const routeKey = (orderId: string) => `route:v1:${orderId}`;
const lockKey = (orderId: string) => `route:lock:${orderId}`;
const downKey = (provider: string) => `route:down:${provider}`;

function parse(raw: string | null): StoredRoute | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as StoredRoute;
    return r.v === 1 && Array.isArray(r.path) && r.path.length >= 2 ? r : null;
  } catch {
    return null;
  }
}

function measure(stored: StoredRoute, from: LatLng): RoadRemaining & { offRouteM: number } {
  const proj = projectOnPath(from, stored.path, cumulativeM(stored.path));
  const end = stored.path[stored.path.length - 1]!;
  const lastLegM = haversineM(end[0], end[1], stored.to[0], stored.to[1]);
  return {
    path: roundPath(proj.ahead),
    remainingM: proj.offRouteM + proj.remainingM + lastLegM,
    offRouteM: proj.offRouteM,
    provider: stored.provider,
  };
}

export function createRouteService(opts: { store: RouteStore; providers: RoutingProvider[]; now?: () => number }) {
  const { store, providers } = opts;
  const now = opts.now ?? Date.now;

  async function fetchRoute(from: LatLng, to: LatLng): Promise<{ path: LatLng[]; provider: string } | null> {
    for (const p of providers) {
      if (await store.get(downKey(p.name))) continue;
      try {
        const path = await p.route(from, to, AbortSignal.timeout(PROVIDER_TIMEOUT_MS));
        return { path, provider: p.name };
      } catch (err) {
        // "No route" for these two points says nothing about the provider's health.
        const noRoute = err instanceof ProviderError && err.status === null;
        logger.warn({ provider: p.name, status: err instanceof ProviderError ? err.status : null, err: String(err) }, "routing provider failed");
        if (!noRoute) await store.set(downKey(p.name), "1", PROVIDER_DOWN_SEC);
      }
    }
    return null;
  }

  // Road distance and geometry still ahead of the courier, or null when no road route is available.
  async function roadRemaining(orderId: string, from: LatLng, to: LatLng): Promise<RoadRemaining | null> {
    if (providers.length === 0) return null;
    let stored = parse(await store.get(routeKey(orderId)));
    if (stored && haversineM(stored.to[0], stored.to[1], to[0], to[1]) > SAME_DESTINATION_M) stored = null;

    if (stored) {
      const m = measure(stored, from);
      if (m.offRouteM <= REROUTE_OFF_ROUTE_M || now() - stored.at < MIN_REROUTE_MS) return m;
    }
    if (!(await store.setNx(lockKey(orderId), "1", LOCK_TTL_SEC))) return stored ? measure(stored, from) : null;

    const fresh = await fetchRoute(from, to);
    if (!fresh) return stored ? measure(stored, from) : null;
    const next: StoredRoute = { v: 1, to, path: roundPath(simplify(fresh.path, SIMPLIFY_M)), provider: fresh.provider, at: now() };
    await store.set(routeKey(orderId), JSON.stringify(next), ROUTE_TTL_SEC);
    return measure(next, from);
  }

  return { roadRemaining };
}

export function estimateEtaMinutes(distanceKm: number, speedKmh: number): number {
  return Math.max(1, Math.ceil((distanceKm / speedKmh) * 60));
}

function defaultProviders(): RoutingProvider[] {
  return env.ROUTING_PROVIDERS.flatMap((name): RoutingProvider[] => {
    if (name === "ors") return env.ORS_API_KEY ? [orsProvider({ baseUrl: env.ORS_BASE_URL, apiKey: env.ORS_API_KEY })] : [];
    return [osrmProvider({ baseUrl: env.OSRM_BASE_URL })];
  });
}

let service: ReturnType<typeof createRouteService> | undefined;
const routes = () => (service ??= createRouteService({ store: redisRouteStore, providers: defaultProviders() }));

const round2 = (n: number) => Math.round(n * 100) / 100;

// The one place every app's distance and ETA come from, so courier, admin and customer see the same numbers.
// Never throws: any routing or Redis trouble falls back to the straight-line estimate the app used before.
export async function deliveryRoute(args: {
  orderId: string;
  from: { lat: number; lng: number } | null;
  to: { lat: number; lng: number };
  circuityFactor: number;
}): Promise<Omit<DeliveryRoute, "origin">> {
  const { orderId, from, to, circuityFactor } = args;
  if (!from) return { path: null, distance_km: null, eta_minutes: null, source: "estimate" };

  let road: RoadRemaining | null = null;
  try {
    road = await routes().roadRemaining(orderId, [from.lat, from.lng], [to.lat, to.lng]);
  } catch (err) {
    logger.warn({ err: String(err) }, "road route unavailable, using the straight-line estimate");
  }
  const km = road
    ? round2(road.remainingM / 1000)
    : round2((haversineM(from.lat, from.lng, to.lat, to.lng) / 1000) * circuityFactor);
  return {
    path: road ? road.path : null,
    distance_km: km,
    eta_minutes: estimateEtaMinutes(km, env.TRACKING_AVG_SPEED_KMH),
    source: road ? "road" : "estimate",
  };
}
