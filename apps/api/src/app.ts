import express from "express";
import { pool } from "./shared/db";
import { asyncHandler } from "./shared/http";
import { errorHandler, notFoundHandler } from "./shared/errors";
import { authRoutes } from "./modules/auth/routes";
import { ordersRoutes } from "./modules/orders/routes";
import { dispatchRoutes } from "./modules/dispatch/routes";
import { courierRoutes } from "./modules/courier/routes";
import { adminRoutes } from "./modules/admin/routes";
import { eventsRoutes } from "./modules/events/routes";
import { branchesRoutes } from "./modules/branches/routes";

export function createApp() {
  const app = express();
  app.use(express.json());

  app.get(
    "/health",
    asyncHandler(async (_req, res) => {
      await pool.query("SELECT 1");
      res.json({ status: "ok" });
    }),
  );

  const v1 = express.Router();
  v1.use("/auth", authRoutes);
  v1.use("/orders", ordersRoutes);
  v1.use("/orders", dispatchRoutes);
  v1.use("/courier", courierRoutes);
  v1.use("/admin", adminRoutes);
  v1.use("/events", eventsRoutes);
  v1.use("/branches", branchesRoutes);
  app.use("/api/v1", v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
