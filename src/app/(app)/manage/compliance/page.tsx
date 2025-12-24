"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AlertCircle, CheckCircle, Save, Shield } from "lucide-react";

type VehicleRow = {
  id: string;
  registration: string;
  make: string | null;
  model: string | null;
  active: boolean | null;

  mot_due: string | null; // date (YYYY-MM-DD)
  tax_due: string | null; // date
  insurance_due: string | null; // date
  service_due_date: string | null; // date

  created_at?: string | null;
};

type TrailerRow = {
  id: string;
  identifier: string;
  active: boolean | null;
  mot_due: string | null; // date
  created_at?: string | null;
};

type RowKind = "vehicle" | "trailer";

function upper(v: string | null | undefined) {
  return (v ?? "").toUpperCase();
}

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const target = new Date(dateStr + "T00:00:00");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

function dueChip(dateStr: string | null) {
  const d = daysUntil(dateStr);
  if (d === null) return { label: "Not set", bg: "#f3f4f6", fg: "#374151", border: "#e5e7eb" };
  if (d < 0) return { label: `Overdue (${Math.abs(d)}d)`, bg: "#fef2f2", fg: "#991b1b", border: "#fecaca" };
  if (d <= 30) return { label: `Due soon (${d}d)`, bg: "#fff7ed", fg: "#9a3412", border: "#fed7aa" };
  return { label: `OK (${d}d)`, bg: "#ecfdf5", fg: "#065f46", border: "#bbf7d0" };
}

