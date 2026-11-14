import { Link } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { IconChat, IconChevron, IconLogout, IconReceipt } from "../../components/Icons";

export function AccountPage() {
  const { user, logout } = useAuth();

  return (
    <main className="app-main">
      <section className="flex animate-rise items-center gap-4 border-b border-foreground pb-5 md:pb-7">
        <span className="avatar size-16 text-2xl md:size-20 md:text-3xl">{user?.name.charAt(0)}</span>
        <div className="min-w-0">
          {/* truncate clips at the line box; the bottom padding keeps descenders (g, y, p) inside it. */}
          <h1 className="t-headline truncate pb-[0.14em] capitalize">{user?.name}</h1>
          <p className="t-label mt-1 tabular-nums">{user?.phone}</p>
        </div>
      </section>

      <nav aria-label="Menu akun" className="list animate-rise">
        <Link to="/orders" className="list-row font-semibold">
          <IconReceipt className="shrink-0 text-xl text-primary" />
          <span className="flex-1">Pesanan saya</span>
          <IconChevron className="row-arrow" />
        </Link>
        <Link to="/chat" className="list-row font-semibold">
          <IconChat className="shrink-0 text-xl text-primary" />
          <span className="flex-1">Chat toko</span>
          <IconChevron className="row-arrow" />
        </Link>
        <button type="button" onClick={() => void logout()} className="list-row font-semibold text-destructive">
          <IconLogout className="shrink-0 text-xl" />
          <span className="flex-1">Keluar</span>
        </button>
      </nav>
    </main>
  );
}
