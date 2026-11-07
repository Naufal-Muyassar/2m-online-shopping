import { useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TERMINAL_STATUSES,
  formatIDR,
  type AdminCouriersResponse,
  type AdminOrder,
  type AdminOrdersResponse,
  type ChatOpenRequest,
  type MetaConfigResponse,
} from "@2m/shared";
import { Segmented, useSwapX } from "../../components/Segmented";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { useBranch } from "../branch-config/BranchProvider";
import { OpenedChat } from "../chat/OpenedChat";
import { useBranchCouriers } from "../couriers/hooks";
import { BOARD_COLUMNS, BOARD_POLL_MS, COLUMN_LABELS, COLUMN_SHORT_LABELS, SLA_MINUTES, ageMinutes, type BoardColumn } from "./constants";
import { TrackingMap } from "./TrackingMap";

export const BOARD_KEY = "admin-orders";
// Couriers ping every 15 s while delivering, so a slower poll would leave the map pin visibly behind.
const MAP_POLL_MS = 5_000;

function useRefreshBoard() {
  const { branchId } = useBranch();
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: [BOARD_KEY, branchId] });
    void queryClient.invalidateQueries({ queryKey: ["admin-couriers", branchId] });
  };
}

export function Dialog({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-foreground/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="card w-full max-w-sm animate-rise space-y-4 p-5 shadow-lg">
        <h2 className="text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export const SECONDARY_BTN = "min-h-11 rounded-md border bg-surface px-4 py-2 font-medium hover:bg-muted disabled:opacity-60";
export const PRIMARY_BTN =
  "min-h-11 rounded-md bg-primary px-4 py-2 font-bold text-primary-foreground hover:bg-primary-pressed disabled:opacity-60";

const ORDER_PILL: Record<string, string> = {
  PENDING_PAYMENT: "pill-warning",
  PAID: "pill-info",
  ACCEPTED: "pill-info",
  PICKING: "pill-warning",
  ON_DELIVERY: "pill-primary",
  DELIVERED: "pill-success",
  FAILED: "pill-danger",
  CANCELLED: "pill-danger",
};

const STATUS_LABELS: Record<string, string> = {
  ...COLUMN_LABELS,
  PENDING_PAYMENT: "Menunggu bayar",
  DELIVERED: "Terkirim",
  FAILED: "Gagal kirim",
  CANCELLED: "Dibatalkan",
};

function AssignDialog({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  const { branchId } = useBranch();
  const toast = useToast();
  const refresh = useRefreshBoard();
  const [target, setTarget] = useState("");
  const couriers = useQuery({
    queryKey: ["admin-couriers", branchId],
    enabled: !!branchId,
    queryFn: async () =>
      (await api.get<AdminCouriersResponse>("/admin/couriers", { params: { branch_id: branchId } })).data,
  });
  const idle = couriers.data?.couriers.filter((c) => c.status === "IDLE") ?? [];

  const assign = useMutation({
    mutationFn: async () =>
      api.post(`/admin/orders/${order.id}/assign`, { courier_id: target, idempotency_key: crypto.randomUUID() }),
    onSuccess: () => {
      toast("success", `${order.code} ditugaskan`);
      refresh();
      onClose();
    },
    onError: (err) => toast("error", errorMessage(err)),
  });

  return (
    <Dialog title={`Tugaskan ${order.code}`}>
      <label className="field-label block">
        Kurir (IDLE)
        <select
          className="field mt-1"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={couriers.isLoading}
        >
          <option value="">Pilih kurir…</option>
          {idle.map((c) => (
            <option key={c.user_id} value={c.user_id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {couriers.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(couriers.error)}
        </p>
      )}
      {couriers.isSuccess && idle.length === 0 && <p className="notice">Tidak ada kurir IDLE.</p>}
      {assign.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(assign.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button className={SECONDARY_BTN} onClick={onClose} disabled={assign.isPending}>
          Batal
        </button>
        <button className={PRIMARY_BTN} onClick={() => assign.mutate()} disabled={assign.isPending || !target}>
          {assign.isPending ? "Memproses…" : "Tugaskan"}
        </button>
      </div>
    </Dialog>
  );
}

function ReleaseDialog({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  const toast = useToast();
  const refresh = useRefreshBoard();
  const [reason, setReason] = useState("");

  const release = useMutation({
    mutationFn: async () =>
      api.post(`/admin/orders/${order.id}/release`, { reason: reason.trim(), idempotency_key: crypto.randomUUID() }),
    onSuccess: () => {
      toast("success", `${order.code} kembali ke Menunggu kurir`);
      refresh();
      onClose();
    },
    onError: (err) => toast("error", errorMessage(err)),
  });

  return (
    <Dialog title={`Lepas kurir dari ${order.code}?`}>
      <p className="text-sm text-muted-foreground">
        Order kembali ke "Menunggu kurir"{order.assigned_courier ? ` dan ${order.assigned_courier.name} menjadi IDLE` : ""}.
      </p>
      <label className="field-label block">
        Alasan
        <textarea
          className="field mt-1"
          maxLength={200}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={release.isPending}
        />
      </label>
      {release.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(release.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button className={SECONDARY_BTN} onClick={onClose} disabled={release.isPending}>
          Batal
        </button>
        <button
          className="min-h-11 rounded-md bg-destructive px-4 py-2 font-bold text-destructive-foreground hover:opacity-90 disabled:opacity-60"
          onClick={() => release.mutate()}
          disabled={release.isPending || reason.trim() === ""}
        >
          {release.isPending ? "Memproses…" : "Lepas kurir"}
        </button>
      </div>
    </Dialog>
  );
}

function slaState(order: AdminOrder) {
  const age = ageMinutes(order.last_transition_at ?? order.created_at, Date.now());
  const column = BOARD_COLUMNS.find((c) => c === order.status);
  return { age, late: column !== undefined && age > SLA_MINUTES[column] };
}

function OrderActions({ order }: { order: AdminOrder }) {
  const { user } = useAuth();
  const toast = useToast();
  const refresh = useRefreshBoard();
  const [dialog, setDialog] = useState<"assign" | "release" | null>(null);
  const isBranchAdmin = user?.role === "branch_admin";

  const accept = useMutation({
    mutationFn: async () =>
      api.post(`/admin/orders/${order.id}/transition`, { to: "ACCEPTED", idempotency_key: crypto.randomUUID() }),
    onSuccess: () => {
      toast("success", `${order.code} diterima`);
      refresh();
    },
    onError: (err) => toast("error", errorMessage(err)),
  });

  const buttonClass = "w-full min-h-11 rounded-md px-3 py-2 font-bold disabled:opacity-60";

  return (
    <>
      {isBranchAdmin && order.status === "PAID" && (
        <button
          className={cn(buttonClass, "bg-primary text-primary-foreground hover:bg-primary-pressed")}
          disabled={accept.isPending}
          onClick={() => accept.mutate()}
        >
          {accept.isPending ? "Memproses…" : "Terima"}
        </button>
      )}
      {isBranchAdmin && order.status === "ACCEPTED" && (
        <button className={cn(buttonClass, "border bg-surface hover:bg-muted")} onClick={() => setDialog("assign")}>
          Tugaskan manual
        </button>
      )}
      {isBranchAdmin && order.status === "PICKING" && (
        <button
          className={cn(buttonClass, "bg-destructive-surface text-destructive hover:bg-destructive hover:text-destructive-foreground")}
          onClick={() => setDialog("release")}
        >
          Lepas kurir
        </button>
      )}
      {accept.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(accept.error)}
        </p>
      )}
      {dialog === "assign" && <AssignDialog order={order} onClose={() => setDialog(null)} />}
      {dialog === "release" && <ReleaseDialog order={order} onClose={() => setDialog(null)} />}
    </>
  );
}

function ForcePaidButton({ order }: { order: AdminOrder }) {
  const { branchId } = useBranch();
  const toast = useToast();
  const queryClient = useQueryClient();
  const demoMode =
    useQuery({
      queryKey: ["meta-config"],
      queryFn: async () => (await api.get<MetaConfigResponse>("/meta/config")).data,
      staleTime: Infinity,
    }).data?.demo_mode === true;
  const forcePaid = useMutation({
    mutationFn: async () => api.post(`/admin/orders/${order.id}/force-paid`, { idempotency_key: crypto.randomUUID() }),
    onSuccess: () => {
      toast("success", "Order ditandai PAID");
      void queryClient.invalidateQueries({ queryKey: [BOARD_KEY, branchId] });
    },
    onError: (err) => toast("error", errorMessage(err)),
  });

  if (!demoMode) return null;
  return (
    <button
      className="min-h-11 w-full rounded-md bg-destructive px-3 py-2 font-bold text-destructive-foreground hover:opacity-90 disabled:opacity-60"
      disabled={forcePaid.isPending}
      onClick={() => forcePaid.mutate()}
    >
      Tandai PAID (demo)
    </button>
  );
}

function RouteBlock({ order, selected, from }: { order: AdminOrder; selected: boolean; from: string }) {
  const stop = (label: string, value: string, hint?: string) => (
    <div className="min-w-0">
      <p className={cn("text-xs", selected ? "text-rail-muted" : "text-muted-foreground")}>{label}</p>
      <p className="truncate font-bold">{value}</p>
      {hint && <p className={cn("truncate text-xs", selected ? "text-rail-muted" : "text-muted-foreground")}>{hint}</p>}
    </div>
  );
  return (
    <div className={cn("mt-3 flex gap-3 rounded-2xl p-3", selected ? "bg-white/10" : "bg-muted/60")}>
      <div className="flex flex-col items-center py-1.5" aria-hidden="true">
        <span className={cn("size-2.5 rounded-full", selected ? "bg-surface" : "border-2 border-primary")} />
        <span className={cn("my-1 w-px flex-1 border-l border-dashed", selected ? "border-surface/60" : "border-input")} />
        <span className="size-2.5 rounded-full bg-promo" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {stop("Dikirim dari", from)}
        {stop("Tujuan", order.receiver_name, order.area_hint)}
      </div>
    </div>
  );
}

function TrackCard({ order, selected, from, onSelect }: { order: AdminOrder; selected: boolean; from: string; onSelect: () => void }) {
  const { age, late } = slaState(order);
  return (
    <li>
      <button
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "w-full rounded-[1.25rem] p-3.5 text-left text-sm transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.985]",
          selected ? "bg-hero text-primary-foreground" : "bg-surface shadow-sm hover:shadow-md",
          late && !selected && "bg-destructive-surface ring-1 ring-destructive",
          late && selected && "ring-2 ring-destructive",
        )}
      >
        <span className="flex items-center justify-between gap-2 font-bold">
          <span className="truncate tabular-nums">{order.code}</span>
          <span className={cn("pill pill-dot shrink-0", ORDER_PILL[order.status])}>{STATUS_LABELS[order.status] ?? order.status}</span>
        </span>
        <span className="mt-3 flex items-center gap-2">
          <span className={cn("avatar size-9 text-sm", selected && "bg-none bg-white/15")} aria-hidden="true">
            {order.assigned_courier?.name.charAt(0) ?? "?"}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-semibold">{order.assigned_courier?.name ?? "Belum ada kurir"}</span>
            <span
              className={cn(
                "block text-xs",
                late ? (selected ? "font-semibold text-surface" : "font-semibold text-destructive") : selected ? "text-rail-muted" : "text-muted-foreground",
              )}
            >
              {age} mnt di status ini{late ? ", melewati SLA" : ""}
            </span>
          </span>
        </span>
        <RouteBlock order={order} selected={selected} from={from} />
      </button>
    </li>
  );
}

function OrderChat({ input, empty }: { input: ChatOpenRequest | null; empty: string }) {
  if (!input) {
    return (
      <div className="empty-state m-auto w-full">
        <p>{empty}</p>
      </div>
    );
  }
  return <OpenedChat key={input.order_id ?? input.courier_id} input={input} />;
}

type PanelTab = "detail" | "courier" | "customer";

const PANEL_TABS: { id: PanelTab; label: string }[] = [
  { id: "detail", label: "Detail" },
  { id: "courier", label: "Chat kurir" },
  { id: "customer", label: "Chat pelanggan" },
];

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}

function OrderPanel({ order, from }: { order: AdminOrder; from: string }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<PanelTab>("detail");
  const swapX = useSwapX(PANEL_TABS.findIndex((t) => t.id === tab));
  const { age } = slaState(order);
  const courier = order.assigned_courier;

  return (
    <section
      className="material relative z-[600] flex min-h-[28rem] flex-col gap-3 rounded-[1.75rem] p-4 xl:absolute xl:bottom-3 xl:right-3 xl:top-3 xl:min-h-0 xl:w-[24rem]"
      aria-label={`Order ${order.code}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold tabular-nums">{order.code}</h2>
        <span className={cn("pill pill-dot", ORDER_PILL[order.status])}>{STATUS_LABELS[order.status] ?? order.status}</span>
      </div>
      <Segmented label="Panel order" value={tab} onChange={setTab} items={PANEL_TABS} />

      <div key={tab} className="swap-in flex min-h-0 flex-1 flex-col" style={{ "--swap-x": swapX } as CSSProperties}>
        {tab === "detail" && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <dl className="divide-y">
              <DetailRow label="Dikirim dari">{from}</DetailRow>
              <DetailRow label="Penerima">{order.receiver_name}</DetailRow>
              <DetailRow label="Area">{order.area_hint}</DetailRow>
              <DetailRow label="Kurir">{courier?.name ?? "Belum ada kurir"}</DetailRow>
              <DetailRow label="Di status ini">{age} mnt</DetailRow>
            </dl>
            <div>
              <h3 className="mb-1 font-bold">Barang</h3>
              <ul className="divide-y text-sm">
                {order.items.map((item) => (
                  <li key={item.name} className="flex justify-between gap-3 py-2">
                    <span>{item.name}</span>
                    <span className="font-bold tabular-nums">×{item.qty}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex justify-between border-t pt-2 text-lg font-bold">
                <span>Total</span>
                <span className="tabular-nums">{formatIDR(order.grand_total)}</span>
              </p>
            </div>
            <div className="mt-auto space-y-2">
              <OrderActions order={order} />
              {user?.role === "super_admin" && order.status === "PENDING_PAYMENT" && <ForcePaidButton order={order} />}
            </div>
          </div>
        )}
        {tab === "courier" && (
          <OrderChat
            input={courier ? { channel: "courier_admin", courier_id: courier.user_id } : null}
            empty="Belum ada kurir di order ini."
          />
        )}
        {tab === "customer" && <OrderChat input={{ channel: "customer_admin", order_id: order.id }} empty="" />}
      </div>
    </section>
  );
}

type ListTab = BoardColumn | "PENDING_PAYMENT" | "DONE";

const TAB_ORDER: ListTab[] = ["PENDING_PAYMENT", ...BOARD_COLUMNS, "DONE"];

const EMPTY_TEXT: Record<ListTab, string> = {
  PENDING_PAYMENT: "Tidak ada order yang menunggu pembayaran.",
  PAID: "Order baru muncul di sini setelah pelanggan membayar.",
  ACCEPTED: "Tidak ada order yang menunggu kurir.",
  PICKING: "Tidak ada order yang sedang disiapkan.",
  ON_DELIVERY: "Tidak ada order yang sedang diantar.",
  DONE: "Order yang selesai hari ini muncul di sini.",
};

function matches(order: AdminOrder, query: string) {
  const q = query.trim().toLowerCase();
  return !q || order.code.toLowerCase().includes(q) || order.receiver_name.toLowerCase().includes(q);
}

export function LiveBoard({ search }: { search: string }) {
  const { user } = useAuth();
  const { branchId, branchName, branches } = useBranch();
  const [tab, setTab] = useState<ListTab>("PAID");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const couriers = useBranchCouriers(MAP_POLL_MS);
  const swapX = useSwapX(TAB_ORDER.indexOf(tab));
  const { data, isLoading, isError, error } = useQuery({
    queryKey: [BOARD_KEY, branchId],
    enabled: !!branchId,
    refetchInterval: BOARD_POLL_MS,
    queryFn: async () =>
      (await api.get<AdminOrdersResponse>("/admin/orders", { params: { branch_id: branchId } })).data,
  });

  if (!branchId) return <p className="p-4 text-sm text-muted-foreground">Pilih cabang…</p>;
  if (isLoading)
    return (
      <div className="grid gap-4 p-4 lg:grid-cols-[24rem_minmax(0,1fr)]" role="status" aria-busy="true" aria-label="Memuat">
        <div className="skeleton h-96" />
        <div className="skeleton h-96" />
      </div>
    );
  if (isError)
    return (
      <div className="p-4">
        <p className="alert-box" role="alert">
          {errorMessage(error)}
        </p>
      </div>
    );

  const orders = (data?.orders ?? []).filter((o) => matches(o, search));
  const inTab = (t: ListTab) =>
    orders.filter((o) => (t === "DONE" ? TERMINAL_STATUSES.includes(o.status) : o.status === t));
  const showPending = user?.role === "super_admin" && inTab("PENDING_PAYMENT").length > 0;
  const tabs: { id: ListTab; short: string; title: string }[] = [
    ...(showPending ? [{ id: "PENDING_PAYMENT" as const, short: "Bayar", title: "Menunggu bayar" }] : []),
    ...BOARD_COLUMNS.map((c) => ({ id: c, short: COLUMN_SHORT_LABELS[c], title: COLUMN_LABELS[c] })),
    { id: "DONE", short: "Selesai", title: "Selesai" },
  ];
  const items = inTab(tab);
  const selected = items.find((o) => o.id === selectedId) ?? items[0] ?? null;
  const from = branchName ?? "Cabang";
  const branch = branches.find((b) => b.id === branchId) ?? null;

  return (
    <div className="grid gap-4 p-4 lg:h-[calc(100dvh-5rem)] lg:grid-cols-[24rem_minmax(0,1fr)]">
      <section className="card flex min-h-0 flex-col gap-3 shadow-md">
        <h1 className="text-2xl font-bold">Tracking order</h1>
        <Segmented
          label="Status order"
          value={tab}
          onChange={setTab}
          items={tabs.map((t) => ({
            id: t.id,
            title: `${t.title}: ${inTab(t.id).length}`,
            label: (
              <>
                <span className="text-base font-bold leading-tight tabular-nums">{inTab(t.id).length}</span>
                <span className="max-w-full truncate text-[0.6875rem] font-semibold leading-tight">{t.short}</span>
              </>
            ),
          }))}
        />
        <ul
          key={tab}
          className="swap-in -mx-1 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-1 pb-1"
          style={{ "--swap-x": swapX } as CSSProperties}
        >
          {items.map((o) => (
            <TrackCard key={o.id} order={o} selected={o.id === selected?.id} from={from} onSelect={() => setSelectedId(o.id)} />
          ))}
          {items.length === 0 && (
            <li className="empty-state my-auto">
              <p>{search.trim() ? "Tidak ada order yang cocok." : EMPTY_TEXT[tab]}</p>
            </li>
          )}
        </ul>
      </section>

      <div className="flex min-h-0 flex-col gap-4 xl:relative">
        <div className="relative isolate h-72 shrink-0 overflow-hidden rounded-[1.75rem] shadow-md lg:h-auto lg:min-h-64 lg:flex-1 xl:absolute xl:inset-0">
          <TrackingMap order={selected} couriers={couriers.data?.couriers ?? []} branch={branch} />
        </div>
        {selected && <OrderPanel key={selected.id} order={selected} from={from} />}
      </div>
    </div>
  );
}
