"use client";

import { useEffect, useMemo, useState } from "react";
// ✅ ONLY CHANGE: replace this import
// import { supabase } from "@/lib/supabaseClient";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  BarChart3,
  Calendar,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  X,
  Pencil,
  Trash2,
  PoundSterling,
} from "lucide-react";

type InvoiceRow = {
  id: string;
  owner_id?: string | null;
  job_date: string | null;
  agreed_amount: number | null;
  invoice_status: string | null; // paid | invoiced | overdue | awaiting_invoice | self_invoiced ...
  invoiced_at: string | null;
  paid_at: string | null;
};

type ExpenseRow = {
  id: string;
  expense_date: string; // YYYY-MM-DD
  category: string;
  vendor: string | null;
  description: string | null;
  amount: number;
  status: "paid" | "unpaid";
  paid_at: string | null;
  vehicle_id: string | null;
  trailer_id: string | null;
  created_at?: string | null;
};

type JobRow = {
  id: string;
  job_date: string | null;
  status: string | null;
  total_distance_miles: number | null;
  planned_distance_miles: number | null;
};

function moneyGBP(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function formatUK(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Simple clean SVG bar chart (no external libs) */
function SimpleBarChart({
  title,
  items,
}: {
  title: string;
  items: { label: string; value: number; sub?: string }[];
}) {
  const max = Math.max(1, ...items.map((i) => Math.max(0, i.value)));
  const height = 140;
  const barW = 64;
  const gap = 18;
  const w = items.length * barW + (items.length - 1) * gap;

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "white" }}>
      <div style={{ fontWeight: 900, color: "#111827", marginBottom: 10 }}>{title}</div>
      <svg width="100%" viewBox={`0 0 ${w} ${height + 50}`} style={{ display: "block" }}>
        {/* baseline */}
        <line x1={0} y1={height} x2={w} y2={height} stroke="#e5e7eb" strokeWidth={2} />
        {items.map((it, idx) => {
          const x = idx * (barW + gap);
          const h = Math.round((Math.max(0, it.value) / max) * (height - 10));
          const y = height - h;
          return (
            <g key={it.label}>
              <rect x={x} y={y} width={barW} height={h} rx={10} ry={10} fill="#3b82f6" />
              <text x={x + barW / 2} y={height + 18} textAnchor="middle" fontSize={11} fill="#374151">
                {it.label}
              </text>
              <text x={x + barW / 2} y={height + 34} textAnchor="middle" fontSize={11} fill="#6b7280">
                {it.sub ?? moneyGBP(it.value)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function ReportsPage() {
  // ✅ ONLY CHANGE: create client inside component
  const supabase = supabaseBrowser();

  const today = new Date();
  const [fromDate, setFromDate] = useState<string>(() => toISODate(startOfMonth(today)));
  const [toDate, setToDate] = useState<string>(() => toISODate(endOfMonth(today)));

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);

  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // modal
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);

  const [form, setForm] = useState({
    expense_date: toISODate(today),
    category: "Fuel",
    vendor: "",
    description: "",
    amount: "0.00",
    status: "unpaid" as "paid" | "unpaid",
  });

  function openAdd() {
    setEditing(null);
    setForm({
      expense_date: toISODate(new Date()),
      category: "Fuel",
      vendor: "",
      description: "",
      amount: "0.00",
      status: "unpaid",
    });
    setError(null);
    setOpen(true);
  }

  function openEdit(r: ExpenseRow) {
    setEditing(r);
    setForm({
      expense_date: r.expense_date,
      category: r.category ?? "General",
      vendor: r.vendor ?? "",
      description: r.description ?? "",
      amount: String(Number(r.amount ?? 0).toFixed(2)),
      status: r.status,
    });
    setError(null);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
  }

  async function load() {
    setBusy(true);
    setError(null);

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = authData?.user;
      if (!user) throw new Error("Auth session missing. Please log in again.");

      // Invoices (use your existing v_invoices)
      const { data: inv, error: invErr } = await supabase
        .from("v_invoices")
        .select("id, job_date, agreed_amount, invoice_status, invoiced_at, paid_at, owner_id")
        .eq("owner_id", user.id)
        .gte("job_date", fromDate)
        .lte("job_date", toDate);

      if (invErr) throw invErr;

      // Expenses
      const { data: exp, error: expErr } = await supabase
        .from("expenses")
        .select("id, expense_date, category, vendor, description, amount, status, paid_at, vehicle_id, trailer_id, created_at")
        .eq("owner_id", user.id)
        .gte("expense_date", fromDate)
        .lte("expense_date", toDate)
        .order("expense_date", { ascending: false });

      if (expErr) throw expErr;

      // Jobs for mileage (completed within date range)
      const { data: j, error: jErr } = await supabase
        .from("jobs")
        .select("id, job_date, status, total_distance_miles, planned_distance_miles")
        .eq("owner_id", user.id)
        .gte("job_date", fromDate)
        .lte("job_date", toDate);

      if (jErr) throw jErr;

      setInvoices((inv as any as InvoiceRow[]) ?? []);
      setExpenses((exp as any as ExpenseRow[]) ?? []);
      setJobs((j as any as JobRow[]) ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load reports.");
      setInvoices([]);
      setExpenses([]);
      setJobs([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate]);

  const metrics = useMemo(() => {
    const paidIncome = invoices
      .filter((i) => (i.invoice_status ?? "").toLowerCase() === "paid")
      .reduce((s, i) => s + Number(i.agreed_amount ?? 0), 0);

    const outstandingIncome = invoices
      .filter((i) => {
        const st = (i.invoice_status ?? "").toLowerCase();
        return st === "invoiced" || st === "overdue";
      })
      .reduce((s, i) => s + Number(i.agreed_amount ?? 0), 0);

    const overdueIncome = invoices
      .filter((i) => (i.invoice_status ?? "").toLowerCase() === "overdue")
      .reduce((s, i) => s + Number(i.agreed_amount ?? 0), 0);

    const awaitingInvoice = invoices
      .filter((i) => (i.invoice_status ?? "").toLowerCase().includes("await"))
      .reduce((s, i) => s + Number(i.agreed_amount ?? 0), 0);

    const expensesPaid = expenses
      .filter((e) => e.status === "paid")
      .reduce((s, e) => s + Number(e.amount ?? 0), 0);

    const expensesUnpaid = expenses
      .filter((e) => e.status === "unpaid")
      .reduce((s, e) => s + Number(e.amount ?? 0), 0);

    const miles = jobs
      .filter((j) => (j.status ?? "").toLowerCase().includes("comp"))
      .reduce((s, j) => s + Number(j.total_distance_miles ?? j.planned_distance_miles ?? 0), 0);

    const netCash = paidIncome - expensesPaid;

    return {
      paidIncome,
      outstandingIncome,
      overdueIncome,
      awaitingInvoice,
      expensesPaid,
      expensesUnpaid,
      netCash,
      miles,
    };
  }, [invoices, expenses, jobs]);

  async function saveExpense() {
    setSaving(true);
    setError(null);

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = authData?.user;
      if (!user) throw new Error("Auth session missing. Please log in again.");

      const amountNum = Number(form.amount);
      if (!Number.isFinite(amountNum) || amountNum < 0) throw new Error("Amount must be a valid number (>= 0).");

      const payload: any = {
        owner_id: user.id,
        expense_date: form.expense_date,
        category: (form.category || "General").trim(),
        vendor: form.vendor.trim() || null,
        description: form.description.trim() || null,
        amount: amountNum,
        status: form.status,
        paid_at: form.status === "paid" ? new Date().toISOString() : null,
      };

      if (!editing) {
        const { error: insErr } = await supabase.from("expenses").insert(payload);
        if (insErr) throw insErr;
      } else {
        const { error: updErr } = await supabase.from("expenses").update(payload).eq("id", editing.id);
        if (updErr) throw updErr;
      }

      closeModal();
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save expense.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleExpensePaid(r: ExpenseRow) {
    setError(null);
    try {
      const newStatus = r.status === "paid" ? "unpaid" : "paid";
      const { error } = await supabase
        .from("expenses")
        .update({ status: newStatus, paid_at: newStatus === "paid" ? new Date().toISOString() : null })
        .eq("id", r.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to update expense status.");
    }
  }

  async function removeExpense(r: ExpenseRow) {
    const ok = confirm(`Delete this expense (${r.category} • ${moneyGBP(r.amount)})?`);
    if (!ok) return;
    setError(null);
    try {
      const { error } = await supabase.from("expenses").delete().eq("id", r.id);
      if (error) throw error;
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete expense.");
    }
  }

  const chartItems = useMemo(
    () => [
      { label: "Received", value: metrics.paidIncome },
      { label: "Outstanding", value: metrics.outstandingIncome },
      { label: "Paid out", value: metrics.expensesPaid },
      { label: "Owe", value: metrics.expensesUnpaid },
    ],
    [metrics]
  );

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", padding: "24px 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 900, margin: 0, color: "#111827", display: "flex", alignItems: "center", gap: 10 }}>
            <BarChart3 size={24} />
            Reports
          </h1>
          <p style={{ margin: "8px 0 0 0", color: "#6b7280" }}>
            Mileage + money in/out for the selected period
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          style={btn}
          title="Refresh"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {/* Controls */}
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
          <div style={{ minWidth: 240 }}>
            <label style={label}>From</label>
            <div style={{ position: "relative" }}>
              <Calendar size={16} style={iconLeft} />
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ ...input, paddingLeft: 38 }} />
            </div>
          </div>

          <div style={{ minWidth: 240 }}>
            <label style={label}>To</label>
            <div style={{ position: "relative" }}>
              <Calendar size={16} style={iconLeft} />
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ ...input, paddingLeft: 38 }} />
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={openAdd} style={{ ...btn, fontWeight: 900 }}>
              <Plus size={16} />
              Add expense
            </button>
          </div>
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
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 18 }}>Loading…</div>
      ) : (
        <>
          {/* KPI cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 14 }}>
            <KPI title="Money received" value={moneyGBP(metrics.paidIncome)} />
            <KPI title="Money outstanding" value={moneyGBP(metrics.outstandingIncome)} sub={`Overdue: ${moneyGBP(metrics.overdueIncome)}`} warn={metrics.overdueIncome > 0} />
            <KPI title="Expenses paid" value={moneyGBP(metrics.expensesPaid)} />
            <KPI title="Expenses unpaid" value={moneyGBP(metrics.expensesUnpaid)} warn={metrics.expensesUnpaid > 0} />
            <KPI title="Net cash (received - paid out)" value={moneyGBP(metrics.netCash)} />
            <KPI title="Mileage (completed)" value={`${Math.round(metrics.miles).toLocaleString("en-GB")} mi`} />
          </div>

          {/* Chart */}
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12, marginBottom: 14 }}>
            <SimpleBarChart title="Cashflow snapshot" items={chartItems} />

            <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "white" }}>
              <div style={{ fontWeight: 900, color: "#111827", marginBottom: 10 }}>Notes</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: "#374151", lineHeight: 1.6 }}>
                <li><strong>Outstanding</strong> = invoiced + overdue (not paid).</li>
                <li><strong>Owe</strong> = unpaid expenses you still need to pay.</li>
                <li><strong>Mileage</strong> = sum of job miles for completed jobs in range.</li>
              </ul>
              <div style={{ marginTop: 10, color: "#6b7280", fontSize: 12 }}>
                (Next: we can add monthly breakdown charts + per-vehicle mileage rankings.)
              </div>
            </div>
          </div>

          {/* Expenses table */}
          <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: 14, borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 900, color: "#111827" }}>Expenses</div>
              <div style={{ color: "#6b7280", fontSize: 12 }}>{fromDate} → {toDate}</div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                    {["Date", "Category", "Vendor", "Description", "Amount", "Status", "Actions"].map((h) => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {expenses.map((r, idx) => (
                    <tr key={r.id} style={{ borderBottom: idx < expenses.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                      <td style={td}>{formatUK(r.expense_date)}</td>
                      <td style={{ ...td, fontWeight: 800, color: "#111827" }}>{r.category}</td>
                      <td style={td}>{r.vendor ?? "-"}</td>
                      <td style={td}>{r.description ?? "-"}</td>
                      <td style={{ ...td, fontWeight: 900, color: "#111827" }}>{moneyGBP(Number(r.amount ?? 0))}</td>
                      <td style={td}>
                        <button
                          type="button"
                          onClick={() => toggleExpensePaid(r)}
                          style={{
                            ...btnSmall,
                            borderColor: r.status === "paid" ? "#a7f3d0" : "#fecaca",
                            background: r.status === "paid" ? "#d1fae5" : "#fef2f2",
                            color: r.status === "paid" ? "#065f46" : "#991b1b",
                            fontWeight: 900,
                          }}
                        >
                          {r.status === "paid" ? <CheckCircle size={14} /> : <PoundSterling size={14} />}
                          {r.status === "paid" ? "Paid" : "Unpaid"}
                        </button>
                      </td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button type="button" onClick={() => openEdit(r)} style={btnSmall}>
                            <Pencil size={14} /> Edit
                          </button>
                          <button type="button" onClick={() => removeExpense(r)} style={{ ...btnSmall, borderColor: "#fecaca", color: "#b91c1c" }}>
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {expenses.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>
                        No expenses in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal */}
      {open && (
        <div
          onMouseDown={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "grid",
            placeItems: "center",
            padding: 20,
            zIndex: 60,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(620px, 96vw)",
              background: "white",
              borderRadius: 16,
              padding: 20,
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#111827" }}>
                  {editing ? "Edit expense" : "Add expense"}
                </h2>
                <div style={{ marginTop: 6, color: "#6b7280", fontSize: 13 }}>
                  Log outgoing costs so your cashflow reports are accurate.
                </div>
              </div>
              <button type="button" onClick={closeModal} style={btnSmall}>
                <X size={14} /> Close
              </button>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <Field label="Date">
                <input type="date" value={form.expense_date} onChange={(e) => setForm((p) => ({ ...p, expense_date: e.target.value }))} style={input} />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Category">
                  <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} style={input}>
                    {["Fuel", "Maintenance", "Tyres", "Tolls", "Insurance", "Tax", "Wages", "Office", "Other"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Status">
                  <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as any }))} style={input}>
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Paid</option>
                  </select>
                </Field>
              </div>

              <Field label="Vendor (optional)">
                <input value={form.vendor} onChange={(e) => setForm((p) => ({ ...p, vendor: e.target.value }))} style={input} placeholder="e.g. Shell / ATS / Halfords" />
              </Field>

              <Field label="Description (optional)">
                <input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} style={input} placeholder="e.g. Fuel card top-up / PMI / repair estimate" />
              </Field>

              <Field label="Amount (£)">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  style={input}
                />
              </Field>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
              <button type="button" onClick={closeModal} disabled={saving} style={{ ...btn, background: "white" }}>
                Cancel
              </button>
              <button type="button" onClick={saveExpense} disabled={saving} style={{ ...btn, background: saving ? "#9ca3af" : "#3b82f6", color: "white", border: "none", fontWeight: 900 }}>
                {saving ? "Saving..." : editing ? "Update" : "Add expense"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KPI({ title, value, sub, warn }: { title: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div
      style={{
        background: warn ? "#fffbeb" : "white",
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, color: warn ? "#92400e" : "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {title}
      </div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, color: "#111827" }}>{value}</div>
      {sub && <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>{sub}</div>}
    </div>
  );
}

function Field({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={label}>{l}</label>
      {children}
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

const th: React.CSSProperties = {
  padding: "14px 16px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 900,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const td: React.CSSProperties = {
  padding: "14px 16px",
  color: "#374151",
  verticalAlign: "middle",
};

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "white",
  cursor: "pointer",
  color: "#374151",
};

const btnSmall: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "white",
  cursor: "pointer",
  color: "#374151",
  fontSize: 13,
};

const iconLeft: React.CSSProperties = {
  position: "absolute",
  left: 12,
  top: "50%",
  transform: "translateY(-50%)",
  color: "#9ca3af",
};
