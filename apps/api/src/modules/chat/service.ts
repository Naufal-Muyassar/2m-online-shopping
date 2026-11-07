import type {
  ChatChannel,
  ChatMessage,
  ChatMessagesResponse,
  ChatOpenRequest,
  ChatSendRequest,
  ChatSenderRole,
  ChatThread,
  ChatThreadsResponse,
  OrderStatus,
  Role,
} from "@2m/shared";
import { pool } from "../../shared/db";
import { AppError } from "../../shared/errors";
import * as repo from "./repo";

export interface Viewer {
  userId: string;
  role: Role;
  // A branch_admin's own branch; null for everyone else.
  branchId: string | null;
}

const MESSAGE_LIMIT = 200;

// The customer and courier can only write to each other while the order is under way.
const OPEN_FOR_CHAT: readonly OrderStatus[] = ["PICKING", "READY", "ASSIGNED", "ON_DELIVERY"];

const senderRole = (role: Role): ChatSenderRole => (role === "customer" || role === "courier" ? role : "admin");
const notFound = () => new AppError(404, "NOT_FOUND", "Chat not found");
const firstName = (name: string | null) => (name ?? "Kurir").trim().split(/\s+/)[0] ?? "Kurir";

function canView(t: repo.ThreadRow, v: Viewer): boolean {
  const assigned = t.channel !== "customer_courier" || t.assigned_courier_id === t.courier_id;
  if (v.role === "customer") return t.customer_id === v.userId && assigned;
  if (v.role === "courier") return t.courier_id === v.userId && assigned;
  if (t.channel === "customer_courier") return false;
  return v.role === "super_admin" || t.branch_id === v.branchId;
}

function titleFor(t: repo.ThreadRow, role: ChatSenderRole): string {
  if (t.channel === "customer_courier") {
    return role === "customer" ? firstName(t.courier_name) : (t.receiver_name ?? "Pelanggan");
  }
  if (role === "admin") return (t.channel === "customer_admin" ? t.customer_name : t.courier_name) ?? "Pengguna";
  return t.channel === "customer_admin" ? t.branch_name : `Admin ${t.branch_name}`;
}

function canSend(t: repo.ThreadRow): boolean {
  if (t.channel !== "customer_courier") return true;
  return t.order_status !== null && OPEN_FOR_CHAT.includes(t.order_status) && t.assigned_courier_id === t.courier_id;
}

function toThread(t: repo.ThreadRow, role: ChatSenderRole): ChatThread {
  return {
    id: t.id,
    channel: t.channel,
    branch_id: t.branch_id,
    order_id: t.order_id,
    order_code: t.order_code,
    title: titleFor(t, role),
    can_send: canSend(t),
    unread_count: t.unread_count,
    last_message:
      t.last_body !== null && t.last_at
        ? { body: t.last_body, at: t.last_at.toISOString(), mine: t.last_sender_role === role }
        : null,
  };
}

function senderName(m: repo.MessageRow, t: repo.ThreadRow, role: ChatSenderRole): string {
  if (m.sender_role === "admin" && role !== "admin") return `Admin ${t.branch_name}`;
  // Customers know their courier by first name only, as on the order page.
  if (m.sender_role === "courier" && role === "customer") return firstName(m.sender_name);
  return m.sender_name;
}

function toMessage(m: repo.MessageRow, t: repo.ThreadRow, role: ChatSenderRole): ChatMessage {
  return {
    id: m.id,
    sender_role: m.sender_role,
    sender_name: senderName(m, t, role),
    body: m.body,
    mine: m.sender_role === role,
    created_at: m.created_at.toISOString(),
  };
}

async function loadThread(id: string, v: Viewer): Promise<repo.ThreadRow> {
  const thread = await repo.getThread(pool, id, senderRole(v.role));
  if (!thread || !canView(thread, v)) throw notFound();
  return thread;
}

export async function listThreads(v: Viewer, adminBranchId: string | null, channel?: ChatChannel): Promise<ChatThreadsResponse> {
  const role = senderRole(v.role);
  const rows = await repo.listThreads(pool, { role, userId: v.userId, branchId: adminBranchId }, channel);
  return { threads: rows.map((t) => toThread(t, role)) };
}

