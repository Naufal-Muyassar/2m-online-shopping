import { Client } from "pg";
import { env } from "../src/config/env";
import { USERS } from "../../../db/seeds/demo/constants";
import { demoAddressPoint } from "../../../db/seeds/demo";

const USAGE = 'Usage: pnpm demo:set-branch -- --lat <n> --lng <n> [--name "<text>"] [--radius <meters>] [--branch <id>] [--force]';

function parseArgs(argv: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const args = argv.filter((a) => a !== "--");
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}\n${USAGE}`);
    const eq = arg.indexOf("=");
    if (eq > 0) out.set(arg.slice(2, eq), arg.slice(eq + 1));
    else if (arg === "--force") out.set("force", "true");
    else {
      const value = args[++i];
      if (value === undefined) throw new Error(`Missing value for ${arg}\n${USAGE}`);
      out.set(arg.slice(2), value);
    }
  }
  return out;
}

function numberIn(opts: Map<string, string>, key: string, min: number, max: number): number | undefined {
  const raw = opts.get(key);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(n) || n < min || n > max) {
    throw new Error(`--${key} must be a number in [${min}, ${max}]`);
  }
  return n;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const lat = numberIn(opts, "lat", -90, 90);
  const lng = numberIn(opts, "lng", -180, 180);
  if (lat === undefined || lng === undefined) throw new Error(`--lat and --lng are required\n${USAGE}`);
  const radius = numberIn(opts, "radius", 500, 10000);
  if (radius !== undefined && !Number.isInteger(radius)) throw new Error("--radius must be a whole number of meters");
  const name = opts.get("name")?.trim() || null;
  const branchId = opts.get("branch") ?? null;

  if (env.NODE_ENV === "production" && !opts.has("force")) {
    throw new Error("Refusing to change the branch in production without --force");
  }

  const db = new Client({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  });
  await db.connect();
  try {
    await db.query("BEGIN");
    const target = (
      await db.query(branchId ? "SELECT id FROM branches WHERE id = $1" : "SELECT id FROM branches ORDER BY created_at, id LIMIT 1", branchId ? [branchId] : [])
    ).rows[0];
    if (!target) throw new Error("Branch not found");

    const branch = (
      await db.query(
        `UPDATE branches
         SET lat = $2, lng = $3, name = COALESCE($4, name), service_radius_m = COALESCE($5, service_radius_m), updated_at = now()
         WHERE id = $1 RETURNING id, name, lat, lng, service_radius_m`,
        [target.id, lat, lng, name, radius ?? null],
      )
    ).rows[0];

    for (const c of USERS.customers) {
      const point = demoAddressPoint({ lat, lng, radiusM: branch.service_radius_m }, c.address);
      await db.query(
        `UPDATE addresses a SET lat = $3, lng = $4, geohash = $5
         FROM users u WHERE a.user_id = u.id AND u.phone = $1 AND a.street = $2`,
        [c.phone, c.address.street, point.lat, point.lng, point.geohash],
      );
    }

    const couriers = await db.query(`UPDATE couriers SET current_lat = $2, current_lng = $3 WHERE branch_id = $1`, [
      branch.id,
      lat,
      lng,
    ]);
    await db.query("COMMIT");

    console.log("Branch updated");
    console.log("  id      %s", branch.id);
    console.log("  name    %s", branch.name);
    console.log("  lat,lng %s, %s", branch.lat, branch.lng);
    console.log("  radius  %s m", branch.service_radius_m);
    console.log("  demo customer addresses repositioned; %s courier(s) moved to the branch", couriers.rowCount);
    console.log("Verify: https://www.google.com/maps?q=%s,%s", branch.lat, branch.lng);
  } catch (err) {
    await db.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await db.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
