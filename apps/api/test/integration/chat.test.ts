import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { pool } from "../../src/shared/db";
import { closeRedis } from "../../src/shared/redis";
import { createFixture, insertOrder, type Fixture } from "../../src/modules/orders/test-fixtures";
import { listBoardOrders } from "../../src/modules/admin/repo";
import * as chat from "../../src/modules/chat/service";
import type { Viewer } from "../../src/modules/chat/service";

let fx: Fixture;
let other: Fixture;
let customer: Viewer;
let courier: Viewer;
let admin: Viewer;
let otherAdmin: Viewer;
let otherCustomer: Viewer;

const say = (id: string, v: Viewer, body: string, clientId: string = randomUUID()) =>
  chat.send(id, { body, client_id: clientId }, v);

beforeAll(async () => {
  fx = await createFixture(pool);
  other = await createFixture(pool);
  customer = { userId: fx.users.customer, role: "customer", branchId: null };
  courier = { userId: fx.courierId, role: "courier", branchId: null };
  admin = { userId: fx.users.branch_admin, role: "branch_admin", branchId: fx.branchId };
  otherAdmin = { userId: other.users.branch_admin, role: "branch_admin", branchId: other.branchId };
  otherCustomer = { userId: other.users.customer, role: "customer", branchId: null };
});

afterAll(async () => {
  await pool.end();
  await closeRedis();
});

describe("customer and admin", () => {
  it("shares one thread, counts unread for the other side, and clears it on read", async () => {
    const thread = await chat.openThread({ channel: "customer_admin", branch_id: fx.branchId }, customer);
    expect(thread.title).toMatch(/^test-/);
    await say(thread.id, customer, "Stok beras ada?");

    const inbox = await chat.listThreads(admin, fx.branchId, "customer_admin");
    expect(inbox.threads.map((t) => t.id)).toContain(thread.id);
    const row = inbox.threads.find((t) => t.id === thread.id);
    expect(row?.unread_count).toBe(1);
    expect(row?.title).toContain("customer-");

    await chat.markRead(thread.id, admin);
    const after = await chat.listThreads(admin, fx.branchId, "customer_admin");
    expect(after.threads.find((t) => t.id === thread.id)?.unread_count).toBe(0);

    await say(thread.id, admin, "Ada, Kak");
    const own = await chat.messages(thread.id, customer);
    expect(own.messages.map((m) => m.mine)).toEqual([true, false]);
    expect(own.messages[1]?.sender_name).toMatch(/^Admin /);
  });

  it("reuses the same thread and sends a retried message once", async () => {
    const a = await chat.openThread({ channel: "customer_admin", branch_id: other.branchId }, otherCustomer);
    const b = await chat.openThread({ channel: "customer_admin", branch_id: other.branchId }, otherCustomer);
    expect(b.id).toBe(a.id);
    const clientId = randomUUID();
    await say(a.id, otherCustomer, "Halo", clientId);
    await say(a.id, otherCustomer, "Halo", clientId);
    expect((await chat.messages(a.id, otherCustomer)).messages).toHaveLength(1);
  });

  it("hides a thread from other customers and other branches", async () => {
    const thread = await chat.openThread({ channel: "customer_admin", branch_id: fx.branchId }, customer);
    await expect(chat.messages(thread.id, otherCustomer)).rejects.toMatchObject({ status: 404 });
    await expect(chat.messages(thread.id, otherAdmin)).rejects.toMatchObject({ status: 404 });
    await expect(chat.messages(thread.id, courier)).rejects.toMatchObject({ status: 404 });
  });
});

