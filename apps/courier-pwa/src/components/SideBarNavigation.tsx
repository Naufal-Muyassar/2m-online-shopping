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
        className="flex size-12 items-center justify-center rounded-full border border-border bg-secondary text-xl transition-colors duration-150 hover:bg-muted active:scale-95"
      >
        <FaUserCircle aria-hidden="true" />
      </button>
      {menuOpen && (
        <nav
          id="dashboard-navigation"
          aria-label="Navigasi utama"
          className="menu-slide-in absolute left-0 top-14 z-50 flex w-64 flex-col gap-1 rounded-lg border border-border bg-background p-2 shadow-lg"
        >
          <Link
            to="/profile"
            onClick={() => setMenuOpen(false)}
            className="flex min-h-12 items-center gap-3 rounded-md px-3 text-base font-semibold transition-colors duration-150 hover:bg-muted active:scale-[0.99]"
          >
            <FaUser aria-hidden="true" className="text-muted-foreground" />
            Profil{name ? ` ${name}` : ""}
          </Link>
          {isLoggedIn && (
            <button
              type="button"
              className="flex min-h-12 items-center gap-3 rounded-md px-3 text-left text-base font-semibold transition-colors duration-150 hover:bg-muted active:scale-[0.99] disabled:opacity-50"
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