export default function CompliancePage() {
  // ✅ cookie-aware supabase client (good for custom domain)
  const supabase = supabaseBrowser();

  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [trailers, setTrailers] = useState<TrailerRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Local editable drafts: key = `${kind}:${id}`
  const [drafts, setDrafts] = useState<Record<string, any>>({});

  async function ensureAuth() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!data?.user) {
      window.location.href = "/login";
      return false;
    }
    return true;
  }

  async function load() {
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const ok = await ensureAuth();
      if (!ok) return;

      const [vRes, tRes] = await Promise.all([
        supabase
          .from("vehicles")
          .select("id, registration, make, model, active, mot_due, tax_due, insurance_due, service_due_date, created_at")
          .eq("active", true)
          .order("registration", { ascending: true }),

        supabase
          .from("trailers")
          .select("id, identifier, active, mot_due, created_at")
          .eq("active", true)
          .order("identifier", { ascending: true }),
      ]);

      if (vRes.error) throw vRes.error;
      if (tRes.error) throw tRes.error;

      setVehicles((vRes.data as VehicleRow[]) ?? []);
      setTrailers((tRes.data as TrailerRow[]) ?? []);

      // reset drafts
      setDrafts({});
    } catch (e: any) {
      setError(e?.message ?? "Failed to load compliance data.");
      setVehicles([]);
      setTrailers([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => {
    const allDates: Array<{ kind: RowKind; field: string; date: string | null }> = [];

    for (const v of vehicles) {
      allDates.push({ kind: "vehicle", field: "mot_due", date: v.mot_due });
      allDates.push({ kind: "vehicle", field: "tax_due", date: v.tax_due });
      allDates.push({ kind: "vehicle", field: "insurance_due", date: v.insurance_due });
      allDates.push({ kind: "vehicle", field: "service_due_date", date: v.service_due_date });
    }
    for (const t of trailers) {
      allDates.push({ kind: "trailer", field: "mot_due", date: t.mot_due });
    }

    const overdue = allDates.filter((x) => (daysUntil(x.date) ?? 999999) < 0).length;
    const dueSoon = allDates.filter((x) => {
      const d = daysUntil(x.date);
      return d !== null && d >= 0 && d <= 30;
    }).length;

    return { overdue, dueSoon };
  }, [vehicles, trailers]);

  function draftKey(kind: RowKind, id: string) {
    return `${kind}:${id}`;
  }

  function setDraft(kind: RowKind, id: string, field: string, value: string) {
    const k = draftKey(kind, id);
    setDrafts((prev) => ({
      ...prev,
      [k]: { ...(prev[k] ?? {}), [field]: value },
    }));
  }

  function getValue(kind: RowKind, row: any, field: string) {
    const k = draftKey(kind, row.id);
    const draft = drafts[k]?.[field];
    return typeof draft === "string" ? draft : (row[field] ?? "");
  }

  function hasChanges(kind: RowKind, row: any) {
    const k = draftKey(kind, row.id);
    const d = drafts[k];
    if (!d) return false;
    return Object.keys(d).some((field) => (d[field] ?? "") !== (row[field] ?? ""));
  }

  async function saveRow(kind: RowKind, row: any) {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const ok = await ensureAuth();
      if (!ok) return;

      const k = draftKey(kind, row.id);
      const d = drafts[k];
      if (!d || Object.keys(d).length === 0) return;

      // Normalize: empty string => null (so you can clear dates)
      const payload: any = {};
      for (const [field, value] of Object.entries(d)) {
        const v = String(value ?? "").trim();
        payload[field] = v ? v : null;
      }

      const table = kind === "vehicle" ? "vehicles" : "trailers";

      const { error } = await supabase.from(table).update(payload).eq("id", row.id);
      if (error) throw error;

      setSuccess("Saved successfully.");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111827", margin: 0 }}>Compliance</h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "6px 0 0 0" }}>
            Vehicles: MOT, Tax, Insurance, Service date • Trailers: MOT
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, background: "#fff7ed", border: "1px solid #fed7aa" }}>
            <Shield size={16} />
            <span style={{ fontWeight: 800, color: "#9a3412" }}>{summary.dueSoon} due soon</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 12, background: "#fef2f2", border: "1px solid #fecaca" }}>
            <AlertCircle size={16} />
            <span style={{ fontWeight: 800, color: "#991b1b" }}>{summary.overdue} overdue</span>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 14, padding: 14, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, display: "flex", gap: 10 }}>
          <AlertCircle size={20} color="#dc2626" />
          <div style={{ color: "#991b1b" }}>{error}</div>
        </div>
      )}

      {success && (
        <div style={{ marginBottom: 14, padding: 14, background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 12, display: "flex", gap: 10 }}>
          <CheckCircle size={20} color="#059669" />
          <div style={{ color: "#065f46" }}>{success}</div>
        </div>
      )}

      {busy ? (
        <p>Loading…</p>
      ) : (
        <>
          {/* Vehicles */}
          <section style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: "#111827", margin: "12px 0" }}>Vehicles</h2>

            <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                      {["Registration", "Make/Model", "MOT due", "Tax due", "Insurance due", "Service due", "Actions"].map((h) => (
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
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {vehicles.map((v, idx) => (
                      <tr key={v.id} style={{ borderBottom: idx < vehicles.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                        <td style={{ padding: "14px 16px", fontWeight: 900, color: "#111827" }}>{upper(v.registration)}</td>
                        <td style={{ padding: "14px 16px", color: "#374151" }}>
                          {(v.make ?? "-")} {(v.model ? `• ${v.model}` : "")}
                        </td>

                        <DueDateCell
                          value={getValue("vehicle", v, "mot_due")}
                          onChange={(val) => setDraft("vehicle", v.id, "mot_due", val)}
                          chip={dueChip((getValue("vehicle", v, "mot_due") as string) || null)}
                        />

                        <DueDateCell
                          value={getValue("vehicle", v, "tax_due")}
                          onChange={(val) => setDraft("vehicle", v.id, "tax_due", val)}
                          chip={dueChip((getValue("vehicle", v, "tax_due") as string) || null)}
                        />

                        <DueDateCell
                          value={getValue("vehicle", v, "insurance_due")}
                          onChange={(val) => setDraft("vehicle", v.id, "insurance_due", val)}
                          chip={dueChip((getValue("vehicle", v, "insurance_due") as string) || null)}
                        />

                        <DueDateCell
                          value={getValue("vehicle", v, "service_due_date")}
                          onChange={(val) => setDraft("vehicle", v.id, "service_due_date", val)}
                          chip={dueChip((getValue("vehicle", v, "service_due_date") as string) || null)}
                        />

                        <td style={{ padding: "14px 16px" }}>
                          <button
                            type="button"
                            disabled={saving || !hasChanges("vehicle", v)}
                            onClick={() => saveRow("vehicle", v)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "9px 12px",
                              borderRadius: 10,
                              border: "1px solid #d1d5db",
                              background: hasChanges("vehicle", v) ? "#111827" : "white",
                              color: hasChanges("vehicle", v) ? "white" : "#374151",
                              cursor: saving || !hasChanges("vehicle", v) ? "not-allowed" : "pointer",
                              fontWeight: 900,
                              opacity: saving ? 0.7 : 1,
                              whiteSpace: "nowrap",
                            }}
                          >
                            <Save size={16} />
                            Save
                          </button>
                        </td>
                      </tr>
                    ))}

                    {vehicles.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: 18, textAlign: "center", color: "#6b7280" }}>
                          No active vehicles found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Trailers */}
          <section style={{ marginBottom: 18 }}>
            <h2 style={{ fontSize: 18, fontWeight: 900, color: "#111827", margin: "12px 0" }}>Trailers</h2>

            <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                      {["Identifier", "MOT due", "Actions"].map((h) => (
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
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {trailers.map((t, idx) => (
                      <tr key={t.id} style={{ borderBottom: idx < trailers.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                        <td style={{ padding: "14px 16px", fontWeight: 900, color: "#111827" }}>{upper(t.identifier)}</td>

                        <DueDateCell
                          value={getValue("trailer", t, "mot_due")}
                          onChange={(val) => setDraft("trailer", t.id, "mot_due", val)}
                          chip={dueChip((getValue("trailer", t, "mot_due") as string) || null)}
                        />

                        <td style={{ padding: "14px 16px" }}>
                          <button
                            type="button"
                            disabled={saving || !hasChanges("trailer", t)}
                            onClick={() => saveRow("trailer", t)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "9px 12px",
                              borderRadius: 10,
                              border: "1px solid #d1d5db",
                              background: hasChanges("trailer", t) ? "#111827" : "white",
                              color: hasChanges("trailer", t) ? "white" : "#374151",
                              cursor: saving || !hasChanges("trailer", t) ? "not-allowed" : "pointer",
                              fontWeight: 900,
                              opacity: saving ? 0.7 : 1,
                              whiteSpace: "nowrap",
                            }}
                          >
                            <Save size={16} />
                            Save
                          </button>
                        </td>
                      </tr>
                    ))}

                    {trailers.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ padding: 18, textAlign: "center", color: "#6b7280" }}>
                          No active trailers found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <p style={{ fontSize: 12, color: "#6b7280" }}>Tip: Leave a date empty to clear it, then hit Save.</p>
        </>
      )}
    </div>
  );
}

function DueDateCell({
  value,
  onChange,
  chip,
}: {
  value: string;
  onChange: (v: string) => void;
  chip: { label: string; bg: string; fg: string; border: string };
}) {
  return (
    <td style={{ padding: "14px 16px", color: "#374151" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <input
          type="date"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            background: "white",
            fontWeight: 700,
          }}
        />
        <span
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            background: chip.bg,
            color: chip.fg,
            border: `1px solid ${chip.border}`,
            fontSize: 12,
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}
          title={chip.label}
        >
          {chip.label}
        </span>
      </div>
    </td>
  );
}
