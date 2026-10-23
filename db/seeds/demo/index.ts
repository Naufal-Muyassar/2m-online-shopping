import { BRANCH, DEMO_ORDERS, DELIVERY_FEE, DEMO_STOCK_OVERRIDES, PRODUCTS, USERS } from "./constants";

// Every demo product starts with this many units in the stock_snapshots stand-in.
const DEMO_STOCK_QTY = 200;

export interface Db {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export async function seedBase(db: Db, passwordHash: string): Promise<void> {
  const branch = (
    await db.query(
      `INSERT INTO branches (name, lat, lng, service_radius_m, erp_branch_id, courier_capacity)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [BRANCH.name, BRANCH.lat, BRANCH.lng, BRANCH.serviceRadiusM, BRANCH.erpBranchId, BRANCH.courierCapacity],
    )
  ).rows[0].id as string;

  await db.query(
    `INSERT INTO branch_pricing_config
       (branch_id, base_fee, per_km, free_km, weight_threshold_kg, surcharge_per_kg, fee_min, fee_max, min_order,
        pricing_model, wage_base, wage_per_km, failed_rate, failed_pay_fraction, failed_fee_charged_fraction,
        overhead_per_day, drops_per_day, round_to, cap_min_fee, cap_free_km, cap_per_km)
     VALUES ($1, 5000, 2000, 1, 20, 500, 5000, 30000, 30000,
             'ds_v2', 3500, 1500, 0.03, 0.5, 0, 10000, 15, 500, 7500, 4, 1333.33)`,
    [branch],
  );
  await db.query(
    `INSERT INTO branch_limits (branch_id, max_qty_per_sku_default, max_order_weight_kg, heavy_order_threshold_kg)
     VALUES ($1, 20, 80, 40)`,
    [branch],
  );

  const partner = (
    await db.query(
      `INSERT INTO courier_partners (name, fee_per_drop, contract_ref) VALUES ('Mitra Kurir Demo', 8000, 'DEMO-001') RETURNING id`,
    )
  ).rows[0].id as string;

  const insertUser = async (
    role: string,
    name: string,
    phone: string,
    email: string | null,
    branchId: string | null,
  ): Promise<string> =>
    (
      await db.query(
        `INSERT INTO users (role, name, phone, email, password_hash, branch_id)
         VALUES ($1::user_role,$2,$3,$4,$5,$6) RETURNING id`,
        [role, name, phone, email, passwordHash, branchId],
      )
    ).rows[0].id;

  await insertUser("super_admin", USERS.superAdmin.name, USERS.superAdmin.phone, USERS.superAdmin.email, null);
  await insertUser("branch_admin", USERS.branchAdmin.name, USERS.branchAdmin.phone, USERS.branchAdmin.email, branch);

  for (const c of USERS.couriers) {
    const id = await insertUser("courier", c.name, c.phone, null, branch);
    await db.query(
      `INSERT INTO couriers (user_id, partner_id, branch_id, status, last_status_change, motor_code, motor_cluster)
       VALUES ($1,$2,$3,'IDLE', now() - make_interval(mins => $4), $5, $6)`,
      [id, partner, branch, c.minutesIdle, c.motorCode, c.motorCluster],
    );
  }

  for (const c of USERS.customers) {
    const id = await insertUser("customer", c.name, c.phone, null, null);
    await db.query(
      `INSERT INTO addresses (user_id, label, lat, lng, street, rt_rw, receiver_name, receiver_phone)
       VALUES ($1,'Rumah',$2,$3,$4,$5,$6,$7)`,
      [id, BRANCH.lat + c.address.dLat, BRANCH.lng + c.address.dLng, c.address.street, c.address.rtRw, c.address.receiver, c.phone],
    );
  }

  let displayOrder = 0;
  for (const [sku, name, unit, category, weight, price] of PRODUCTS) {
    const productId = (
      await db.query(
        `INSERT INTO products (sku, name, unit, category, weight_kg) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [sku, name, unit, category, weight],
      )
    ).rows[0].id as string;
    await db.query(
      `INSERT INTO branch_products (branch_id, product_id, price, display_order) VALUES ($1,$2,$3,$4)`,
      [branch, productId, price, displayOrder++],
    );
    await db.query(`INSERT INTO stock_snapshots (branch_id, product_id, qty) VALUES ($1,$2,$3)`, [
      branch,
      productId,
      DEMO_STOCK_OVERRIDES[sku] ?? DEMO_STOCK_QTY,
    ]);
  }
}

// Inserts orders directly in PAID: seed-only bootstrap, not a transition() call.
export async function seedDemoOrders(db: Db): Promise<void> {
  const branch = (await db.query(`SELECT id FROM branches LIMIT 1`)).rows[0].id as string;
  const customers = (await db.query(`SELECT id FROM users WHERE role = 'customer' ORDER BY phone`)).rows;

  let n = 1;
  for (const o of DEMO_ORDERS) {
    const customer = customers[o.customer];
    const addressId = (await db.query(`SELECT id FROM addresses WHERE user_id = $1`, [customer.id])).rows[0].id;
    const items = (
      await db.query(
        `SELECT p.id, p.sku, p.name, p.weight_kg, bp.price
         FROM products p JOIN branch_products bp ON bp.product_id = p.id AND bp.branch_id = $1
         WHERE p.sku = ANY($2)`,
        [branch, o.items.map(([sku]) => sku)],
      )
    ).rows;
    const qtyBySku = new Map(o.items);
    const subtotal = items.reduce((sum, i) => sum + i.price * (qtyBySku.get(i.sku) ?? 0), 0);

    const orderId = (
      await db.query(
        `INSERT INTO orders (code, branch_id, customer_id, address_id, status, subtotal, delivery_fee, grand_total,
                             pricing_snapshot, payment_method)
         VALUES ($1,$2,$3,$4,'PAID',$5,$6,$7,$8,'DEMO') RETURNING id`,
        [
          `DEMO-${String(n++).padStart(3, "0")}`,
          branch,
          customer.id,
          addressId,
          subtotal,
          DELIVERY_FEE,
          subtotal + DELIVERY_FEE,
          JSON.stringify({ subtotal, delivery_fee: DELIVERY_FEE }),
        ],
      )
    ).rows[0].id as string;

    for (const i of items) {
      await db.query(
        `INSERT INTO order_items (order_id, branch_id, product_id, sku, name, qty, unit_price, weight_kg)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [orderId, branch, i.id, i.sku, i.name, qtyBySku.get(i.sku), i.price, i.weight_kg],
      );
    }

    await db.query(
      `INSERT INTO order_state_transitions (order_id, branch_id, from_status, to_status, actor_role, reason)
       VALUES ($1,$2,NULL,'PAID','system','demo seed')`,
      [orderId, branch],
    );
  }
}
