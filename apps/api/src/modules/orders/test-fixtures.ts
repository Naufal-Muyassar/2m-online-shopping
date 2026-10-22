import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { OrderStatus, Role } from "@2m/shared";
import type { Tx } from "../../shared/db";

export interface Fixture {
  branchId: string;
  addressId: string;
  courierId: string;
  users: Record<Role, string>;
}

type Db = Pool | Tx;

export async function createFixture(db: Db): Promise<Fixture> {
  const tag = randomUUID().slice(0, 8);
  const branchId = (
    await db.query(
      `INSERT INTO branches (name, lat, lng, service_radius_m) VALUES ($1, -6.2, 106.8, 5000) RETURNING id`,
      [`test-${tag}`],
    )
  ).rows[0].id as string;
  const partnerId = (
    await db.query(`INSERT INTO courier_partners (name, fee_per_drop) VALUES ($1, 0) RETURNING id`, [`test-${tag}`])
  ).rows[0].id as string;

  const users = {} as Record<Role, string>;
  for (const role of ["customer", "courier", "branch_admin", "super_admin"] as const) {
    users[role] = (
      await db.query(
        `INSERT INTO users (role, name, phone, password_hash, branch_id) VALUES ($1::user_role, $2, $3, 'x', $4) RETURNING id`,
        [role, `${role}-${tag}`, `t-${role}-${tag}`, role === "customer" || role === "super_admin" ? null : branchId],
      )
    ).rows[0].id;
  }
  await db.query(`INSERT INTO couriers (user_id, partner_id, branch_id, status) VALUES ($1,$2,$3,'IDLE')`, [
    users.courier,
    partnerId,
    branchId,
  ]);
  const addressId = (
    await db.query(
      `INSERT INTO addresses (user_id, label, lat, lng, street, receiver_name, receiver_phone)
       VALUES ($1, 'test', -6.2, 106.8, 'test street', 'test', '0')
       RETURNING id`,
      [users.customer],
    )
  ).rows[0].id as string;
  return { branchId, addressId, courierId: users.courier, users };
}

export async function insertOrder(db: Db, fx: Fixture, status: OrderStatus): Promise<string> {
  const assigned = status === "ASSIGNED" || status === "ON_DELIVERY";
  const id = (
    await db.query(
      `INSERT INTO orders (code, branch_id, customer_id, address_id, status, subtotal, grand_total, assigned_courier_id)
       VALUES ($1, $2, $3, $4, $5::order_status, 10000, 10000, $6) RETURNING id`,
      [`T-${randomUUID()}`, fx.branchId, fx.users.customer, fx.addressId, status, assigned ? fx.courierId : null],
    )
  ).rows[0].id as string;
  if (status === "ON_DELIVERY") {
    await db.query(
      `INSERT INTO proof_of_delivery (order_id, branch_id, photo_key, lat, lng) VALUES ($1, $2, 'test.jpg', -6.2, 106.8)`,
      [id, fx.branchId],
    );
  }
  return id;
}
