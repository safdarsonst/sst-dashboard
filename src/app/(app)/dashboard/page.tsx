"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  AlertCircle,
  BarChart3,
  Calendar,
  Car,
  CreditCard,
  PoundSterling,
  TrendingDown,
  TrendingUp,
  LayoutDashboard,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type InvoiceRow = {
  id: string;
  job_reference: string;
  job_date: string | null;
  customer_name: string | null;
  agreed_amount: number | null;
  invoice_terms: string | null;
  invoice_status: string | null;
  invoice_number: string | null;
  invoiced_at: string | null;
  paid_at: string | null;
  self_invoiced: boolean | null;
  due_date: string | null;
  is_overdue: boolean | null;
  total_distance_miles: number | null;
};

type ExpenseRow = {
  id: string;
  expense_date?: string | null;
  date?: string | null;
  category?: string | null;
  supplier?: string | null;
  description?: string | null;
  amount?: number | null;
  paid?: boolean | null;
  paid_at?: string | null;
  due_date?: string | null;
  owner_id?: string | null;
};

type JobRow = {
  id: string;
  job_date: string | null;
  status: string | null;
  total_distance_miles: number | null;
  owner_id: string | null;
};

type VehicleRow = {
  id: string;
  registration: string;
  mot_due: string | null;
  tax_due: string | null;
  insurance_due: string | null;
  service_due_date: string | null;
};

