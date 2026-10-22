import type { Pool } from "pg";
import type { Address, AddressInput } from "@2m/shared";
import { pool, type Tx } from "../../shared/db";
import { AppError } from "../../shared/errors";
import { geohash, haversineM } from "../../shared/geo";
import * as repo from "./repo";

type Db = Pool | Tx;

export async function assertInCoverage(db: Db, branchId: string, lat: number, lng: number): Promise<void> {
  const branch = await repo.branchGeo(db, branchId);
  if (!branch) throw new AppError(404, "BRANCH_NOT_FOUND", "Branch not found");
  const distance = haversineM(branch.lat, branch.lng, lat, lng);
  if (distance > branch.service_radius_m) {
    throw new AppError(422, "OUTSIDE_COVERAGE", "Address is outside the branch delivery area", {
      distance_m: Math.round(distance),
      service_radius_m: branch.service_radius_m,
    });
  }
}

function toWrite(input: AddressInput): repo.AddressWrite {
  return {
    label: input.label,
    lat: input.lat,
    lng: input.lng,
    geohash: geohash(input.lat, input.lng),
    street: input.street,
    rt_rw: input.rt_rw || null,
    unit: input.unit || null,
    receiver_name: input.receiver_name,
    receiver_phone: input.receiver_phone,
    courier_note: input.courier_note || null,
  };
}

export const list = (userId: string): Promise<Address[]> => repo.list(pool, userId);

export async function create(userId: string, input: AddressInput): Promise<Address> {
  await assertInCoverage(pool, input.branch_id, input.lat, input.lng);
  return repo.insert(pool, userId, toWrite(input));
}

export async function update(userId: string, id: string, input: AddressInput): Promise<Address> {
  await assertInCoverage(pool, input.branch_id, input.lat, input.lng);
  const updated = await repo.update(pool, userId, id, toWrite(input));
  if (!updated) throw new AppError(404, "ADDRESS_NOT_FOUND", "Address not found");
  return updated;
}

export async function remove(userId: string, id: string): Promise<void> {
  try {
    if (!(await repo.remove(pool, userId, id))) throw new AppError(404, "ADDRESS_NOT_FOUND", "Address not found");
  } catch (err) {
    if ((err as { code?: string }).code === "23503") {
      throw new AppError(409, "ADDRESS_IN_USE", "Address is used by an existing order");
    }
    throw err;
  }
}
