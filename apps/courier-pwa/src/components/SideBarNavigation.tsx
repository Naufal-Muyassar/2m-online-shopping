import { useState } from "react";
import { Link } from "react-router-dom";
import { FaPowerOff, FaUserCircle, FaUser } from "react-icons/fa";

type CourierStatus = "OFFLINE" | "IDLE" | "DELIVERING";

interface SideBarNavigationProps {
  isLoggedIn: boolean;
  name?: string;
  status?: CourierStatus;
  pending: boolean;
  onToggleStatus: () => void;
}

export function SideBarNavigation({ isLoggedIn, name, status, pending, onToggleStatus }: SideBarNavigationProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const delivering = status === "DELIVERING";

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="Buka menu profil"
        aria-expanded={menuOpen}
        aria-controls="dashboard-navigation"
        onClick={() => setMenuOpen((open) => !open)}
        className="avatar size-11 text-lg transition-transform duration-150 active:scale-95"
      >
        {name ? name.trim().charAt(0) : <FaUserCircle aria-hidden="true" />}
      </button>
      {menuOpen && (
        <nav
          id="dashboard-navigation"
          aria-label="Menu profil"
          className="menu-slide-in absolute left-0 top-14 z-50 flex w-64 flex-col gap-1 rounded-md border border-border bg-surface p-2 shadow-md"
        >
          <Link
            to="/profile"
            onClick={() => setMenuOpen(false)}
            className="flex min-h-11 items-center gap-3 rounded-sm px-3 text-base font-semibold transition-colors duration-150 hover:bg-muted active:scale-[0.98]"
          >
            <FaUser aria-hidden="true" className="text-muted-foreground" />
            Profil{name ? ` ${name}` : ""}
          </Link>
          {isLoggedIn && (
            <button
              type="button"
              className="flex min-h-11 items-center gap-3 rounded-sm px-3 text-left text-base font-semibold transition-colors duration-150 hover:bg-muted active:scale-[0.98] disabled:opacity-60"
              disabled={!status || delivering || pending}
              onClick={() => {
                onToggleStatus();
                setMenuOpen(false);
              }}
            >
              <FaPowerOff aria-hidden="true" className="text-muted-foreground" />
              {delivering ? "Sedang mengantar" : status === "IDLE" ? "Berhenti bekerja" : status === "OFFLINE" ? "Mulai bekerja" : "Memuat status…"}
            </button>
          )}
        </nav>
      )}
    </div>
  );
}