function moneyGBP(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseISODate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function monthStartISO(year: number, monthIndex0: number) {
  return toISODate(new Date(year, monthIndex0, 1));
}

function monthEndISO(year: number, monthIndex0: number) {
  return toISODate(new Date(year, monthIndex0 + 1, 0));
}

function daysFromToday(iso: string | null) {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dt = parseISODate(iso);
  dt.setHours(0, 0, 0, 0);
  const diff = Math.round((dt.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  return diff;
}

function clamp01(n: number) {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function Bar({
  label,
  value,
  max,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
}) {
  const pct = max <= 0 ? 0 : clamp01(value / max);
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>{label}</div>
        <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>
          {suffix ? `${value.toFixed(0)}${suffix}` : moneyGBP(value)}
        </div>
      </div>
      <div style={{ height: 10, background: "#f3f4f6", borderRadius: 999, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.round(pct * 100)}%`,
            background: "linear-gradient(90deg,#3b82f6,#1d4ed8)",
          }}
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const pathname = usePathname();
  const isFinance = pathname === "/dashboard";
  const isOps = pathname === "/dashboard/operations";
  
  // default to current month
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month0, setMonth0] = useState(now.getMonth());

  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);

  const start = useMemo(() => monthStartISO(year, month0), [year, month0]);
  const end = useMemo(() => monthEndISO(year, month0), [year, month0]);

  const monthLabel = useMemo(() => {
    const d = new Date(year, month0, 1);
    return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }, [year, month0]);

  async function load() {
    setBusy(true);
    setError(null);

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = authData?.user;
      if (!user) throw new Error("Auth session missing. Please log in again.");

      const invQ = await supabase
        .from("v_invoices")
        .select(
          "id, job_reference, job_date, customer_name, agreed_amount, invoice_terms, invoice_status, invoice_number, invoiced_at, paid_at, self_invoiced, due_date, is_overdue, total_distance_miles"
        )
        .gte("job_date", start)
        .lte("job_date", end);

      if (invQ.error) throw invQ.error;

      const jobsQ = await supabase
        .from("jobs")
        .select("id, job_date, status, total_distance_miles, owner_id")
        .gte("job_date", start)
        .lte("job_date", end)
        .or(`owner_id.eq.${user.id},owner_id.is.null`);

      if (jobsQ.error) throw jobsQ.error;

      const expQ = await supabase
        .from("expenses")
        .select("*")
        .or(`owner_id.eq.${user.id},owner_id.is.null`)
        .gte("expense_date", start)
        .lte("expense_date", end);

      let expRows: any[] = [];
      if (expQ.error) {
        const expQ2 = await supabase
          .from("expenses")
          .select("*")
          .or(`owner_id.eq.${user.id},owner_id.is.null`)
          .gte("date", start)
          .lte("date", end);

        if (expQ2.error) throw expQ2.error;
        expRows = (expQ2.data as any[]) ?? [];
      } else {
        expRows = (expQ.data as any[]) ?? [];
      }

      const vehQ = await supabase
        .from("vehicles")
        .select("id, registration, mot_due, tax_due, insurance_due, service_due_date")
        .order("registration", { ascending: true });

      if (vehQ.error) throw vehQ.error;

      setInvoices((invQ.data as InvoiceRow[]) ?? []);
      setJobs((jobsQ.data as JobRow[]) ?? []);
      setExpenses((expRows as ExpenseRow[]) ?? []);
      setVehicles((vehQ.data as VehicleRow[]) ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load dashboard data.");
      setInvoices([]);
      setJobs([]);
      setExpenses([]);
      setVehicles([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

  const invoiceMetrics = useMemo(() => {
    const normStatus = (s: string | null | undefined) => (s ?? "").toLowerCase();

    let paidThisMonth = 0;
    let outstanding = 0;
    let overdue = 0;
    let awaitingInvoice = 0;

    for (const r of invoices) {
      const amt = Number(r.agreed_amount ?? 0);
      const st = normStatus(r.invoice_status);

      if (st === "paid" || !!r.paid_at) {
        paidThisMonth += amt;
        continue;
      }

      if (st.includes("await") || st === "awaiting_invoice") {
        awaitingInvoice += amt;
        continue;
      }

      if (st === "overdue" || r.is_overdue) {
        overdue += amt;
        outstanding += amt;
        continue;
      }

      if (st === "invoiced" || !!r.invoiced_at) {
        outstanding += amt;
        continue;
      }

      if (amt > 0) outstanding += amt;
    }

    return { paidThisMonth, outstanding, overdue, awaitingInvoice };
  }, [invoices]);

  const expenseMetrics = useMemo(() => {
    let paidOut = 0;
    let unpaidOwed = 0;

    for (const e of expenses) {
      const amt = Number((e as any).amount ?? 0);
      const isPaid = !!(e as any).paid || !!(e as any).paid_at;
      if (isPaid) paidOut += amt;
      else unpaidOwed += amt;
    }

    return { paidOut, unpaidOwed };
  }, [expenses]);

  const mileageMetrics = useMemo(() => {
    let completedMiles = 0;
    let completedJobs = 0;

    for (const j of jobs) {
      const st = (j.status ?? "").toLowerCase();
      if (!st.includes("comp")) continue;
      completedJobs += 1;
      completedMiles += Number(j.total_distance_miles ?? 0);
    }

    return { completedMiles, completedJobs };
  }, [jobs]);

  const complianceAlerts = useMemo(() => {
    const items: { reg: string; type: string; due: string; days: number }[] = [];
    const push = (reg: string, type: string, due: string | null) => {
      if (!due) return;
      const d = daysFromToday(due);
      if (d === null) return;
      if (d <= 30) items.push({ reg, type, due, days: d });
    };

    for (const v of vehicles) {
      push(v.registration, "MOT", v.mot_due);
      push(v.registration, "Tax", v.tax_due);
      push(v.registration, "Insurance", v.insurance_due);
      push(v.registration, "Service", v.service_due_date);
    }

    items.sort((a, b) => a.days - b.days);
    return items.slice(0, 8);
  }, [vehicles]);

  const incomeMax = Math.max(
    invoiceMetrics.paidThisMonth,
    invoiceMetrics.outstanding,
    invoiceMetrics.overdue,
    invoiceMetrics.awaitingInvoice
  );

  const outMax = Math.max(expenseMetrics.paidOut, expenseMetrics.unpaidOwed, 1);
  const net = invoiceMetrics.paidThisMonth - expenseMetrics.paidOut;

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", padding: "24px 20px" }}>
      {/* Combined Header with Toggle Buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
              display: "grid",
              placeItems: "center",
              color: "white",
            }}
          >
            <LayoutDashboard size={22} />
          </div>

          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "#111827" }}>Dashboard</h1>
            <p style={{ margin: "6px 0 0 0", color: "#6b7280" }}>
              Finance overview (income, outstanding, expenses) for <strong>{monthLabel}</strong>
            </p>

            {/* Toggle buttons */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <Link href="/dashboard" style={{ textDecoration: "none" }}>
                <button
                  type="button"
                  style={{
                    ...btnTab,
                    background: isFinance ? "#111827" : "white",
                    color: isFinance ? "white" : "#111827",
                    borderColor: isFinance ? "#111827" : "#e5e7eb",
                  }}
                >
                  Finance dashboard
                </button>
              </Link>

              <Link href="/dashboard/operations" style={{ textDecoration: "none" }}>
                <button
                  type="button"
                  style={{
                    ...btnTab,
                    background: isOps ? "#111827" : "white",
                    color: isOps ? "white" : "#111827",
                    borderColor: isOps ? "#111827" : "#e5e7eb",
                  }}
                >
                  Operations dashboard
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* Month picker and Refresh button */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={pill}>
            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>Status</div>
            <div style={{ fontSize: 14, color: "#111827", fontWeight: 900 }}>Ready</div>
          </div>
          
          <div style={{ display: "grid", gap: 6 }}>
            <label style={label}>Month</label>
            <div style={{ position: "relative" }}>
              <Calendar size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
              <input
                type="month"
                value={`${year}-${String(month0 + 1).padStart(2, "0")}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split("-").map(Number);
                  if (!y || !m) return;
                  setYear(y);
                  setMonth0(m - 1);
                }}
                style={{ ...input, paddingLeft: 38, minWidth: 210 }}
              />
            </div>
          </div>

          <button type="button" onClick={load} style={{ ...btn, fontWeight: 900, height: 44 }}>
            Refresh
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ marginBottom: 14, padding: 14, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, display: "flex", gap: 10 }}>
          <AlertCircle size={20} color="#dc2626" />
          <div style={{ color: "#991b1b" }}>{error}</div>
        </div>
      )}

      {busy ? (
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 18 }}>
          Loading dashboard…
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12, marginBottom: 14 }}>
            <KpiCard
              colSpan={3}
              title="Money received"
              value={moneyGBP(invoiceMetrics.paidThisMonth)}
              icon={<TrendingUp size={18} />}
              hint="Paid this month"
            />

            <KpiCard
              colSpan={3}
              title="Outstanding"
              value={moneyGBP(invoiceMetrics.outstanding)}
              icon={<CreditCard size={18} />}
              hint="Invoiced, unpaid"
            />

            <KpiCard
              colSpan={3}
              title="Overdue"
              value={moneyGBP(invoiceMetrics.overdue)}
              icon={<AlertCircle size={18} />}
              hint="Past due date"
              danger
            />

            <KpiCard
              colSpan={3}
              title="Expenses paid"
              value={moneyGBP(expenseMetrics.paidOut)}
              icon={<TrendingDown size={18} />}
              hint="Paid this month"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12, marginBottom: 14 }}>
            <KpiCard
              colSpan={4}
              title="Expenses owed"
              value={moneyGBP(expenseMetrics.unpaidOwed)}
              icon={<PoundSterling size={18} />}
              hint="Unpaid expenses"
            />

            <KpiCard
              colSpan={4}
              title="Net (received − paid expenses)"
              value={moneyGBP(net)}
              icon={<PoundSterling size={18} />}
              hint="Cash position"
              highlight={net >= 0}
            />

            <KpiCard
              colSpan={4}
              title="Mileage (completed)"
              value={`${mileageMetrics.completedMiles.toFixed(0)} mi`}
              icon={<Car size={18} />}
              hint={`${mileageMetrics.completedJobs} completed job(s)`}
            />
          </div>

          {/* Charts + Alerts */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
            {/* Income chart */}
            <div style={{ gridColumn: "span 6", background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
              <div style={{ fontWeight: 950, color: "#111827", marginBottom: 10 }}>Income overview</div>
              <div style={{ display: "grid", gap: 12 }}>
                <Bar label="Received" value={invoiceMetrics.paidThisMonth} max={incomeMax} />
                <Bar label="Outstanding" value={invoiceMetrics.outstanding} max={incomeMax} />
                <Bar label="Overdue" value={invoiceMetrics.overdue} max={incomeMax} />
                <Bar label="Awaiting invoice" value={invoiceMetrics.awaitingInvoice} max={incomeMax} />
              </div>
              <div style={{ marginTop: 10, color: "#6b7280", fontSize: 12 }}>
                Tip: "Outstanding" includes "Overdue". Awaiting invoice is completed work not yet invoiced.
              </div>
            </div>

            {/* Outgoings chart */}
            <div style={{ gridColumn: "span 6", background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
              <div style={{ fontWeight: 950, color: "#111827", marginBottom: 10 }}>Expenses overview</div>
              <div style={{ display: "grid", gap: 12 }}>
                <Bar label="Paid" value={expenseMetrics.paidOut} max={outMax} />
                <Bar label="Owed" value={expenseMetrics.unpaidOwed} max={outMax} />
              </div>
              <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 900, color: "#111827" }}>Top categories (this month)</div>
                <TopCategories expenses={expenses} />
              </div>
            </div>

            {/* Compliance alerts */}
            <div style={{ gridColumn: "span 12", background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <div style={{ fontWeight: 950, color: "#111827" }}>Compliance alerts (next 30 days)</div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>MOT • Tax • Insurance • Service</div>
              </div>

              {complianceAlerts.length === 0 ? (
                <div style={{ marginTop: 10, color: "#6b7280" }}>No compliance items due in the next 30 days.</div>
              ) : (
                <div style={{ marginTop: 10, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                        {["Vehicle", "Type", "Due date", "Days remaining"].map((h) => (
                          <th key={h} style={th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {complianceAlerts.map((a, idx) => (
                        <tr key={`${a.reg}-${a.type}-${a.due}`} style={{ borderBottom: idx < complianceAlerts.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                          <td style={td}><strong style={{ color: "#111827" }}>{a.reg}</strong></td>
                          <td style={td}>{a.type}</td>
                          <td style={td}>{a.due}</td>
                          <td style={td}>
                            <span
                              style={{
                                ...pillStyle,
                                background: a.days < 0 ? "#fef2f2" : a.days <= 7 ? "#fffbeb" : "#eff6ff",
                                borderColor: a.days < 0 ? "#fecaca" : a.days <= 7 ? "#fde68a" : "#bfdbfe",
                                color: a.days < 0 ? "#991b1b" : a.days <= 7 ? "#92400e" : "#1d4ed8",
                              }}
                            >
                              {a.days < 0 ? `${Math.abs(a.days)} day(s) overdue` : `${a.days} day(s)`}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({
  title,
  value,
  hint,
  icon,
  danger,
  highlight,
  colSpan,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  danger?: boolean;
  highlight?: boolean;
  colSpan: number;
}) {
  const border = danger ? "#fecaca" : "#e5e7eb";
  const bg = danger ? "#fef2f2" : "white";
  const titleCol = danger ? "#991b1b" : "#374151";
  const valueCol = danger ? "#991b1b" : highlight ? "#065f46" : "#111827";

  return (
    <div style={{ gridColumn: `span ${colSpan}`, background: bg, border: `1px solid ${border}`, borderRadius: 14, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: titleCol, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {title}
          </div>
          <div style={{ marginTop: 8, fontSize: 22, fontWeight: 950, color: valueCol }}>{value}</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>{hint}</div>
        </div>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: "linear-gradient(135deg,#3b82f6,#1d4ed8)",
            display: "grid",
            placeItems: "center",
            color: "white",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

function TopCategories({ expenses }: { expenses: ExpenseRow[] }) {
  const items = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const cat = (e.category ?? "Uncategorised").trim() || "Uncategorised";
      const amt = Number((e as any).amount ?? 0);
      map.set(cat, (map.get(cat) ?? 0) + amt);
    }
    const arr = Array.from(map.entries()).map(([category, total]) => ({ category, total }));
    arr.sort((a, b) => b.total - a.total);
    return arr.slice(0, 6);
  }, [expenses]);

  const max = Math.max(...items.map((i) => i.total), 1);

  if (items.length === 0) {
    return <div style={{ color: "#6b7280", fontSize: 13 }}>No expenses recorded for this period.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((i) => (
        <div key={i.category} style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#111827" }}>{i.category}</div>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#111827" }}>{moneyGBP(i.total)}</div>
          </div>
          <div style={{ height: 10, background: "#f3f4f6", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.round((i.total / max) * 100)}%`, background: "linear-gradient(90deg,#10b981,#059669)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* styles */
const label: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 900,
  color: "#374151",
  marginBottom: 6,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: 14,
  boxSizing: "border-box",
  background: "white",
};

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "white",
  cursor: "pointer",
  color: "#374151",
};

const btnTab: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "white",
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 14,
};

const pill: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  background: "white",
  borderRadius: 14,
  padding: "10px 12px",
  minWidth: 150,
};

const pillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  border: "1px solid #e5e7af",
};

const th: React.CSSProperties = {
  padding: "12px 14px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 900,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const td: React.CSSProperties = {
  padding: "12px 14px",
  color: "#374151",
  verticalAlign: "middle",
};