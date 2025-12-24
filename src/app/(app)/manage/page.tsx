"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  Users,
  Truck,
  Package,
  Building,
  Shield,
  Wrench,
  FileText,
  BarChart3,
  BadgePoundSterling,
} from "lucide-react";

type Counts = {
  driversActive: number | null;
  vehiclesActiveOrTotal: number | null;
  trailersTotal: number | null;
  customersActive: number | null;
  complianceDueSoon: number | null;
  maintenancePending: number | null;
  documentsTotal: number | null;
};

export default function ManagementHome() {
  // ✅ cookie-aware supabase client (works correctly across custom domains)
  const supabase = supabaseBrowser();

  const [counts, setCounts] = useState<Counts>({
    driversActive: null,
    vehiclesActiveOrTotal: null,
    trailersTotal: null,
    customersActive: null,
    complianceDueSoon: null,
    maintenancePending: null,
    documentsTotal: null,
  });

  const [countError, setCountError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function safeCount(opts: { table: string; where?: (q: any) => any }): Promise<{ count: number; error?: any }> {
      try {
        let q = supabase.from(opts.table).select("id", { count: "exact", head: true });
        if (opts.where) q = opts.where(q);
        const res = await q;
        if (res.error) return { count: 0, error: res.error };
        return { count: res.count ?? 0 };
      } catch (e: any) {
        return { count: 0, error: e };
      }
    }

    (async () => {
      setCountError(null);

      try {
        // ✅ Auth guard (prevents “auth session missing” weirdness on custom domain)
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        if (!authData?.user) {
          window.location.href = "/login";
          return;
        }

        // Core counts (these tables definitely exist in your app)
        const driversReq = safeCount({
          table: "drivers",
          where: (q) => q.eq("active", true),
        });

        const customersReq = safeCount({
          table: "customers",
          where: (q) => q.eq("active", true),
        });

        const trailersReq = safeCount({ table: "trailers" });

        // Vehicles: try active if column exists, otherwise fallback to total
        const vehiclesActiveTry = await safeCount({
          table: "vehicles",
          where: (q) => q.eq("active", true),
        });

        let vehiclesCount = vehiclesActiveTry.count;
        if (vehiclesActiveTry.error) {
          const vehiclesTotal = await safeCount({ table: "vehicles" });
          if (vehiclesTotal.error) throw vehiclesTotal.error;
          vehiclesCount = vehiclesTotal.count;
        }

        const [driversRes, customersRes, trailersRes] = await Promise.all([driversReq, customersReq, trailersReq]);

        // OPTIONAL counts — only set them if your tables exist.
        // If you don't have these tables yet, they will quietly show "—" and not crash the page.
        const documentsRes = await safeCount({ table: "documents" });
        const maintenanceRes = await safeCount({
          table: "maintenance",
          where: (q) => q.in("status", ["pending", "scheduled"]),
        });

        // Compliance due soon (next 30 days). Adjust table/column names later if needed.
        const today = new Date();
        const next30 = new Date();
        next30.setDate(today.getDate() + 30);
        const todayISO = today.toISOString().slice(0, 10);
        const next30ISO = next30.toISOString().slice(0, 10);

        const complianceRes = await safeCount({
          table: "compliance_items",
          where: (q) => q.gte("due_date", todayISO).lte("due_date", next30ISO),
        });

        // If any "core" count fails (drivers/customers/trailers/vehicles), throw.
        const firstCoreErr = driversRes.error || customersRes.error || trailersRes.error || null;
        if (firstCoreErr) throw firstCoreErr;

        // If optional tables don't exist, don't treat as fatal; just show "—".
        const documentsTotal = documentsRes.error ? null : documentsRes.count;
        const maintenancePending = maintenanceRes.error ? null : maintenanceRes.count;
        const complianceDueSoon = complianceRes.error ? null : complianceRes.count;

        if (!cancelled) {
          setCounts({
            driversActive: driversRes.count,
            customersActive: customersRes.count,
            trailersTotal: trailersRes.count,
            vehiclesActiveOrTotal: vehiclesCount,
            documentsTotal,
            maintenancePending,
            complianceDueSoon,
          });

          // Optional: show a small warning if optional counts failed
          const optionalMsgs: string[] = [];
          if (documentsRes.error) optionalMsgs.push("documents");
          if (maintenanceRes.error) optionalMsgs.push("maintenance");
          if (complianceRes.error) optionalMsgs.push("compliance");

          if (optionalMsgs.length > 0) {
            setCountError(
              `Some optional counts could not be loaded (${optionalMsgs.join(
                ", "
              )}). They will show as "—" until those tables/views exist or columns match.`
            );
          }
        }
      } catch (e: any) {
        if (cancelled) return;
        setCountError(e?.message ?? "Failed to load counts");
        setCounts({
          driversActive: null,
          vehiclesActiveOrTotal: null,
          trailersTotal: null,
          customersActive: null,
          complianceDueSoon: null,
          maintenancePending: null,
          documentsTotal: null,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const managementCards = useMemo(
    () => [
      {
        title: "Payroll",
        description: "",
        href: "/manage/driver-pay",
        icon: <BadgePoundSterling size={24} />,
        color: "#bf0db0ff",
        bgColor: "#f9fafb",
        count: "Configure",
      },
      {
        title: "Drivers",
        description: "Manage driver profiles, licenses, and assignments",
        href: "/manage/drivers",
        icon: <Users size={24} />,
        color: "#3b82f6",
        bgColor: "#eff6ff",
        count: counts.driversActive == null ? "—" : `${counts.driversActive} active`,
      },
      {
        title: "Vehicles",
        description: "Track vehicles, MOT, tax, and maintenance",
        href: "/manage/vehicles",
        icon: <Truck size={24} />,
        color: "#10b981",
        bgColor: "#d1fae5",
        count: counts.vehiclesActiveOrTotal == null ? "—" : `${counts.vehiclesActiveOrTotal} vehicles`,
      },
      {
        title: "Trailers",
        description: "Manage trailers, inspections, and assignments",
        href: "/manage/trailers",
        icon: <Package size={24} />,
        color: "#8b5cf6",
        bgColor: "#f5f3ff",
        count: counts.trailersTotal == null ? "—" : `${counts.trailersTotal} trailers`,
      },
      {
        title: "Customers",
        description: "Manage customer accounts and contracts",
        href: "/manage/customers",
        icon: <Building size={24} />,
        color: "#f59e0b",
        bgColor: "#fef3c7",
        count: counts.customersActive == null ? "—" : `${counts.customersActive} active`,
      },
      {
        title: "Compliance",
        description: "MOT, tax, insurance, and safety checks",
        href: "/manage/compliance",
        icon: <Shield size={24} />,
        color: "#ef4444",
        bgColor: "#fef2f2",
        count: counts.complianceDueSoon == null ? "—" : `${counts.complianceDueSoon} due soon`,
      },
      {
        title: "Maintenance",
        description: "Schedule and track vehicle maintenance",
        href: "/manage/maintenance",
        icon: <Wrench size={24} />,
        color: "#6366f1",
        bgColor: "#eef2ff",
        count: counts.maintenancePending == null ? "—" : `${counts.maintenancePending} pending`,
      },
      {
        title: "Documents",
        description: "Licenses, insurance, and compliance docs",
        href: "/manage/documents",
        icon: <FileText size={24} />,
        color: "#14b8a6",
        bgColor: "#f0fdfa",
        count: counts.documentsTotal == null ? "—" : `${counts.documentsTotal} documents`,
      },
      {
        title: "Reports",
        description: "Analytics, performance, and financial reports",
        href: "/manage/reports",
        icon: <BarChart3 size={24} />,
        color: "#8b5cf6",
        bgColor: "#f5f3ff",
        count: "View insights",
      },
    ],
    [counts]
  );

  const stats = useMemo(
    () => [
      {
        label: "Active Drivers",
        value: counts.driversActive == null ? "—" : String(counts.driversActive),
        change: "All available",
      },
      {
        label: "Due Compliance",
        value: counts.complianceDueSoon == null ? "—" : String(counts.complianceDueSoon),
        change: "Needs attention",
      },
      {
        label: "Pending Tasks",
        value: counts.maintenancePending == null ? "—" : String(counts.maintenancePending),
        change: "To complete",
      },
    ],
    [counts]
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
      {/* Header Section */}
      <div style={{ marginBottom: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
          <h1 style={{ fontSize: "30px", fontWeight: 800, color: "#111827", margin: 0 }}>
            Management Console
          </h1>
          <div
            style={{
              padding: "6px 12px",
              background: "#f3f4f6",
              borderRadius: "20px",
              fontSize: "14px",
              color: "#6b7280",
              fontWeight: 500,
            }}
          >
            Last updated: Today
          </div>
        </div>

        <p style={{ fontSize: "16px", color: "#6b7280", margin: "0 0 8px 0", maxWidth: "600px" }}>
          Manage your fleet, people, and compliance
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
          <div style={{ width: "8px", height: "8px", background: "#10b981", borderRadius: "50%" }} />
          <span style={{ fontSize: "14px", color: "#6b7280" }}>All systems operational</span>
        </div>

        {countError && (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: 12,
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#991b1b",
              fontSize: 14,
            }}
          >
            Counts warning: {countError}
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        {stats.map((stat, index) => (
          <div
            key={index}
            style={{
              background: "white",
              padding: "20px",
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
              transition: "all 0.2s ease",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.boxShadow = "0 4px 6px -1px rgba(0, 0, 0, 0.1)";
              e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "8px" }}>{stat.label}</div>

            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "28px", fontWeight: 700, color: "#111827" }}>{stat.value}</span>

              {(index === 0 || index === 2) && (
                <span
                  style={{
                    fontSize: "12px",
                    background: index === 2 ? "#fee2e2" : "#d1fae5",
                    color: index === 2 ? "#991b1b" : "#065f46",
                    padding: "2px 8px",
                    borderRadius: "12px",
                    fontWeight: 500,
                  }}
                >
                  {stat.change}
                </span>
              )}
            </div>

            <div style={{ fontSize: "13px", color: index === 2 ? "#dc2626" : "#6b7280" }}>
              {index !== 0 && index !== 2 ? stat.change : null}
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#111827", margin: 0 }}>
            Management Modules
          </h2>
          <span style={{ fontSize: "14px", color: "#6b7280" }}>{managementCards.length} modules available</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px" }}>
          {managementCards.map((card, index) => (
            <Link key={index} href={card.href} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
              <div
                style={{
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "16px",
                  padding: "24px",
                  height: "125%",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  position: "relative",
                  overflow: "hidden",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = "translateY(-4px)";
                  e.currentTarget.style.boxShadow =
                    "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)";
                  e.currentTarget.style.borderColor = card.color;
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 1px 3px rgba(0, 0, 0, 0.05)";
                  e.currentTarget.style.borderColor = "#e5e7eb";
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: "-20px",
                    right: "-20px",
                    width: "80px",
                    height: "80px",
                    background: card.bgColor,
                    borderRadius: "50%",
                    opacity: 0.3,
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "56px",
                    height: "56px",
                    borderRadius: "12px",
                    background: card.bgColor,
                    color: card.color,
                    marginBottom: "20px",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  {card.icon}
                </div>

                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px", gap: 12 }}>
                    <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#111827", margin: 0 }}>
                      {card.title}
                    </h3>

                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: card.color,
                        background: card.bgColor,
                        padding: "4px 10px",
                        borderRadius: "12px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {card.count}
                    </span>
                  </div>

                  <p style={{ fontSize: "14px", color: "#6b7280", margin: "0 0 16px 0", lineHeight: 1.5 }}>
                    {card.description}
                  </p>

                  <div style={{ display: "flex", alignItems: "center", color: card.color, fontSize: "14px", fontWeight: 600 }}>
                    <span>Open module</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: "8px" }}>
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: `linear-gradient(135deg, ${card.color}15, transparent)`,
                    opacity: 0,
                    transition: "opacity 0.3s ease",
                    pointerEvents: "none",
                  }}
                />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
