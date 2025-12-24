"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { AlertCircle, Search } from "lucide-react";

type Row = {
  id: string;
  job_reference: string;
  job_date: string | null;
  customer_name: string | null;
  driver_name: string | null;
  vehicle_reg: string | null;
  trailer_identifier: string | null;

  agreed_amount: number | null;

  invoice_number: string | null;
  invoiced_at: string | null;
  paid_at: string | null;

  invoice_status: string | null;
};

function moneyGBP(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}
function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PaidInvoicesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    setBusy(true);
    setError(null);

    const { data, error } = await supabase
      .from("v_invoices")
      .select(`
        id, job_reference, job_date,
        customer_name,
        driver_name, vehicle_reg, trailer_identifier,
        agreed_amount,
        invoice_number, invoiced_at, paid_at,
        invoice_status
      `)
      .eq("invoice_status", "paid")
      .order("paid_at", { ascending: false });

    setBusy(false);

    if (error) {
      setError(error.message);
      setRows([]);
      return;
    }
    setRows((data as Row[]) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      const hay = [
        r.job_reference,
        r.invoice_number ?? "",
        r.customer_name ?? "",
        r.driver_name ?? "",
        r.vehicle_reg ?? "",
        r.trailer_identifier ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [rows, search]);

  const total = useMemo(() => filtered.reduce((s, r) => s + Number(r.agreed_amount ?? 0), 0), [filtered]);

  return (
    <div style={{ maxWidth: 1250, margin: "0 auto", padding: "24px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 900, margin: 0, color: "#111827" }}>Paid / Records</h1>
          <p style={{ margin: "6px 0 0 0", color: "#6b7280" }}>
            Paid completed loads. Total shown respects filters.
          </p>
        </div>
        <div style={{ fontWeight: 900, color: "#111827" }}>{moneyGBP(total)}</div>
      </div>

      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, marginBottom: 14 }}>
        <div style={{ position: "relative" }}>
          <Search size={18} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
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
      </div>

      {error && (
        <div style={{ marginBottom: 14, padding: 14, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, display: "flex", gap: 10 }}>
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
                  {["Job", "Customer", "Driver/Vehicle", "Amount", "Invoice", "Invoiced", "Paid"].map((h) => (
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
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filtered.map((r, idx) => (
                  <tr key={r.id} style={{ borderBottom: idx < filtered.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: 900, color: "#111827" }}>{r.job_reference}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{formatDate(r.job_date)}</div>
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: 700, color: "#111827" }}>{r.customer_name ?? "-"}</td>
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
                    <td style={{ padding: "14px 16px" }}>{r.invoice_number ?? "-"}</td>
                    <td style={{ padding: "14px 16px" }}>{formatDate(r.invoiced_at)}</td>
                    <td style={{ padding: "14px 16px" }}>{formatDate(r.paid_at)}</td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: 28, textAlign: "center", color: "#6b7280" }}>
                      No paid records yet.
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
