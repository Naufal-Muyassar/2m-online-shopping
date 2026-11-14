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
import { Dialog } from "../../components/Dialog";
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
      <div className="border-y border-border py-3">
        <p className="t-label">Saldo saat ini</p>
        <p className="t-figure mt-1">{formatIDR(courier.balance)}</p>
      </div>
      <label className="field-label flex flex-col gap-1.5">
        Jumlah tunai (Rp)
        <input
          className="field tabular-nums"
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
        className="link -my-2 self-start text-sm disabled:opacity-60"
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
        <button className="btn btn-secondary" onClick={onClose} disabled={withdraw.isPending}>
          Batal
        </button>
        <button className="btn btn-primary" onClick={() => withdraw.mutate()} disabled={withdraw.isPending || amount <= 0 || tooMuch}>
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
        <ul className="-mr-2 max-h-[50dvh] divide-y divide-border overflow-y-auto border-y border-border pr-2 text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block break-words font-medium">{entryLabel(e)}</span>
                <span className="t-label mt-0.5 block tabular-nums">{dateTime(e.created_at)}</span>
              </span>
              <span className={cn("shrink-0 font-extrabold tabular-nums", e.amount > 0 && "text-success")}>
                {e.amount > 0 ? "+" : "−"}
                {formatIDR(Math.abs(e.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        {ledger.hasNextPage && (
          <button className="btn btn-secondary" onClick={() => void ledger.fetchNextPage()} disabled={ledger.isFetchingNextPage}>
            {ledger.isFetchingNextPage ? "Memuat…" : "Muat lagi"}
          </button>
        )}
        <button className="btn btn-secondary" onClick={onClose}>
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

  if (!branchId) return <p className="p-4 text-sm text-muted-foreground md:p-6">Pilih cabang…</p>;
  if (isLoading)
    return (
      <div className="space-y-3 p-4 md:p-6" role="status" aria-busy="true" aria-label="Memuat">
        <div className="skeleton h-10 w-48" />
        <div className="skeleton h-14" />
        <div className="skeleton h-14" />
      </div>
    );
  // A failed poll must not unmount an open dialog: its idempotency key is what stops a retry debiting twice.
  if (isError && !data)
    return (
      <div className="p-4 md:p-6">
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
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <h1 className="t-headline">Saldo kurir</h1>
        <p className="text-muted-foreground">
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
      {couriers.length > 0 && (
        <div className="card animate-rise overflow-hidden p-0 md:p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Partner</th>
                <th className="text-right">Saldo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {couriers.map((c) => (
                <tr key={c.user_id}>
                  <td data-primary>
                    <span className="flex items-center gap-3 font-bold">
                      <span className="avatar size-9 text-sm" aria-hidden="true">
                        {c.name.charAt(0)}
                      </span>
                      {c.name}
                    </span>
                  </td>
                  <td data-label="Partner">{c.partner_name}</td>
                  <td data-label="Saldo" className="text-base font-extrabold tabular-nums tracking-tight md:text-right">
                    {formatIDR(c.balance)}
                  </td>
                  <td data-actions className="md:whitespace-nowrap md:text-right">
                    <span className="inline-flex flex-wrap gap-2 md:justify-end">
                      <button className="btn btn-secondary btn-sm" onClick={() => setOpen({ dialog: "ledger", courierId: c.user_id })}>
                        Riwayat
                      </button>
                      {isBranchAdmin && (
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={c.balance <= 0}
                          onClick={() => setOpen({ dialog: "withdraw", courierId: c.user_id })}
                        >
                          Catat penarikan
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {couriers.length === 0 && (
        <div className="empty-state">
          <p>Belum ada kurir.</p>
        </div>
      )}
      {selected && open?.dialog === "withdraw" && <WithdrawDialog courier={selected} onClose={close} />}
      {selected && open?.dialog === "ledger" && <LedgerDialog courier={selected} onClose={close} />}
    </div>
  );
}
