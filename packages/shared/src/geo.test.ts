import { describe, expect, it } from "vitest";
import { destinationPoint, haversineKm } from "./geo";

describe("destinationPoint", () => {
  it("lands within 1% of the requested distance", () => {
    const origin = { lat: -6.2, lng: 106.8166 };
    for (const [bearing, km] of [[45, 0.8], [200, 1.6], [45, 4]] as const) {
      const p = destinationPoint(origin, bearing, km);
      expect(Math.abs(haversineKm(origin, p) - km) / km).toBeLessThan(0.01);
    }
  });
});
