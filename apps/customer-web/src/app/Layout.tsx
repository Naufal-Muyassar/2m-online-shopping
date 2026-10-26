import type { CSSProperties, ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation, useMatch } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/queries";
import { cn } from "../lib/utils";
import { IconCart, IconReceipt, IconStore } from "../components/Icons";
import { PageSkeleton } from "../components/States";

function CartCount({ branchId }: { branchId: string }) {
  const { data } = useCart(branchId);
  const count = data?.items.reduce((n, i) => n + i.qty, 0) ?? 0;
  if (count <= 0) return null;
  return (
    <span className="absolute right-[18%] top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">
      {count}
    </span>
  );
}

interface Tab {
  key: string;
  to: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  badge?: ReactNode;
}

const headerButton =
  "inline-flex min-h-11 shrink-0 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-muted";

export function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const branchId = useMatch("/b/:branchId/*")?.params.branchId;
  const wide = useMatch({ path: "/b/:branchId", end: true }) !== null;

  const tabs: Tab[] = [];
  if (branchId) {
    tabs.push({ key: "catalog", to: `/b/${branchId}`, label: "Katalog", icon: <IconStore />, active: pathname === `/b/${branchId}` });
    if (user) {
      tabs.push({
        key: "cart",
        to: `/b/${branchId}/cart`,
        label: "Keranjang",
        icon: <IconCart />,
        active: pathname === `/b/${branchId}/cart`,
        badge: <CartCount branchId={branchId} />,
      });
    }
  }
  if (user) tabs.push({ key: "orders", to: "/orders", label: "Pesanan saya", icon: <IconReceipt />, active: pathname.startsWith("/orders") });
  const activeIndex = tabs.findIndex((t) => t.active);

  return (
    <div className={cn(tabs.length > 0 ? "app-shell" : "app-shell-plain", wide && "md:max-w-4xl")}>
      <header className="app-header">
        <Link to="/" aria-label="Beranda" className="flex min-w-0 flex-1 items-center gap-3">
          <span className="avatar text-sm">{user ? user.name.charAt(0) : "2M"}</span>
          {user ? (
            <span className="min-w-0 leading-tight">
              <span className="block text-xs text-muted-foreground">Halo,</span>
              <span className="block truncate text-lg font-bold capitalize">{user.name}</span>
            </span>
          ) : (
            <span className="truncate text-lg font-bold">2M Sembako</span>
          )}
        </Link>
        {user ? (
          <button onClick={() => void logout()} className={headerButton}>
            Keluar
          </button>
        ) : (
          <Link to="/login" className={headerButton}>
            Masuk
          </Link>
        )}
      </header>
      <Outlet />
      {tabs.length > 0 && (
        <nav
          className="bottom-nav"
          aria-label="Navigasi utama"
          style={{ "--nav-index": Math.max(activeIndex, 0), "--nav-count": tabs.length } as CSSProperties}
        >
          <span className={cn("bottom-nav-indicator", activeIndex < 0 && "opacity-0")} aria-hidden="true" />
          {tabs.map((t) => (
            <Link key={t.key} to={t.to} aria-label={t.label} aria-current={t.active ? "page" : undefined} className="bottom-nav-tab">
              {t.icon}
              {t.badge}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageSkeleton />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Outlet />;
}
