import { useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  formatIDR,
  type AdminCourier,
  type CourierLedgerEntry,
  type CourierLedgerResponse,
  type CourierWithdrawalRequest,
  type CourierWithdrawalResponse,
} from "@2m/shared";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/toast";
import { cn } from "../../lib/utils";
import { useBranch } from "../branch-config/BranchProvider";
import { Dialog, PRIMARY_BTN, SECONDARY_BTN } from "../live-board/LiveBoard";
import { useBranchCouriers } from "./hooks";

const LEDGER_KEY = "admin-courier-ledger";

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function WithdrawDialog({ courier, onClose }: { courier: AdminCourier; onClose: () => void }) {
  const { branchId } = useBranch();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [digits, setDigits] = useState("");
  // One key per dialog: a retry after a lost response cannot debit twice.
  const idempotencyKey = useRef(crypto.randomUUID());
  const amount = Number(digits);
  const tooMuch = amount > courier.balance;

  const withdraw = useMutation({
    mutationFn: async () => {
      const body: CourierWithdrawalRequest = { amount, idempotency_key: idempotencyKey.current };
      return (await api.post<CourierWithdrawalResponse>(`/admin/couriers/${courier.user_id}/withdrawals`, body)).data;
    },
    onSuccess: (res) => {
      toast("success", `Penarikan ${formatIDR(res.amount)} untuk ${courier.name} tercatat`);
      onClose();
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-couriers", branchId] });
      void queryClient.invalidateQueries({ queryKey: [LEDGER_KEY, branchId, courier.user_id] });
    },
  });

  return (
    <Dialog title={`Catat penarikan ${courier.name}`}>
      <p className="text-sm text-muted-foreground">
        Saldo saat ini <span className="font-bold text-foreground">{formatIDR(courier.balance)}</span>
      </p>
      <label className="field-label block">
        Jumlah tunai (Rp)
        <input
          className="field mt-1 tabular-nums"
          inputMode="numeric"
          autoComplete="off"
          maxLength={12}
          value={digits}
          onChange={(e) => setDigits(e.target.value.replace(/\D/g, ""))}
          disabled={withdraw.isPending}
        />
      </label>
      <button
        type="button"
        className="text-sm font-medium text-primary underline disabled:opacity-60"
        onClick={() => setDigits(String(courier.balance))}
        disabled={withdraw.isPending}
      >
        Tarik semua saldo
      </button>
      {tooMuch && (
        <p className="alert-box" role="alert">
          Jumlah melebihi saldo kurir.
        </p>
      )}
      {withdraw.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(withdraw.error)}
        </p>
      )}
      <p className="notice">Catat setelah uang tunai diserahkan. Penarikan yang sudah dicatat tidak bisa dibatalkan.</p>
      <div className="flex justify-end gap-2">
        <button className={SECONDARY_BTN} onClick={onClose} disabled={withdraw.isPending}>
          Batal
        </button>
        <button className={PRIMARY_BTN} onClick={() => withdraw.mutate()} disabled={withdraw.isPending || amount <= 0 || tooMuch}>
          {withdraw.isPending ? "Memproses…" : amount > 0 ? `Catat ${formatIDR(amount)}` : "Catat"}
        </button>
      </div>
    </Dialog>
  );
}

function entryLabel(entry: CourierLedgerEntry): string {
  if (entry.type === "WITHDRAWAL") return `Tarik tunai, dicatat ${entry.recorded_by_name ?? "admin"}`;
  return `${entry.order_code ?? "Pesanan"}${entry.order_status === "FAILED" ? " (gagal kirim)" : ""}`;
}

