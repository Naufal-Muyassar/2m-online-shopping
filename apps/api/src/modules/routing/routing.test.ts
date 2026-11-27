import { describe, expect, it, vi } from "vitest";
import { cumulativeM, projectOnPath, simplify, type LatLng } from "./geometry";
import { ProviderError, type RoutingProvider } from "./providers";
import { createRouteService, MIN_REROUTE_MS, type RouteStore } from "./service";

// About 111 m per 0.001° of latitude; ~110 m per 0.001° of longitude at 6°S.
const L: LatLng[] = [
  [-6.2, 106.8],
  [-6.19, 106.8],
  [-6.19, 106.81],
];

describe("route geometry", () => {
  it("measures what is left of the path from a snapped point", () => {
    const cum = cumulativeM(L);
    const total = cum[cum.length - 1]!;
    expect(total).toBeGreaterThan(2200);
    expect(total).toBeLessThan(2250);

    // 50 m east of the first leg, halfway up it.
    const p = projectOnPath([-6.195, 106.80045], L, cum);
    expect(p.offRouteM).toBeGreaterThan(45);
    expect(p.offRouteM).toBeLessThan(55);
    expect(p.remainingM).toBeCloseTo(total - cum[1]! / 2, -1);
    expect(p.ahead[0]![0]).toBeCloseTo(-6.195, 5);
    expect(p.ahead.slice(1)).toEqual(L.slice(1));
  });

  it("clamps to the ends", () => {
    const cum = cumulativeM(L);
    expect(projectOnPath([-6.21, 106.8], L, cum).remainingM).toBeCloseTo(cum[2]!, 0);
    expect(projectOnPath([-6.19, 106.82], L, cum).remainingM).toBe(0);
  });

  it("drops points that barely bend the line", () => {
    const wiggly: LatLng[] = [
      [-6.2, 106.8],
      [-6.199, 106.80001],
      [-6.198, 106.8],
      [-6.19, 106.8],
      [-6.19, 106.81],
    ];
    expect(simplify(wiggly, 4)).toEqual([wiggly[0], wiggly[3], wiggly[4]]);
  });
});

function memoryStore(): RouteStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void data.set(k, v),
    setNx: async (k, v) => (data.has(k) ? false : (data.set(k, v), true)),
  };
}

const provider = (name: "ors" | "osrm", impl: RoutingProvider["route"]): RoutingProvider & { route: ReturnType<typeof vi.fn> } => ({
  name,
  route: vi.fn(impl),
});

const TO: LatLng = [-6.19, 106.81];

describe("route service", () => {
  it("fetches once, then re-projects every ping without calling the provider", async () => {
    const store = memoryStore();
    const ors = provider("ors", async () => L);
    const svc = createRouteService({ store, providers: [ors] });

    const first = await svc.roadRemaining("o1", [-6.2, 106.8], TO);
    const later = await svc.roadRemaining("o1", [-6.19, 106.805], TO);
    expect(ors.route).toHaveBeenCalledTimes(1);
    expect(first!.provider).toBe("ors");
    expect(later!.remainingM).toBeLessThan(first!.remainingM);
    expect(later!.remainingM).toBeGreaterThan(500);
    expect(later!.remainingM).toBeLessThan(600);
  });

  it("falls back to osrm and skips a failing ors for every order", async () => {
    const store = memoryStore();
    const ors = provider("ors", async () => {
      throw new ProviderError("ors", 429, "rate limited");
    });
    const osrm = provider("osrm", async () => L);
    const svc = createRouteService({ store, providers: [ors, osrm] });

    expect((await svc.roadRemaining("o1", L[0]!, TO))!.provider).toBe("osrm");
    expect((await svc.roadRemaining("o2", L[0]!, TO))!.provider).toBe("osrm");
    expect(ors.route).toHaveBeenCalledTimes(1);
    expect(osrm.route).toHaveBeenCalledTimes(2);
  });

  it("returns null when every provider fails, and does not retry the same order at once", async () => {
    const store = memoryStore();
    const osrm = provider("osrm", async () => {
      throw new ProviderError("osrm", null, "NoRoute");
    });
    const svc = createRouteService({ store, providers: [osrm] });
    expect(await svc.roadRemaining("o1", L[0]!, TO)).toBeNull();
    expect(await svc.roadRemaining("o1", L[0]!, TO)).toBeNull();
    expect(osrm.route).toHaveBeenCalledTimes(1);
  });

  it("reroutes an off-route courier at most once per window", async () => {
    const store = memoryStore();
    let t = 1_000_000;
    const ors = provider("ors", async (from) => [from, TO]);
    const svc = createRouteService({ store, providers: [ors], now: () => t });

    await svc.roadRemaining("o1", L[0]!, TO);
    const off: LatLng = [-6.2, 106.79]; // ~1 km west of the stored line
    store.data.delete("route:lock:o1");
    await svc.roadRemaining("o1", off, TO);
    expect(ors.route).toHaveBeenCalledTimes(1);

    t += MIN_REROUTE_MS + 1;
    await svc.roadRemaining("o1", off, TO);
    expect(ors.route).toHaveBeenCalledTimes(2);
    expect(ors.route.mock.calls[1]![0]).toEqual(off);
  });

  it("is off with no providers", async () => {
    const svc = createRouteService({ store: memoryStore(), providers: [] });
    expect(await svc.roadRemaining("o1", L[0]!, TO)).toBeNull();
  });
});
