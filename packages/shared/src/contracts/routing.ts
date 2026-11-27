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

// Where the route starts: the courier's last position, or (admin board only) the branch while no courier is on the way.
export const ROUTE_ORIGINS = ["courier", "branch"] as const;
export const routeOriginSchema = z.enum(ROUTE_ORIGINS);
export type RouteOrigin = z.infer<typeof routeOriginSchema>;

// GET /courier/orders/:id/route and GET /admin/orders/:id/route. All fields null when there is nothing to route from.
export const deliveryRouteSchema = z.object({
  path: routePathSchema.nullable(),
  distance_km: z.number().nullable(),
  eta_minutes: z.number().int().nullable(),
  source: routeSourceSchema,
  origin: routeOriginSchema.nullable(),
});
export type DeliveryRoute = z.infer<typeof deliveryRouteSchema>;
