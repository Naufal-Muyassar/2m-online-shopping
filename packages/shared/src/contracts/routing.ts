import { z } from "zod";

// Road geometry still ahead of the courier, as [lat, lng] pairs. It starts at the courier's point on the road and
// ends at the road point nearest the destination pin; maps draw courier → path → destination.
export const routePathSchema = z.array(z.tuple([z.number(), z.number()]));
export type RoutePath = z.infer<typeof routePathSchema>;

// "road": distance measured along a road route. "estimate": straight line × the branch circuity factor, used when no
// routing provider answered (or none is configured).
export const ROUTE_SOURCES = ["road", "estimate"] as const;
export const routeSourceSchema = z.enum(ROUTE_SOURCES);
export type RouteSource = z.infer<typeof routeSourceSchema>;

// GET /courier/orders/:id/route and GET /admin/orders/:id/route. All fields null while the courier has no position.
export const deliveryRouteSchema = z.object({
  path: routePathSchema.nullable(),
  distance_km: z.number().nullable(),
  eta_minutes: z.number().int().nullable(),
  source: routeSourceSchema,
});
export type DeliveryRoute = z.infer<typeof deliveryRouteSchema>;
