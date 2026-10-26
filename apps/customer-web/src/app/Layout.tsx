import { Link, Navigate, Outlet, useLocation, useMatch } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useCart } from "../lib/queries";

function CartLink({ branchId }: { branchId: string }) {
  const { data } = useCart(branchId);
  const count = data?.items.reduce((n, i) => n + i.qty, 0) ?? 0;
  return (
    <Link to={`/b/${branchId}/cart`} className="rounded-md px-3 py-1.5 text-sm hover:bg-secondary">
      Keranjang{count > 0 && <span className="ml-1 rounded-full bg-primary px-2 text-xs text-primary-foreground">{count}</span>}
    </Link>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const branchId = useMatch("/b/:branchId/*")?.params.branchId;

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <Link to="/" className="mr-2 font-semibold">
          2M Sembako
        </Link>
        {branchId && (
          <nav className="flex items-center gap-1">
            <Link to={`/b/${branchId}`} className="rounded-md px-3 py-1.5 text-sm hover:bg-secondary">
              Katalog
            </Link>
            {user && <CartLink branchId={branchId} />}
          </nav>
        )}
        <div className="ml-auto flex items-center gap-2 text-sm">
          {user && (
            <Link to="/orders" className="rounded-md px-3 py-1.5 hover:bg-secondary">
              Pesanan saya
            </Link>
          )}
          {user ? (
            <>
              <span className="text-muted-foreground">{user.name}</span>
              <button onClick={() => void logout()} className="rounded-md border px-3 py-1.5 hover:bg-secondary">
                Keluar
              </button>
            </>
          ) : (
            <Link to="/login" className="rounded-md border px-3 py-1.5 hover:bg-secondary">
              Masuk
            </Link>
          )}
        </div>
      </header>
      <Outlet />
    </div>
  );
}

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="p-4 text-sm text-muted-foreground">Memuat…</p>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Outlet />;
}