describe("courier and admin", () => {
  it("keeps courier threads apart from customer threads", async () => {
    const thread = await chat.openThread({ channel: "courier_admin" }, courier);
    await say(thread.id, courier, "Ban bocor");
    const couriers = await chat.listThreads(admin, fx.branchId, "courier_admin");
    const customers = await chat.listThreads(admin, fx.branchId, "customer_admin");
    expect(couriers.threads.map((t) => t.id)).toContain(thread.id);
    expect(customers.threads.map((t) => t.id)).not.toContain(thread.id);
  });

  it("does not let an admin reach a courier of another branch", async () => {
    await expect(chat.openThread({ channel: "courier_admin", courier_id: fx.courierId }, otherAdmin)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("customer and courier", () => {
  it("is private to the two of them and shows the courier by first name", async () => {
    const orderId = await insertOrder(pool, fx, "ON_DELIVERY");
    await pool.query(`UPDATE users SET name = 'Slamet Subagyo' WHERE id = $1`, [fx.courierId]);
    const thread = await chat.openThread({ channel: "customer_courier", order_id: orderId }, customer);
    expect(thread.title).toBe("Slamet");
    await say(thread.id, customer, "Titip di pos ya");
    await say(thread.id, courier, "Siap");

    expect((await chat.messages(thread.id, customer)).messages[1]?.sender_name).toBe("Slamet");
    await expect(chat.messages(thread.id, admin)).rejects.toMatchObject({ status: 404 });
    const inbox = await chat.listThreads(admin, fx.branchId);
    expect(inbox.threads.map((t) => t.id)).not.toContain(thread.id);
    await expect(chat.openThread({ channel: "customer_courier", order_id: orderId }, admin)).rejects.toMatchObject({ status: 403 });
  });

  it("closes for sending when the order ends but stays readable", async () => {
    const orderId = await insertOrder(pool, fx, "ON_DELIVERY");
    const thread = await chat.openThread({ channel: "customer_courier", order_id: orderId }, courier);
    await say(thread.id, courier, "Sudah di depan");
    await pool.query(`UPDATE orders SET status = 'DELIVERED' WHERE id = $1`, [orderId]);

    const after = await chat.messages(thread.id, customer);
    expect(after.thread.can_send).toBe(false);
    expect(after.messages).toHaveLength(1);
    await expect(say(thread.id, customer, "Terima kasih")).rejects.toMatchObject({ status: 409, code: "CHAT_CLOSED" });
  });

  it("drops a released courier from the conversation", async () => {
    const orderId = await insertOrder(pool, fx, "PICKING");
    const thread = await chat.openThread({ channel: "customer_courier", order_id: orderId }, courier);
    await pool.query(`UPDATE orders SET assigned_courier_id = NULL, status = 'ACCEPTED' WHERE id = $1`, [orderId]);
    await expect(chat.messages(thread.id, courier)).rejects.toMatchObject({ status: 404 });
    const inbox = await chat.listThreads(courier, null, "customer_courier");
    expect(inbox.threads.map((t) => t.id)).not.toContain(thread.id);
  });

  it("refuses an order that belongs to someone else or has no courier", async () => {
    const orderId = await insertOrder(pool, fx, "ON_DELIVERY");
    await expect(chat.openThread({ channel: "customer_courier", order_id: orderId }, otherCustomer)).rejects.toMatchObject({
      status: 404,
    });
    const waiting = await insertOrder(pool, fx, "ACCEPTED");
    await expect(chat.openThread({ channel: "customer_courier", order_id: waiting }, customer)).rejects.toMatchObject({
      status: 409,
      code: "NO_COURIER",
    });
  });
});

describe("admin board orders", () => {
  it("includes the receiver, area, and items", async () => {
    const orderId = await insertOrder(pool, fx, "ACCEPTED");
    const productId = (
      await pool.query(`INSERT INTO products (sku, name, unit, category, weight_kg) VALUES ($1, 'Beras', 'kg', 'beras', 1) RETURNING id`, [
        randomUUID(),
      ])
    ).rows[0].id as string;
    await pool.query(
      `INSERT INTO order_items (order_id, branch_id, product_id, sku, name, qty, unit_price, weight_kg)
       VALUES ($1, $2, $3, 'S', 'Beras', 2, 5000, 1)`,
      [orderId, fx.branchId, productId],
    );
    const order = (await listBoardOrders(pool, fx.branchId)).find((o) => o.id === orderId);
    expect(order).toMatchObject({ receiver_name: "test", area_hint: "test street", items: [{ name: "Beras", qty: 2 }] });
  });
});
