import { useEffect, type ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation, useMatch } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useBranches, useCart, useChatThreads } from "../lib/queries";
import { cn } from "../lib/utils";
import { IconCart, IconChat, IconChevron, IconPin, IconReceipt, IconSearch, IconStore, IconUser } from "../components/Icons";
import { PageSkeleton } from "../components/States";

function CartCount({ branchId }: { branchId: string }) {
  const { data } = useCart(branchId);
  const count = data?.items.reduce((n, i) => n + i.qty, 0) ?? 0;
  if (count <= 0) return null;
  return <span className="count-badge left-1/2 top-1 ml-2">{count}</span>;
}

function ChatCount() {
  const { data } = useChatThreads("customer_admin");
  const count = data?.reduce((n, t) => n + t.unread_count, 0) ?? 0;
  if (count <= 0) return null;
  return <span className="count-badge left-1/2 top-1 ml-2">{count}</span>;
}

interface Tab {
  key: string;
  to: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  badge?: ReactNode;
}

const LAST_BRANCH_KEY = "2m.last_branch";

export const CATALOG_SEARCH_ID = "catalog-search";

export function Layout() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const urlBranchId = useMatch("/b/:branchId/*")?.params.branchId;
  const onCatalog = useMatch({ path: "/b/:branchId", end: true }) !== null;
  const inChatRoom = useMatch("/chat/:threadId") !== null;

  // Pages outside /b/:branchId (orders, order detail) keep the Katalog and Keranjang tabs of the last visited branch.
  useEffect(() => {
    if (urlBranchId) localStorage.setItem(LAST_BRANCH_KEY, urlBranchId);
  }, [urlBranchId]);
  const branchId = urlBranchId ?? localStorage.getItem(LAST_BRANCH_KEY) ?? undefined;
  const branch = useBranches().data?.find((b) => b.id === branchId);

  if (inChatRoom) return <Outlet />;

  const catalogTo = branchId ? `/b/${branchId}` : "/";
  const tabs: Tab[] = [{ key: "catalog", to: catalogTo, label: "Katalog", icon: <IconStore />, active: pathname === catalogTo }];
  if (user) {
    if (branchId) {
      tabs.push({
        key: "cart",
        to: `/b/${branchId}/cart`,
        label: "Keranjang",
        icon: <IconCart />,
        active: pathname === `/b/${branchId}/cart`,
        badge: <CartCount branchId={branchId} />,
      });
    }
    tabs.push(
      { key: "orders", to: "/orders", label: "Pesanan", icon: <IconReceipt />, active: pathname.startsWith("/orders") },
      { key: "chat", to: "/chat", label: "Chat", icon: <IconChat />, active: pathname === "/chat", badge: <ChatCount /> },
      { key: "account", to: "/account", label: "Akun", icon: <IconUser />, active: pathname === "/account" },
    );
  } else {
    tabs.push({ key: "login", to: "/login", label: "Masuk", icon: <IconUser />, active: false });
  }

  return (
    <div className={cn(onCatalog && "page-wash")}>
      <div className={cn("app-shell", onCatalog && "md:max-w-4xl")}>
        <header className={cn("app-header", onCatalog && "static bg-transparent backdrop-blur-none")}>
          <Link to="/" aria-label="Ganti cabang" className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 leading-tight">
              <span className="block text-xs text-muted-foreground">Belanja di</span>
              <span className="flex items-center gap-1 font-bold">
                <IconPin className="shrink-0 text-primary" />
                <span className="truncate">{branch?.name ?? "2M Sembako"}</span>
                <IconChevron className="shrink-0 rotate-90 text-sm text-muted-foreground" />
              </span>
            </span>
          </Link>
          {onCatalog && (
            <button
              type="button"
              aria-label="Cari produk"
              onClick={() => document.getElementById(CATALOG_SEARCH_ID)?.focus()}
              className="icon-btn shrink-0 bg-surface shadow-sm"
            >
              <IconSearch />
            </button>
          )}
        </header>
        <Outlet />
        <nav className="tab-bar" aria-label="Navigasi utama">
          <div className="tab-bar-inner">
            {tabs.map((t) => (
              <Link key={t.key} to={t.to} aria-current={t.active ? "page" : undefined} className="tab-bar-item">
                <span className="tab-bar-icon">{t.icon}</span>
                {t.label}
                {t.badge}
              </Link>
            ))}
          </div>
        </nav>
      </div>
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
