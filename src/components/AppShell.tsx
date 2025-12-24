"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { Banknote, CloudCogIcon, CloudFog, Cog, CogIcon, GitCommitVerticalIcon, Receipt, Wallet, WalletCardsIcon } from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const navItems: NavItem[] = useMemo(
    () => [
      { label: "Dashboard", href: "/dashboard", icon: <IconHome /> },
      { label: "Jobs", href: "/jobs", icon: <IconBriefcase /> },
      { label: "Invoices", href: "/invoices", icon: <IconInvoice /> },
      { label: "Paid", href: "/paid", icon: <Wallet /> },
      { label: "Manage", href: "/manage", icon: <Cog/> }, // ✅ no 404
    ],
    []
  );

  async function logout() {
    try {
      setLoggingOut(true);
      await supabase.auth.signOut();
    } finally {
      setLoggingOut(false);
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div style={styles.shell}>
      <aside style={{ ...styles.sidebar, width: collapsed ? 72 : 260 }}>
        <div style={styles.brandRow}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
            {/* ✅ PNG only, no blue box */}
            <div style={styles.logo}>
              <Image src="/SST.png" alt="SST" width={28} height={28} priority />
            </div>

            {!collapsed && (
              <div style={{ lineHeight: 1.1 }}>
                <div style={{ fontWeight: 800, color: "#111827" }}>Operations</div>
              </div>
            )}
          </div>

          <button
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expand" : "Collapse"}
            style={styles.iconBtn}
            type="button"
          >
            {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
          </button>
        </div>

        <nav style={{ marginTop: 10 }}>
          {navItems.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname?.startsWith(item.href + "/"));

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  ...styles.navItem,
                  background: active ? "#eff6ff" : "transparent",
                  color: active ? "#1d4ed8" : "#374151",
                  borderColor: active ? "#bfdbfe" : "transparent",
                }}
                title={collapsed ? item.label : undefined}
              >
                <span style={{ width: 22, display: "inline-flex", justifyContent: "center" }}>
                  {item.icon}
                </span>
                {!collapsed && <span style={{ fontWeight: 600 }}>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div style={styles.sidebarBottom}>
          <button
            onClick={logout}
            disabled={loggingOut}
            style={{
              ...styles.logoutBtn,
              opacity: loggingOut ? 0.7 : 1,
              cursor: loggingOut ? "not-allowed" : "pointer",
            }}
            title={collapsed ? "Logout" : undefined}
            type="button"
          >
            <span style={{ width: 22, display: "inline-flex", justifyContent: "center" }}>
              <IconLogout />
            </span>
            {!collapsed && <span>{loggingOut ? "Logging out..." : "Logout"}</span>}
          </button>
        </div>
      </aside>

      <div style={styles.main}>
        <header style={styles.topbar}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setCollapsed((v) => !v)}
              style={styles.topbarIconBtn}
              title="Toggle sidebar"
              type="button"
            >
              <IconMenu />
            </button>
            <div style={{ color: "#111827", fontWeight: 700 }}>{titleFromPath(pathname)}</div>
          </div>

          <span style={{ fontSize: 12, color: "#6b7280" }}>{pathname}</span>
        </header>

        <main style={styles.content}>{children}</main>
      </div>
    </div>
  );
}

function titleFromPath(pathname: string | null) {
  if (!pathname) return "App";
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/jobs")) return "Jobs";
  if (pathname.startsWith("/invoices")) return "Invoices";
  if (pathname.startsWith("/customers")) return "Customers";
  if (pathname.startsWith("/drivers")) return "Drivers";
  if (pathname.startsWith("/vehicles")) return "Vehicles";
  if (pathname.startsWith("/trailers")) return "Trailers";
  return "App";
}

const styles: Record<string, React.CSSProperties> = {
  shell: { minHeight: "100vh", display: "flex", background: "#f8fafc" },
  sidebar: {
    position: "sticky",
    top: 0,
    height: "100vh",
    borderRight: "1px solid #e5e7eb",
    background: "white",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    transition: "width 200ms ease",
    overflowX: "hidden",
    zIndex: 20,
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "8px 6px",
    borderBottom: "1px solid #f3f4f6",
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: "transparent", // ✅ no blue
    display: "grid",
    placeItems: "center",
    overflow: "hidden",
    flexShrink: 0,
  },
  iconBtn: {
    border: "1px solid #e5e7eb",
    background: "white",
    borderRadius: 10,
    padding: 8,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 10px",
    borderRadius: 12,
    textDecoration: "none",
    border: "1px solid transparent",
    marginTop: 6,
    transition: "all 120ms ease",
    whiteSpace: "nowrap",
  },
  sidebarBottom: {
    marginTop: "auto",
    paddingTop: 12,
    borderTop: "1px solid #f3f4f6",
  },
  logoutBtn: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 10px",
    borderRadius: 12,
    border: "1px solid #fee2e2",
    background: "#fef2f2",
    color: "#b91c1c",
    fontWeight: 700,
  },
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" },
  topbar: {
    position: "sticky",
    top: 0,
    zIndex: 10,
    background: "rgba(248,250,252,0.85)",
    backdropFilter: "blur(8px)",
    borderBottom: "1px solid #e5e7eb",
    padding: "12px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topbarIconBtn: {
    border: "1px solid #e5e7eb",
    background: "white",
    borderRadius: 10,
    padding: 8,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: 16 },
};

/** Icons */
function IconMenu() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12h18" />
      <path d="M3 6h18" />
      <path d="M3 18h18" />
    </svg>
  );
}
function IconChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
function IconChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
function IconHome() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7" />
      <path d="M9 22V12h6v10" />
    </svg>
  );
}
function IconBriefcase() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 6V4h4v2" />
      <path d="M3 9h18v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" />
      <path d="M3 9l2-4h14l2 4" />
    </svg>
  );
}
function IconInvoice() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 2h12v20l-2-1-2 1-2-1-2 1-2-1-2 1V2z" />
      <path d="M9 7h6" />
      <path d="M9 11h6" />
      <path d="M9 15h4" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2 2 0 0 1-1.42 3.42h-.06a2 2 0 0 1-1.42-.59l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.64V21a2 2 0 0 1-4 0v-.06a1.8 1.8 0 0 0-1.08-1.64 1.8 1.8 0 0 0-1.98.36l-.04.04a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.64-1.08H2a2 2 0 0 1 0-4h.06A1.8 1.8 0 0 0 3.7 8.84a1.8 1.8 0 0 0-.36-1.98l-.04-.04A2 2 0 0 1 4.72 3.4h.06a2 2 0 0 1 1.42.59l.04.04a1.8 1.8 0 0 0 1.98.36A1.8 1.8 0 0 0 9.3 2.8V2a2 2 0 0 1 4 0v.06a1.8 1.8 0 0 0 1.08 1.64 1.8 1.8 0 0 0 1.98-.36l.04-.04A2 2 0 0 1 20.6 4.72v.06a2 2 0 0 1-.59 1.42l-.04.04a1.8 1.8 0 0 0-.36 1.98A1.8 1.8 0 0 0 21.2 9.3H22a2 2 0 0 1 0 4h-.06A1.8 1.8 0 0 0 19.4 15z" />
    </svg>
  );
}
function IconLogout() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
