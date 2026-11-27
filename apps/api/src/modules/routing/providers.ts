import type { LatLng } from "./geometry";

// Road routing behind one interface, like the LLM provider. Only coordinates leave the server: no order code, name
// or address text.
export interface RoutingProvider {
  name: "ors" | "osrm";
  route(from: LatLng, to: LatLng, signal: AbortSignal): Promise<LatLng[]>;
}

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}

// Server software name only: OSRM's usage policy asks clients to identify themselves.
const USER_AGENT = "2m-delivery-api";

type Fetch = typeof fetch;

// GeoJSON is [lng, lat]; everything else in the app is [lat, lng].
const flip = (coords: unknown): LatLng[] => {
  if (!Array.isArray(coords)) return [];
  return coords.flatMap((c) =>
    Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number" ? [[c[1], c[0]] as LatLng] : [],
  );
};

async function readJson(provider: string, res: Response): Promise<unknown> {
  if (!res.ok) throw new ProviderError(provider, res.status, `HTTP ${res.status}`);
  return res.json();
}

// openrouteservice directions (needs an API key). driving-car: the public API has no motorcycle profile.
export function orsProvider(opts: { baseUrl: string; apiKey: string; fetch?: Fetch }): RoutingProvider {
  const f = opts.fetch ?? fetch;
  return {
    name: "ors",
    async route(from, to, signal) {
      const res = await f(`${opts.baseUrl.replace(/\/$/, "")}/v2/directions/driving-car/geojson`, {
        method: "POST",
        signal,
        headers: {
          Authorization: opts.apiKey,
          "Content-Type": "application/json",
          Accept: "application/geo+json, application/json",
          "User-Agent": USER_AGENT,
        },
        body: JSON.stringify({ coordinates: [[from[1], from[0]], [to[1], to[0]]], instructions: false }),
      });
      const body = (await readJson("ors", res)) as { features?: { geometry?: { coordinates?: unknown } }[] };
      const path = flip(body.features?.[0]?.geometry?.coordinates);
      if (path.length < 2) throw new ProviderError("ors", null, "no route");
      return path;
    },
  };
}

// OSRM HTTP API (the public demo server needs no key, but has no uptime promise and asks for light use).
export function osrmProvider(opts: { baseUrl: string; fetch?: Fetch }): RoutingProvider {
  const f = opts.fetch ?? fetch;
  return {
    name: "osrm",
    async route(from, to, signal) {
      const coords = `${from[1]},${from[0]};${to[1]},${to[0]}`;
      const res = await f(
        `${opts.baseUrl.replace(/\/$/, "")}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`,
        { signal, headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
      );
      const body = (await readJson("osrm", res)) as { code?: string; routes?: { geometry?: { coordinates?: unknown } }[] };
      if (body.code && body.code !== "Ok") throw new ProviderError("osrm", null, body.code);
      const path = flip(body.routes?.[0]?.geometry?.coordinates);
      if (path.length < 2) throw new ProviderError("osrm", null, "no route");
      return path;
    },
  };
}
