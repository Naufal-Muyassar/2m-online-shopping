import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import runner from "node-pg-migrate";
import { env } from "../src/config/env";
import { DEMO_PASSWORD, USERS } from "../../../db/seeds/demo/constants";
import { seedBase, seedDemoOrders } from "../../../db/seeds/demo";

const cmd = process.argv[2];
const migrationsDir = fileURLToPath(new URL("../../../db/migrations", import.meta.url));

async function migrate(): Promise<void> {
  await runner({
    databaseUrl: {
      connectionString: env.DATABASE_URL,
      ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
    },
    dir: migrationsDir,
    direction: "up",
    migrationsTable: "pgmigrations",
    count: Infinity,
    log: () => {},
  });
}

async function withClient<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function reset(demo: boolean): Promise<void> {
  if (env.NODE_ENV === "production") throw new Error("Refusing to reset a production database");
  await withClient((c) => c.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"));
  await migrate();
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  await withClient(async (c) => {
    await seedBase(c, hash);
    if (demo) await seedDemoOrders(c);
  });
  console.log("Demo credentials (password for all: %s)", DEMO_PASSWORD);
  console.log("  super_admin  %s", USERS.superAdmin.phone);
  console.log("  branch_admin %s", USERS.branchAdmin.phone);
  for (const c of USERS.couriers) console.log("  courier      %s (%s)", c.phone, c.name);
  for (const c of USERS.customers) console.log("  customer     %s (%s)", c.phone, c.name);
}

if (cmd === "migrate") await migrate();
else if (cmd === "reset") await reset(false);
else if (cmd === "reset:demo") await reset(true);
else throw new Error(`Unknown command: ${cmd}`);
