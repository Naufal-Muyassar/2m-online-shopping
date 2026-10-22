import type { Pool } from "pg";
import type { Address } from "@2m/shared";
import type { Tx } from "../../shared/db";

type Db = Pool | Tx;

const COLUMNS = "id, label, lat, lng, street, rt_rw, unit, receiver_name, receiver_phone, courier_note";

export interface AddressWrite {
  label: string;
  lat: number;
  lng: number;
  geohash: string;
  street: string;
  rt_rw: string | null;
  unit: string | null;
  receiver_name: string;
  receiver_phone: string;
  courier_note: string | null;
}

export async function list(db: Db, userId: string): Promise<Address[]> {
  const res = await db.query<Address>(`SELECT ${COLUMNS} FROM addresses WHERE user_id = $1 ORDER BY created_at DESC`, [
    userId,
  ]);
  return res.rows;
}

export async function find(db: Db, userId: string, id: string): Promise<Address | null> {
  const res = await db.query<Address>(`SELECT ${COLUMNS} FROM addresses WHERE user_id = $1 AND id = $2`, [userId, id]);
  return res.rows[0] ?? null;
}

export async function insert(db: Db, userId: string, a: AddressWrite): Promise<Address> {
  const res = await db.query<Address>(
    `INSERT INTO addresses (user_id, label, lat, lng, geohash, street, rt_rw, unit, receiver_name, receiver_phone, courier_note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${COLUMNS}`,
    [userId, a.label, a.lat, a.lng, a.geohash, a.street, a.rt_rw, a.unit, a.receiver_name, a.receiver_phone, a.courier_note],
  );
  return res.rows[0]!;
}

export async function update(db: Db, userId: string, id: string, a: AddressWrite): Promise<Address | null> {
  const res = await db.query<Address>(
    `UPDATE addresses SET label=$3, lat=$4, lng=$5, geohash=$6, street=$7, rt_rw=$8, unit=$9,
            receiver_name=$10, receiver_phone=$11, courier_note=$12
     WHERE user_id = $1 AND id = $2 RETURNING ${COLUMNS}`,
    [userId, id, a.label, a.lat, a.lng, a.geohash, a.street, a.rt_rw, a.unit, a.receiver_name, a.receiver_phone, a.courier_note],
  );
  return res.rows[0] ?? null;
}

export async function remove(db: Db, userId: string, id: string): Promise<boolean> {
  const res = await db.query("DELETE FROM addresses WHERE user_id = $1 AND id = $2", [userId, id]);
  return res.rowCount === 1;
}

export async function branchGeo(
  db: Db,
  branchId: string,
): Promise<{ lat: number; lng: number; service_radius_m: number } | null> {
  const res = await db.query<{ lat: number; lng: number; service_radius_m: number }>(
    "SELECT lat, lng, service_radius_m FROM branches WHERE id = $1 AND is_active",
    [branchId],
  );
  return res.rows[0] ?? null;
}
