import { Link, useLocation } from "react-router-dom";
import type { CSSProperties } from "react";
import { FaHome, FaUser } from "react-icons/fa";

const TABS = [
  { to: "/", label: "Beranda", Icon: FaHome },
  { to: "/profile", label: "Profil", Icon: FaUser },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  const index = TABS.findIndex((t) => t.to === pathname);

  return (
    <nav
      aria-label="Navigasi utama"
      className="bottom-nav"
      style={{ "--nav-index": Math.max(index, 0), "--nav-count": TABS.length } as CSSProperties}
    >
      <span aria-hidden="true" className="bottom-nav-indicator" style={{ opacity: index < 0 ? 0 : 1 }} />
      {TABS.map(({ to, label, Icon }) => (
        <Link key={to} to={to} aria-label={label} aria-current={pathname === to ? "page" : undefined} className="bottom-nav-tab">
          <Icon aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}
