import { Link, useLocation } from "react-router-dom";
import { FaCommentDots, FaHistory, FaHome, FaUser } from "react-icons/fa";
import { useChatThreads } from "@/features/chat/hooks";

const TABS = [
  { to: "/", label: "Beranda", Icon: FaHome },
  { to: "/history", label: "Riwayat", Icon: FaHistory },
  { to: "/chat", label: "Chat", Icon: FaCommentDots },
  { to: "/profile", label: "Profil", Icon: FaUser },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  const unread = useChatThreads("courier_admin").data?.reduce((n, t) => n + t.unread_count, 0) ?? 0;

  return (
    <nav aria-label="Navigasi utama" className="dock">
      {TABS.map(({ to, label, Icon }) => (
        <Link key={to} to={to} aria-label={label} aria-current={pathname === to ? "page" : undefined} className="dock-tab">
          <span className="dock-tab-icon">
            <Icon aria-hidden="true" />
          </span>
          <span className="dock-tab-label">{label}</span>
          {to === "/chat" && unread > 0 && <span className="count-badge right-1 top-0">{unread}</span>}
        </Link>
      ))}
    </nav>
  );
}
