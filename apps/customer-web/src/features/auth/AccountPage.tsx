import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { IconChat, IconChevron, IconLogout, IconReceipt } from "../../components/Icons";

const row = "flex min-h-14 w-full items-center gap-3 rounded-full bg-surface px-4 font-medium shadow-sm hover:bg-muted";

export function AccountPage() {
  const { user, logout } = useAuth();

  return (
    <main className="app-main">
      <section className="flex flex-col items-center gap-2 rounded-2xl bg-hero px-4 py-8 text-primary-foreground">
        <span className="flex size-20 items-center justify-center rounded-full bg-surface text-3xl font-bold uppercase text-primary">
          {user?.name.charAt(0)}
        </span>
        <h1 className="text-xl font-bold capitalize">{user?.name}</h1>
        <p className="text-sm opacity-90">{user?.phone}</p>
      </section>

      <nav aria-label="Menu akun" className="flex flex-col gap-3">
        <Link to="/orders" className={row}>
          <IconReceipt className="text-xl text-primary" />
          <span className="flex-1">Pesanan saya</span>
          <IconChevron className="text-muted-foreground" />
        </Link>
        <Link to="/chat" className={row}>
          <IconChat className="text-xl text-primary" />
          <span className="flex-1">Chat toko</span>
          <IconChevron className="text-muted-foreground" />
        </Link>
        <button type="button" onClick={() => void logout()} className={`${row} text-left text-destructive`}>
          <IconLogout className="text-xl" />
          <span className="flex-1">Keluar</span>
        </button>
      </nav>
    </main>
  );
}
