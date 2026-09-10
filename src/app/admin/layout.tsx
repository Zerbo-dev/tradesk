"use client";

import { usePathname, useRouter } from "next/navigation";
import "./admin.css";

const NAV = [
  { href: "/admin", label: "📊 Dashboard" },
  { href: "/admin/settings", label: "⚙️ Réglages bots" },
  { href: "/admin/learning", label: "🧠 Apprentissage" },
  { href: "/admin/templates", label: "✉️ Templates" },
  { href: "/admin/subscribers", label: "👥 Abonnés" },
  { href: "/admin/backtest", label: "🧪 Backtest" },
  { href: "/admin/history", label: "📜 Historique réel" },
  { href: "/admin/danger", label: "🔴 Zone réelle" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/admin/login") {
    return <div className="admin-root">{children}</div>;
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <div className="admin-root">
      <div className="dash-shell">
        <aside className="dash-sidebar">
          <div className="admin-brand"><span className="dot" />TradeSk</div>
          <nav className="dash-nav">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className={pathname === item.href ? "active" : ""}>
                {item.label}
              </a>
            ))}
          </nav>
          <div style={{ marginTop: "auto" }}>
            <button onClick={logout} className="btn btn-ghost" style={{ width: "100%" }}>
              Déconnexion
            </button>
          </div>
        </aside>
        <div className="dash-content">
          <div className="dash-inner">{children}</div>
        </div>
      </div>
    </div>
  );
}
