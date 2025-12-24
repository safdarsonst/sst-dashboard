"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import AddJobModal from "@/components/AddJobModal";

type JobRow = {
  id: string;
  job_reference: string;
  job_date: string;
  status: string;
  invoice_terms: string | null;
  agreed_amount: number | null;

  customer_name: string;
  driver_name: string | null;
  vehicle_reg: string | null;

  total_distance_miles: number | null;
  rate_per_mile: number | null;

  // these may be missing unless you add them to the view
  customer_id?: string | null;
  driver_id?: string | null;
  vehicle_id?: string | null;
  trailer_id?: string | null;
};

const statusColors: Record<string, { bg: string; text: string }> = {
  booked: { bg: "#eff6ff", text: "#1d4ed8" },
  in_progress: { bg: "#fef3c7", text: "#92400e" },
  completed: { bg: "#d1fae5", text: "#065f46" },
};

export default function JobsPage() {
  // ✅ cookie-aware client instance
  const supabase = supabaseBrowser();

  const [rows, setRows] = useState<JobRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<any | null>(null);

  function openAdd() {
    setEditingJob(null);
    setOpen(true);
  }

  // ✅ FIX: fetch real job + allocation + stops for editing
  async function openEdit(row: JobRow) {
    setError(null);
    setBusy(true);

    try {
      // ✅ Auth guard (prevents “auth session missing” weirdness on custom domain)
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      if (!authData?.user) {
        window.location.href = "/login";
        return;
      }

      // 1) jobs table (authoritative IDs)
      const { data: job, error: jobErr } = await supabase
        .from("jobs")
        .select(
          "id, job_reference, job_date, status, invoice_terms, agreed_amount, customer_id, planned_distance_miles, total_distance_miles"
        )
        .eq("id", row.id)
        .single();

      if (jobErr) throw jobErr;

      // 2) job_allocations (do NOT use single/maybeSingle)
      const { data: allocRows, error: allocErr } = await supabase
        .from("job_allocations")
        .select("driver_id, vehicle_id, trailer_id")
        .eq("job_id", row.id);

      if (allocErr) throw allocErr;

      const alloc = (allocRows ?? [])[0] ?? null;

      // 3) job_stops (route prefill)
      const { data: stops, error: stopsErr } = await supabase
        .from("job_stops")
        .select("stop_order, postcode, name, planned_time, lat, lng")
        .eq("job_id", row.id)
        .order("stop_order", { ascending: true });

      if (stopsErr) throw stopsErr;

      setEditingJob({
        ...job,
        driver_id: alloc?.driver_id ?? null,
        vehicle_id: alloc?.vehicle_id ?? null,
        trailer_id: alloc?.trailer_id ?? null,
        route_stops: stops ?? [],
        // keep for UI convenience
        customer_name: row.customer_name,
        driver_name: row.driver_name,
        vehicle_reg: row.vehicle_reg,
        rate_per_mile: row.rate_per_mile,
      });

      setOpen(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load job for editing.");
    } finally {
      setBusy(false);
    }
  }

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

      const { data, error } = await supabase
        .from("v_jobs_open")
        .select("*")
        .order("job_date", { ascending: true })
        .order("next_stop_time", { ascending: true, nullsFirst: false });

      if (error) throw error;

      setRows((data as JobRow[]) ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load jobs.");
      setRows([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * ✅ Money formatting:
   * - show £111 (no decimals) if the value is effectively an integer
   * - show £111.32 if it has decimals
   */
  const formatCurrencySmart = (amount: number | null) => {
    if (amount === null) return "-";

    // Handle floating point quirks safely
    const roundedToCents = Math.round(amount * 100) / 100;
    const isWhole = Math.abs(roundedToCents - Math.round(roundedToCents)) < 1e-9;

    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
      minimumFractionDigits: isWhole ? 0 : 2,
      maximumFractionDigits: isWhole ? 0 : 2,
    }).format(roundedToCents);
  };

  /**
   * ✅ £/mile:
   * - prefer r.rate_per_mile (from view) if present
   * - otherwise compute from agreed_amount / total_distance_miles
   */
  const formatRatePerMile = (r: JobRow) => {
    const miles = r.total_distance_miles;
    const amount = r.agreed_amount;

    let rate: number | null = null;

    if (typeof r.rate_per_mile === "number" && Number.isFinite(r.rate_per_mile)) {
      rate = r.rate_per_mile;
    } else if (
      typeof amount === "number" &&
      Number.isFinite(amount) &&
      typeof miles === "number" &&
      Number.isFinite(miles) &&
      miles > 0
    ) {
      rate = amount / miles;
    }

    if (rate === null) return "-";
    return `£${rate.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  };

  return (
    <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "20px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
          paddingBottom: "16px",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "#111827", marginBottom: "4px" }}>
            Jobs
          </h1>
          <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
            {rows.length} job{rows.length !== 1 ? "s" : ""} in the system
          </p>
        </div>

        <button
          onClick={openAdd}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "10px 20px",
            background: "#3b82f6",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            fontWeight: 500,
            fontSize: "14px",
            transition: "all 0.2s ease",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
          }}
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add Job
        </button>
      </div>

      {/* Loading + Error */}
      {busy && <p>Loading…</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {/* Table */}
      {!busy && !error && (
        <div
          style={{
            background: "white",
            borderRadius: "12px",
            border: "1px solid #e5e7eb",
            overflow: "hidden",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
          }}
        >
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  {[
                    "Ref",
                    "Date",
                    "Customer",
                    "Status",
                    "Terms",
                    "Amount",
                    "Driver",
                    "Vehicle",
                    "Miles",
                    "£/mile",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "16px 12px",
                        textAlign: "left",
                        fontSize: "12px",
                        fontWeight: 600,
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
                {rows.map((r, index) => (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: index < rows.length - 1 ? "1px solid #f3f4f6" : "none",
                      transition: "background 0.2s ease",
                    }}
                  >
                    <td style={{ padding: "16px 12px", fontWeight: 600, color: "#111827" }}>
                      {r.job_reference}
                    </td>
                    <td style={{ padding: "16px 12px", color: "#374151", fontSize: "14px" }}>
                      {formatDate(r.job_date)}
                    </td>
                    <td style={{ padding: "16px 12px", color: "#374151", fontSize: "14px" }}>
                      {r.customer_name}
                    </td>

                    <td style={{ padding: "16px 12px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "4px 12px",
                          borderRadius: "20px",
                          fontSize: "12px",
                          fontWeight: 500,
                          textTransform: "capitalize",
                          background: statusColors[r.status]?.bg || "#f3f4f6",
                          color: statusColors[r.status]?.text || "#374151",
                        }}
                      >
                        {r.status.replace("_", " ")}
                      </span>
                    </td>

                    <td style={{ padding: "16px 12px", color: "#6b7280", fontSize: "14px" }}>
                      {r.invoice_terms ? r.invoice_terms.replaceAll("_", " ") : "-"}
                    </td>

                    <td style={{ padding: "16px 12px", fontWeight: 600, color: "#111827" }}>
                      {formatCurrencySmart(r.agreed_amount)}
                    </td>

                    <td style={{ padding: "16px 12px", color: "#374151", fontSize: "14px" }}>
                      {r.driver_name ?? "-"}
                    </td>
                    <td style={{ padding: "16px 12px", color: "#374151", fontSize: "14px" }}>
                      {r.vehicle_reg ?? "-"}
                    </td>

                    <td style={{ padding: "16px 12px", color: "#374151", fontSize: "14px" }}>
                      {r.total_distance_miles != null ? `${r.total_distance_miles} mi` : "-"}
                    </td>

                    <td style={{ padding: "16px 12px", fontWeight: 500, color: "#10b981" }}>
                      {formatRatePerMile(r)}
                    </td>

                    <td style={{ padding: "16px 12px" }}>
                      <button
                        title="Edit"
                        onClick={() => openEdit(r)}
                        style={{
                          border: "1px solid #d1d5db",
                          borderRadius: "6px",
                          padding: "8px 12px",
                          cursor: "pointer",
                          background: "white",
                          color: "#374151",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                        }}
                        type="button"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rows.length === 0 && <div style={{ padding: 24, color: "#6b7280" }}>No jobs found.</div>}
        </div>
      )}

      <AddJobModal open={open} onClose={() => setOpen(false)} onSaved={() => load()} job={editingJob} />
    </div>
  );
}