function LedgerDialog({ courier, onClose }: { courier: AdminCourier; onClose: () => void }) {
  const { branchId } = useBranch();
  const ledger = useInfiniteQuery({
    queryKey: [LEDGER_KEY, branchId, courier.user_id],
    queryFn: async ({ pageParam }) =>
      (
        await api.get<CourierLedgerResponse>(`/admin/couriers/${courier.user_id}/ledger`, {
          params: { branch_id: branchId, cursor: pageParam, limit: 20 },
        })
      ).data,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
  const entries = ledger.data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <Dialog title={`Riwayat saldo ${courier.name}`}>
      {ledger.isLoading && <div className="skeleton h-24" role="status" aria-busy="true" aria-label="Memuat" />}
      {ledger.isError && (
        <p className="alert-box" role="alert">
          {errorMessage(ledger.error)}
        </p>
      )}
      {ledger.isSuccess && entries.length === 0 && <p className="notice">Belum ada riwayat.</p>}
      {entries.length > 0 && (
        <ul className="max-h-[50dvh] divide-y overflow-y-auto text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block break-words">{entryLabel(e)}</span>
                <span className="block text-xs text-muted-foreground">{dateTime(e.created_at)}</span>
              </span>
              <span className={cn("shrink-0 font-bold tabular-nums", e.amount > 0 && "text-success")}>
                {e.amount > 0 ? "+" : "−"}
                {formatIDR(Math.abs(e.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        {ledger.hasNextPage && (
          <button className={SECONDARY_BTN} onClick={() => void ledger.fetchNextPage()} disabled={ledger.isFetchingNextPage}>
            {ledger.isFetchingNextPage ? "Memuat…" : "Muat lagi"}
          </button>
        )}
        <button className={SECONDARY_BTN} onClick={onClose}>
          Tutup
        </button>
      </div>
    </Dialog>
  );
}

export function BalanceTab() {
  const { user } = useAuth();
  const { branchId } = useBranch();
  const isBranchAdmin = user?.role === "branch_admin";
  const [open, setOpen] = useState<{ dialog: "withdraw" | "ledger"; courierId: string } | null>(null);

  const { data, isLoading, isError, error } = useBranchCouriers();

  if (!branchId) return <p className="p-4 text-sm text-muted-foreground">Pilih cabang…</p>;
  if (isLoading)
    return (
      <div className="space-y-3 p-4" role="status" aria-busy="true" aria-label="Memuat">
        <div className="skeleton h-12" />
        <div className="skeleton h-12" />
      </div>
    );
  // A failed poll must not unmount an open dialog: its idempotency key is what stops a retry debiting twice.
  if (isError && !data)
    return (
      <div className="p-4">
        <p className="alert-box" role="alert">
          {errorMessage(error)}
        </p>
      </div>
    );

  const couriers = data?.couriers ?? [];
  // Looked up on every render, so an open dialog follows the polled balance.
  const selected = couriers.find((c) => c.user_id === open?.courierId);
  const close = () => setOpen(null);

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold">Saldo kurir</h1>
        <p className="text-sm text-muted-foreground">
          {isBranchAdmin
            ? "Catat penarikan saat kurir mengambil tunai di cabang."
            : "Hanya admin cabang yang bisa mencatat penarikan."}
        </p>
      </div>
      {isError && (
        <p className="alert-box" role="alert">
          Gagal memperbarui saldo. Angka di bawah mungkin sudah lama.
        </p>
      )}
      <div className="card animate-rise overflow-x-auto p-0 shadow-md">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-2">Partner</th>
              <th className="px-2 text-right">Saldo</th>
              <th className="px-4" />
            </tr>
          </thead>
          <tbody>
            {couriers.map((c) => (
              <tr key={c.user_id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-bold">{c.name}</td>
                <td className="px-2">{c.partner_name}</td>
                <td className="px-2 text-right font-bold tabular-nums">{formatIDR(c.balance)}</td>
                <td className="space-x-2 whitespace-nowrap px-4 py-2 text-right">
                  <button className={SECONDARY_BTN} onClick={() => setOpen({ dialog: "ledger", courierId: c.user_id })}>
                    Riwayat
                  </button>
                  {isBranchAdmin && (
                    <button
                      className={PRIMARY_BTN}
                      disabled={c.balance <= 0}
                      onClick={() => setOpen({ dialog: "withdraw", courierId: c.user_id })}
                    >
                      Catat penarikan
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {couriers.length === 0 && (
        <div className="empty-state mt-4">
          <p>Belum ada kurir.</p>
        </div>
      )}
      {selected && open?.dialog === "withdraw" && <WithdrawDialog courier={selected} onClose={close} />}
      {selected && open?.dialog === "ledger" && <LedgerDialog courier={selected} onClose={close} />}
    </div>
  );
}
