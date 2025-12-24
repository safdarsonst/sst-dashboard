"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AlertCircle, CheckCircle, Search } from "lucide-react";

type InvoiceStatus = "awaiting_invoice" | "invoiced" | "paid" | "self_invoiced";

type Row = {
  id: string;
  job_reference: string;
  job_date: string | null;

  customer_name: string | null;

  driver_name: string | null;
  vehicle_reg: string | null;
  trailer_identifier: string | null;

  agreed_amount: number | null;

  invoice_terms: string | null;

  invoice_status: InvoiceStatus | null;
  invoice_number: string | null;
  invoiced_at: string | null;
  paid_at: string | null;
  self_invoiced: boolean | null;

  due_date: string | null; // date
  is_overdue: boolean | null;
};

function moneyGBP(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}
function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function formatDateTime(d: string | null | undefined) {
  if (!d) return "-";
  const dt = new Date(d);
  return dt.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function InvoicesPage() {
  // ✅ cookie-aware client (fixes custom domain session issues)
  const supabase = supabaseBrowser();

  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "awaiting_invoice" | "invoiced" | "self_invoiced" | "overdue"
  >("all");

  async function load() {
    setBusy(true);
    setError(null);

    try {
      // ✅ Auth guard
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      if (!authData?.user) {
        window.location.href = "/login";
        return;
      }

      // show completed loads that are NOT paid
      const { data, error } = await supabase
        .from("v_invoices")
        .select(
          "id, job_reference, job_date, customer_name, driver_name, vehicle_reg, trailer_identifier, agreed_amount, invoice_terms, invoice_status, invoice_number, invoiced_at, paid_at, self_invoiced, due_date, is_overdue"
        )
        .neq("invoice_status", "paid")
        .order("job_date", { ascending: false });

      if (error) throw error;

      setRows((data as Row[]) ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load invoices.");
      setRows([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    let out = rows;

    if (statusFilter === "overdue") {
      out = out.filter((r) => !!r.is_overdue);
    } else if (statusFilter !== "all") {
      out = out.filter((r) => (r.invoice_status ?? "awaiting_invoice") === statusFilter);
    }

    if (!term) return out;

    return out.filter((r) => {
      const hay = [
        r.job_reference,
        r.customer_name ?? "",
        r.driver_name ?? "",
        r.vehicle_reg ?? "",
        r.trailer_identifier ?? "",
        r.invoice_number ?? "",
        r.invoice_terms ?? "",
        r.invoice_status ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(term);
    });
  }, [rows, search, statusFilter]);

  const totals = useMemo(() => {
    const awaiting = rows
      .filter((r) => (r.invoice_status ?? "awaiting_invoice") === "awaiting_invoice")
      .reduce((s, r) => s + Number(r.agreed_amount ?? 0), 0);

    const overdue = rows
      .filter((r) => !!r.is_overdue)
      .reduce((s, r) => s + Number(r.agreed_amount ?? 0), 0);

    const invoiced = rows
      .filter(
        (r) =>
          (r.invoice_status ?? "awaiting_invoice") === "invoiced" ||
          (r.invoice_status ?? "") === "self_invoiced"
      )
      .reduce((s, r) => s + Number(r.agreed_amount ?? 0), 0);

    return { awaiting, overdue, invoiced };
  }, [rows]);

  async function updateJob(id: string, patch: Record<string, any>) {
    setSavingId(id);
    setError(null);

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      if (!authData?.user) throw new Error("Auth session missing. Please log in again.");

      const { error } = await supabase.from("jobs").update(patch).eq("id", id);
      if (error) throw error;

      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to update job.");
    } finally {
      setSavingId(null);
    }
  }

  function markAwaitingInvoice(r: Row) {
    return updateJob(r.id, {
      invoice_status: "awaiting_invoice",
      self_invoiced: false,
      invoice_number: null,
      invoiced_at: null,
      paid_at: null,
    });
  }

  function markInvoiced(r: Row) {
    const now = new Date().toISOString();
    return updateJob(r.id, {
      invoice_status: "invoiced",
      self_invoiced: false,
      invoiced_at: r.invoiced_at ?? now,
      paid_at: null,
    });
  }

  function markSelfInvoiced(r: Row) {
    const now = new Date().toISOString();
    return updateJob(r.id, {
      invoice_status: "self_invoiced",
      self_invoiced: true,
      invoiced_at: r.invoiced_at ?? now,
      paid_at: null,
    });
  }

  function markPaid(r: Row) {
    const now = new Date().toISOString();
    return updateJob(r.id, {
      invoice_status: "paid",
      paid_at: now,
      invoiced_at: r.invoiced_at ?? now,
    });
  }

  function saveInvoiceNumber(r: Row, invoice_number: string) {
    return updateJob(r.id, {
      invoice_number: invoice_number.trim() || null,
    });
  }

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", padding: "24px 20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "end",
          marginBottom: 14,
        }}
      >
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 900, margin: 0, color: "#111827" }}>
            Invoices
          </h1>
          <p style={{ margin: "6px 0 0 0", color: "#6b7280" }}>
            Completed loads that still need invoicing / payment tracking.
          </p>
        </div>
      </div>

      {/* Totals */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <StatCard title="Awaiting invoice" value={moneyGBP(totals.awaiting)} hint="Not invoiced yet" />
        <StatCard title="Overdue" value={moneyGBP(totals.overdue)} hint="Past due date" danger />
        <StatCard title="Invoiced (unpaid)" value={moneyGBP(totals.invoiced)} hint="Sent but not paid" />
      </div>

      {/* Search + Filter */}
      <div
        style={{
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 14,
          marginBottom: 14,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", flex: 1 }}>
          <Search
            size={18}
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#9ca3af",
            }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search job ref, invoice no, customer, driver, reg…"
            style={{
              width: "100%",
              padding: "12px 12px 12px 40px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              outline: "none",
              fontSize: 14,
              background: "white",
              boxSizing: "border-box",
            }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          style={{
            padding: "12px 12px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            background: "white",
            fontSize: 14,
          }}
        >
          <option value="all">All</option>
          <option value="awaiting_invoice">Awaiting invoice</option>
          <option value="invoiced">Invoiced</option>
          <option value="self_invoiced">Self invoiced</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {error && (
        <div
          style={{
            marginBottom: 14,
            padding: 14,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 12,
            display: "flex",
            gap: 10,
          }}
        >
          <AlertCircle size={20} color="#dc2626" />
          <div style={{ color: "#991b1b" }}>{error}</div>
        </div>
      )}

      {busy ? (
        <p>Loading…</p>
      ) : (
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                  {["Job", "Customer", "Driver / Vehicle", "Amount", "Status", "Invoice No", "Invoiced", "Due", "Actions"].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding: "14px 16px",
                          textAlign: "left",
                          fontSize: 12,
                          fontWeight: 900,
                          color: "#374151",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>

              <tbody>
                {filtered.map((r, idx) => {
                  const status = (r.invoice_status ?? "awaiting_invoice") as InvoiceStatus;
                  const overdue = !!r.is_overdue;

                  return (
                    <tr
                      key={r.id}
                      style={{ borderBottom: idx < filtered.length - 1 ? "1px solid #f3f4f6" : "none" }}
                    >
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontWeight: 900, color: "#111827" }}>{r.job_reference}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{formatDate(r.job_date)}</div>
                      </td>

                      <td style={{ padding: "14px 16px", fontWeight: 700, color: "#111827" }}>
                        {r.customer_name ?? "-"}
                      </td>

                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontWeight: 700, color: "#111827" }}>{r.driver_name ?? "-"}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>
                          {r.vehicle_reg ? `Vehicle: ${r.vehicle_reg}` : "Vehicle: -"}
                          {r.trailer_identifier ? ` • Trailer: ${r.trailer_identifier}` : ""}
                        </div>
                      </td>

                      <td style={{ padding: "14px 16px", fontWeight: 900, color: "#111827" }}>
                        {moneyGBP(Number(r.agreed_amount ?? 0))}
                      </td>

                      <td style={{ padding: "14px 16px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "6px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                            border: "1px solid #e5e7eb",
                            background: overdue ? "#fef2f2" : "#f3f4f6",
                            color: overdue ? "#b91c1c" : "#374151",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {overdue ? "OVERDUE" : status.toUpperCase()}
                        </span>
                      </td>

                      <td style={{ padding: "14px 16px", minWidth: 180 }}>
                        <input
                          defaultValue={r.invoice_number ?? ""}
                          placeholder="e.g. INV-000123"
                          onBlur={(e) => saveInvoiceNumber(r, e.target.value)}
                          style={{
                            width: "100%",
                            padding: "10px 10px",
                            borderRadius: 10,
                            border: "1px solid #d1d5db",
                            outline: "none",
                            fontSize: 13,
                            background: "white",
                            boxSizing: "border-box",
                          }}
                        />
                      </td>

                      <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }}>{formatDateTime(r.invoiced_at)}</td>
                      <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }}>{formatDate(r.due_date)}</td>

                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            disabled={savingId === r.id}
                            onClick={() => markAwaitingInvoice(r)}
                            style={btnSecondary}
                            type="button"
                          >
                            Awaiting
                          </button>
                          <button
                            disabled={savingId === r.id}
                            onClick={() => markInvoiced(r)}
                            style={btnPrimary}
                            type="button"
                          >
                            Invoiced
                          </button>
                          <button
                            disabled={savingId === r.id}
                            onClick={() => markSelfInvoiced(r)}
                            style={btnPurple}
                            type="button"
                          >
                            Self
                          </button>
                          <button
                            disabled={savingId === r.id}
                            onClick={() => markPaid(r)}
                            style={btnSuccess}
                            type="button"
                          >
                            <CheckCircle size={14} /> Paid
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: 28, textAlign: "center", color: "#6b7280" }}>
                      No outstanding completed loads match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
  danger,
}: {
  title: string;
  value: string;
  hint: string;
  danger?: boolean;
}) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 13, color: "#6b7280", fontWeight: 800 }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color: danger ? "#b91c1c" : "#111827", marginTop: 6 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{hint}</div>
    </div>
  );
}

const btnBase: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 12,
  border: "1px solid #d1d5db",
  background: "white",
  color: "#374151",
};

const btnSecondary: React.CSSProperties = {
  ...btnBase,
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1d4ed8",
};

const btnPurple: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #ddd6fe",
  background: "#f5f3ff",
  color: "#6d28d9",
};

const btnSuccess: React.CSSProperties = {
  ...btnBase,
  border: "1px solid #bbf7d0",
  background: "#dcfce7",
  color: "#166534",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};
