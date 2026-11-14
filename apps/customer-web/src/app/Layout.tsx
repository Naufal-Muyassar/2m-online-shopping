import { useEffect, type ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation, useMatch } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useBranches, useCart, useChatThreads } from "../lib/queries";
import { cn } from "../lib/utils";
import { IconCart, IconChat, IconChevron, IconPin, IconReceipt, IconSearch, IconStore, IconUser } from "../components/Icons";
import { PageSkeleton } from "../components/States";

function CartCount({ branchId, className }: { branchId: string; className?: string }) {
  const { data } = useCart(branchId);
  const count = data?.items.reduce((n, i) => n + i.qty, 0) ?? 0;
  if (count <= 0) return null;
  return <span className={cn("count-badge", className)}>{count}</span>;
}

function ChatCount({ className }: { className?: string }) {
  const { data } = useChatThreads("customer_admin");
  const count = data?.reduce((n, t) => n + t.unread_count, 0) ?? 0;
  if (count <= 0) return null;
  return <span className={cn("count-badge", className)}>{count}</span>;
}

interface Tab {
  key: string;
  to: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  // Rendered twice: over the icon in the phone tab bar, inline in the desktop header.
  badge?: (className: string) => ReactNode;
}

const LAST_BRANCH_KEY = "2m.last_branch";
const BADGE_ON_ICON = "left-1/2 top-1.5 ml-1.5";
const BADGE_INLINE = "static";

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
        badge: (className) => <CartCount branchId={branchId} className={className} />,
      });
    }
    tabs.push(
      { key: "orders", to: "/orders", label: "Pesanan", icon: <IconReceipt />, active: pathname.startsWith("/orders") },
      {
        key: "chat",
        to: "/chat",
        label: "Chat",
        icon: <IconChat />,
        active: pathname === "/chat",
        badge: (className) => <ChatCount className={className} />,
      },
      { key: "account", to: "/account", label: "Akun", icon: <IconUser />, active: pathname === "/account" },
    );
  } else {
    tabs.push({ key: "login", to: "/login", label: "Masuk", icon: <IconUser />, active: false });
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 md:px-8">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-md bg-rail text-sm font-extrabold tracking-tight text-rail-foreground">
            2M
          </span>
          <Link
            to="/"
            aria-label="Ganti cabang"
            className="group -my-1 flex min-w-0 flex-col justify-center rounded-md py-1 pr-2 leading-tight transition-transform duration-100 active:scale-[0.98]"
          >
            <span className="t-label">Belanja di</span>
            <span className="flex items-center gap-1 font-extrabold tracking-tight">
              <IconPin className="shrink-0 text-primary" />
              <span className="truncate">{branch?.name ?? "2M Sembako"}</span>
              <IconChevron className="shrink-0 rotate-90 text-sm text-muted-foreground transition-transform duration-200 ease-settle group-hover:translate-y-0.5" />
            </span>
          </Link>

          <nav aria-label="Navigasi utama" className="ml-auto hidden items-center gap-1 md:flex">
            {tabs.map((t) => (
              <Link key={t.key} to={t.to} aria-current={t.active ? "page" : undefined} className="nav-link">
                {t.label}
                {t.badge?.(BADGE_INLINE)}
              </Link>
            ))}
          </nav>

          {onCatalog && (
            <button
              type="button"
              aria-label="Cari produk"
              onClick={() => document.getElementById(CATALOG_SEARCH_ID)?.focus()}
              className="icon-btn ml-auto md:hidden"
            >
              <IconSearch />
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col pb-[calc(var(--nav-height)+1rem+env(safe-area-inset-bottom))] md:px-4 md:pb-8">
        <Outlet />
      </div>

      <nav className="tab-bar md:hidden" aria-label="Navigasi utama">
        <div className="tab-bar-inner">
          {tabs.map((t) => (
            <Link key={t.key} to={t.to} aria-current={t.active ? "page" : undefined} className="tab-bar-item">
              <span className="tab-bar-icon">{t.icon}</span>
              {t.label}
              {t.badge?.(BADGE_ON_ICON)}
            </Link>
          ))}
        </div>
      </nav>
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