async function customerCourierTarget(orderId: string | undefined, v: Viewer) {
  if (v.role !== "customer" && v.role !== "courier") throw new AppError(403, "FORBIDDEN", "This chat is private");
  if (!orderId) throw new AppError(400, "VALIDATION_ERROR", "order_id is required");
  const order = await repo.findOrder(pool, orderId);
  const mine = v.role === "customer" ? order?.customer_id === v.userId : order?.assigned_courier_id === v.userId;
  if (!order || !mine) throw notFound();
  if (!order.assigned_courier_id) throw new AppError(409, "NO_COURIER", "Order has no courier yet");
  return {
    channel: "customer_courier" as const,
    branchId: order.branch_id,
    customerId: order.customer_id,
    courierId: order.assigned_courier_id,
    orderId,
  };
}

async function customerAdminTarget(req: ChatOpenRequest, v: Viewer) {
  if (v.role === "courier") throw new AppError(403, "FORBIDDEN", "Couriers have no customer-admin chat");
  if (v.role === "customer") {
    if (!req.branch_id) throw new AppError(400, "VALIDATION_ERROR", "branch_id is required");
    if (!(await repo.branchExists(pool, req.branch_id))) throw notFound();
    return { channel: "customer_admin" as const, branchId: req.branch_id, customerId: v.userId };
  }
  // An admin starts the conversation from an order of their branch.
  if (!req.order_id) throw new AppError(400, "VALIDATION_ERROR", "order_id is required");
  const order = await repo.findOrder(pool, req.order_id);
  if (!order || (v.role === "branch_admin" && order.branch_id !== v.branchId)) throw notFound();
  return { channel: "customer_admin" as const, branchId: order.branch_id, customerId: order.customer_id };
}

async function courierAdminTarget(req: ChatOpenRequest, v: Viewer) {
  if (v.role === "customer") throw new AppError(403, "FORBIDDEN", "Customers have no courier-admin chat");
  const courierId = v.role === "courier" ? v.userId : req.courier_id;
  if (!courierId) throw new AppError(400, "VALIDATION_ERROR", "courier_id is required");
  const branchId = await repo.findCourierBranch(pool, courierId);
  if (!branchId || (v.role === "branch_admin" && branchId !== v.branchId)) throw notFound();
  return { channel: "courier_admin" as const, branchId, courierId };
}

function targetFor(req: ChatOpenRequest, v: Viewer) {
  if (req.channel === "customer_courier") return customerCourierTarget(req.order_id, v);
  return req.channel === "customer_admin" ? customerAdminTarget(req, v) : courierAdminTarget(req, v);
}

export async function openThread(req: ChatOpenRequest, v: Viewer): Promise<ChatThread> {
  const id = await repo.openThread(pool, await targetFor(req, v));
  return toThread(await loadThread(id, v), senderRole(v.role));
}

export async function messages(id: string, v: Viewer): Promise<ChatMessagesResponse> {
  const thread = await loadThread(id, v);
  const role = senderRole(v.role);
  const rows = await repo.listMessages(pool, id, MESSAGE_LIMIT);
  return { thread: toThread(thread, role), messages: rows.map((m) => toMessage(m, thread, role)) };
}

export async function send(id: string, req: ChatSendRequest, v: Viewer): Promise<ChatMessage> {
  const thread = await loadThread(id, v);
  if (!canSend(thread)) throw new AppError(409, "CHAT_CLOSED", "Chat ditutup karena pesanan sudah selesai");
  const role = senderRole(v.role);
  const row = await repo.insertMessage(pool, {
    threadId: id,
    senderId: v.userId,
    role,
    body: req.body,
    clientId: req.client_id,
  });
  return toMessage(row, thread, role);
}

export async function markRead(id: string, v: Viewer): Promise<void> {
  await loadThread(id, v);
  await repo.markRead(pool, id, senderRole(v.role));
}
