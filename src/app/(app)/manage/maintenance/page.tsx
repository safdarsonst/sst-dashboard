"use client";

import { useEffect, useMemo, useState } from "react";
// ✅ ONLY CHANGE: replace this import
// import { supabase } from "@/lib/supabaseClient";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  Plus,
  Edit,
  Trash2,
  Search,
  AlertCircle,
  CheckCircle,
  Wrench,
  CalendarDays,
  PoundSterling,
} from "lucide-react";

type AssetType = "vehicle" | "trailer";
type WorkType = "service" | "pmi" | "repair" | "other";
type Status = "raised" | "estimated" | "approved" | "invoiced" | "paid" | "cancelled";

type VehicleOption = {
  id: string;
  registration: string;
  make: string | null;
  model: string | null;
};

type TrailerOption = {
  id: string;
  identifier: string; // reg
  make: string | null;
  type: string | null;
};

type MaintenanceRow = {
  id: string;
  asset_type: AssetType;
  vehicle_id: string | null;
  trailer_id: string | null;
  work_type: WorkType;
  work_date: string; // YYYY-MM-DD
  po_number: string;
  supplier_name: string | null;
  notes: string | null;
  estimate_amount: number | null;
  payment_due: string | null; // YYYY-MM-DD
  status: Status;
  created_at: string;
};

type FormState = {
  asset_type: AssetType;
  vehicle_id: string;
  trailer_id: string;
  work_type: WorkType;
  work_date: string;
  po_number: string;

  supplier_name: string;
  notes: string;

  estimate_amount: string; // keep as string for input
  payment_due: string; // date input
  status: Status;
};

const WORK_TYPES: { value: WorkType; label: string }[] = [
  { value: "service", label: "Service" },
  { value: "pmi", label: "PMI" },
  { value: "repair", label: "Repair" },
  { value: "other", label: "Other" },
];

const STATUSES: { value: Status; label: string }[] = [
  { value: "raised", label: "Raised" },
  { value: "estimated", label: "Estimated" },
  { value: "approved", label: "Approved" },
  { value: "invoiced", label: "Invoiced" },
  { value: "paid", label: "Paid" },
  { value: "cancelled", label: "Cancelled" },
];

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function cleanTextOptional(v: string) {
  const s = v.trim();
  return s.length ? s : null;
}

function cleanNumberOptional(v: string) {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

function formatGBP(n: number | null) {
  if (n == null) return "-";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function badgeStyles(status: Status): { bg: string; text: string; border: string } {
  switch (status) {
    case "raised":
      return { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" };
    case "estimated":
      return { bg: "#fef3c7", text: "#92400e", border: "#fde68a" };
    case "approved":
      return { bg: "#d1fae5", text: "#065f46", border: "#a7f3d0" };
    case "invoiced":
      return { bg: "#ede9fe", text: "#5b21b6", border: "#ddd6fe" };
    case "paid":
      return { bg: "#dcfce7", text: "#166534", border: "#bbf7d0" };
    case "cancelled":
      return { bg: "#fee2e2", text: "#991b1b", border: "#fecaca" };
    default:
      return { bg: "#f3f4f6", text: "#374151", border: "#e5e7eb" };
  }
}

export default function MaintenancePage() {
  // ✅ ONLY CHANGE: create client inside component
  const supabase = supabaseBrowser();

  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<MaintenanceRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [assetFilter, setAssetFilter] = useState<AssetType | "all">("all");

  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [trailers, setTrailers] = useState<TrailerOption[]>([]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceRow | null>(null);

  const [form, setForm] = useState<FormState>({
    asset_type: "vehicle",
    vehicle_id: "",
    trailer_id: "",
    work_type: "service",
    work_date: todayISODate(),
    po_number: "",
    supplier_name: "",
    notes: "",
    estimate_amount: "",
    payment_due: "",
    status: "raised",
  });

  const title = useMemo(() => (editing ? "Edit Maintenance Record" : "Raise Maintenance PO"), [editing]);

  const filteredRows = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();

    return rows.filter((r) => {
      if (assetFilter !== "all" && r.asset_type !== assetFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;

      if (!t) return true;

      const hay = [
        r.po_number,
        r.asset_type,
        r.work_type,
        r.status,
        r.work_date,
        r.payment_due ?? "",
        r.supplier_name ?? "",
        r.notes ?? "",
        String(r.estimate_amount ?? ""),
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(t);
    });
  }, [rows, searchTerm, statusFilter, assetFilter]);

  async function load() {
    setBusy(true);
    setError(null);

    try {
      const [ordersRes, vehiclesRes, trailersRes] = await Promise.all([
        supabase
          .from("maintenance_orders")
          .select(
            "id, asset_type, vehicle_id, trailer_id, work_type, work_date, po_number, supplier_name, notes, estimate_amount, payment_due, status, created_at"
          )
          .order("work_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.from("vehicles").select("id, registration, make, model").order("registration", { ascending: true }),
        supabase.from("trailers").select("id, identifier, make, type").order("identifier", { ascending: true }),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (vehiclesRes.error) throw vehiclesRes.error;
      if (trailersRes.error) throw trailersRes.error;

      setRows((ordersRes.data as MaintenanceRow[]) ?? []);
      setVehicles((vehiclesRes.data as VehicleOption[]) ?? []);
      setTrailers((trailersRes.data as TrailerOption[]) ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load maintenance data.");
      setRows([]);
      setVehicles([]);
      setTrailers([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openAdd() {
    setEditing(null);
    setError(null);
    setForm({
      asset_type: "vehicle",
      vehicle_id: "",
      trailer_id: "",
      work_type: "service",
      work_date: todayISODate(),
      po_number: "",
      supplier_name: "",
      notes: "",
      estimate_amount: "",
      payment_due: "",
      status: "raised",
    });
    setOpen(true);
  }

  function openEdit(row: MaintenanceRow) {
    setEditing(row);
    setError(null);
    setForm({
      asset_type: row.asset_type,
      vehicle_id: row.vehicle_id ?? "",
      trailer_id: row.trailer_id ?? "",
      work_type: row.work_type,
      work_date: row.work_date ?? todayISODate(),
      po_number: row.po_number ?? "",
      supplier_name: row.supplier_name ?? "",
      notes: row.notes ?? "",
      estimate_amount: row.estimate_amount != null ? String(row.estimate_amount) : "",
      payment_due: row.payment_due ?? "",
      status: row.status,
    });
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
  }

  async function generatePoNumber() {
    setGenerating(true);
    setError(null);

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      if (!authData?.user) throw new Error("Auth session missing. Please log in again.");

      if (form.asset_type === "vehicle" && !form.vehicle_id) throw new Error("Please select a vehicle.");
      if (form.asset_type === "trailer" && !form.trailer_id) throw new Error("Please select a trailer.");
      if (!form.work_date) throw new Error("Work date is required.");

      const payload = {
        p_asset_type: form.asset_type,
        p_vehicle_id: form.asset_type === "vehicle" ? form.vehicle_id : null,
        p_trailer_id: form.asset_type === "trailer" ? form.trailer_id : null,
        p_work_date: form.work_date,
      };

      const { data, error } = await supabase.rpc("generate_po_number", payload);
      if (error) throw error;

      // rpc returns text
      const po = (data as string) ?? "";
      if (!po) throw new Error("Failed to generate PO number.");

      setForm((p) => ({ ...p, po_number: po }));
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate PO number.");
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = authData?.user;
      if (!user) throw new Error("Auth session missing. Please log in again.");

      if (!form.work_date) throw new Error("Work date is required.");
      if (!form.work_type) throw new Error("Work type is required.");

      if (form.asset_type === "vehicle") {
        if (!form.vehicle_id) throw new Error("Vehicle is required.");
      } else {
        if (!form.trailer_id) throw new Error("Trailer is required.");
      }

      const supplier_name = cleanTextOptional(form.supplier_name);
      const notes = cleanTextOptional(form.notes);
      const estimate_amount = cleanNumberOptional(form.estimate_amount);
      const payment_due = form.payment_due?.trim() ? form.payment_due.trim() : null;

      // On add: require PO number
      if (!editing && !form.po_number.trim()) {
        throw new Error("Please generate a PO number first.");
      }

      const payloadBase: any = {
        asset_type: form.asset_type,
        vehicle_id: form.asset_type === "vehicle" ? form.vehicle_id : null,
        trailer_id: form.asset_type === "trailer" ? form.trailer_id : null,
        work_type: form.work_type,
        work_date: form.work_date,
        supplier_name,
        notes,
        estimate_amount,
        payment_due,
        status: form.status,
      };

      if (!editing) {
        const insertPayload = {
          ...payloadBase,
          owner_id: user.id,
          po_number: form.po_number.trim(),
        };

        const { error: insErr } = await supabase.from("maintenance_orders").insert(insertPayload);
        if (insErr) throw insErr;
      } else {
        // keep po_number immutable in edit (you can change if you want, but usually better not)
        const { error: updErr } = await supabase.from("maintenance_orders").update(payloadBase).eq("id", editing.id);
        if (updErr) throw updErr;
      }

      closeModal();
      await load();
    } catch (e: any) {
      console.error(e);
      const msg = e?.message ?? "Failed to save maintenance record.";
      if (typeof msg === "string" && msg.includes("row-level security")) {
        setError("RLS blocked this action. Check maintenance_orders policies and that inserts include owner_id.");
      } else if (typeof msg === "string" && msg.toLowerCase().includes("duplicate")) {
        setError("That PO number already exists. Please generate a new one.");
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: MaintenanceRow) {
    const ok = confirm(`Delete PO "${row.po_number}"? This cannot be undone.`);
    if (!ok) return;

    setError(null);
    const { error } = await supabase.from("maintenance_orders").delete().eq("id", row.id);
    if (error) {
      setError(error.message);
      return;
    }
    await load();
  }

  function assetLabel(r: MaintenanceRow) {
    if (r.asset_type === "vehicle") {
      const v = vehicles.find((x) => x.id === r.vehicle_id);
      if (!v) return "Vehicle";
      const make = (v.make ?? "").trim();
      const model = (v.model ?? "").trim();
      const reg = (v.registration ?? "").trim().toUpperCase();
      const mm = [make, model].filter(Boolean).join(" ");
      return mm ? `${reg} • ${mm}` : reg;
    }
    const t = trailers.find((x) => x.id === r.trailer_id);
    if (!t) return "Trailer";
    const reg = (t.identifier ?? "").trim().toUpperCase();
    const tp = (t.type ?? "").trim();
    return tp ? `${reg} • ${tp}` : reg;
  }

  function formatDate(d: string | null | undefined) {
    if (!d) return "-";
    const date = new Date(d);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    // note: for date-only strings, browser treats as UTC-ish; good enough for display.
  }

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", padding: "24px 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              display: "grid",
              placeItems: "center",
              color: "white",
            }}
          >
            <Wrench size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111827", margin: 0 }}>Maintenance</h1>
            <p style={{ fontSize: 14, color: "#6b7280", margin: "6px 0 0 0" }}>
              PMI + service POs, estimates, payment due dates
            </p>
          </div>
        </div>

        <button
          onClick={openAdd}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 18px",
            borderRadius: 12,
            border: "none",
            background: "#7c3aed",
            color: "white",
            cursor: "pointer",
            fontWeight: 900,
            fontSize: 14,
          }}
        >
          <Plus size={18} />
          Raise PO
        </button>
      </div>

      {/* Filters */}
      <div
        style={{
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 14,
          display: "grid",
          gridTemplateColumns: "1fr 170px 170px",
          gap: 65,
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <div style={{ position: "relative" }}>
          <Search size={18} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search PO, supplier, notes, status…"
            style={{
              width: "100%",
              padding: "12px 12px 12px 40px",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              fontSize: 14,
            }}
          />
        </div>

        <select
          value={assetFilter}
          onChange={(e) => setAssetFilter(e.target.value as any)}
          style={{
            width: "100%",
            padding: "12px 12px",
            borderRadius: 12,
            border: "1px solid #d1d5db",
            fontSize: 14,
            background: "white",
          }}
        >
          <option value="all">All assets</option>
          <option value="vehicle">Vehicles</option>
          <option value="trailer">Trailers</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          style={{
            width: "100%",
            padding: "12px 12px",
            borderRadius: 12,
            border: "1px solid #d1d5db",
            fontSize: 14,
            background: "white",
          }}
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
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
            alignItems: "flex-start",
          }}
        >
          <AlertCircle size={20} color="#dc2626" />
          <div style={{ color: "#991b1b" }}>{error}</div>
        </div>
      )}

      {/* Table */}
      {busy ? (
        <p>Loading…</p>
      ) : (
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                  {["PO", "Asset", "Work", "Work Date", "Status", "Estimate", "Pay Due", "Supplier", "Actions"].map((h) => (
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
                {filteredRows.map((r, idx) => {
                  const badge = badgeStyles(r.status);
                  return (
                    <tr key={r.id} style={{ borderBottom: idx < filteredRows.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                      <td style={{ padding: "14px 16px", fontWeight: 900, color: "#111827", whiteSpace: "nowrap" }}>
                        {r.po_number}
                      </td>
                      <td style={{ padding: "14px 16px", color: "#374151" }}>{assetLabel(r)}</td>
                      <td style={{ padding: "14px 16px", color: "#374151", textTransform: "uppercase", fontSize: 12, fontWeight: 800 }}>
                        {r.work_type}
                      </td>
                      <td style={{ padding: "14px 16px", color: "#374151", whiteSpace: "nowrap" }}>{formatDate(r.work_date)}</td>
                      <td style={{ padding: "14px 16px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "4px 10px",
                            borderRadius: 999,
                            background: badge.bg,
                            color: badge.text,
                            border: `1px solid ${badge.border}`,
                            fontSize: 12,
                            fontWeight: 900,
                            textTransform: "capitalize",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", color: "#111827", fontWeight: 800, whiteSpace: "nowrap" }}>
                        {formatGBP(r.estimate_amount)}
                      </td>
                      <td style={{ padding: "14px 16px", color: "#374151", whiteSpace: "nowrap" }}>
                        {r.payment_due ? formatDate(r.payment_due) : "-"}
                      </td>
                      <td style={{ padding: "14px 16px", color: "#374151" }}>{r.supplier_name ?? "-"}</td>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => openEdit(r)} style={actionBtn} type="button" title="Edit">
                            <Edit size={14} /> Edit
                          </button>
                          <button onClick={() => remove(r)} style={deleteBtn} type="button" title="Delete">
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ padding: 28, textAlign: "center", color: "#6b7280" }}>
                      No maintenance records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
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
              width: "min(720px, 96vw)",
              background: "white",
              borderRadius: 16,
              padding: 22,
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#111827" }}>{title}</h2>
                <p style={{ margin: "6px 0 0 0", fontSize: 14, color: "#6b7280" }}>
                  {editing ? "Update estimate / payment due / status" : "Select asset + work date, generate PO, then save"}
                </p>
              </div>
              <button
                onClick={closeModal}
                type="button"
                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, color: "#6b7280" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Asset type *">
                <select
                  value={form.asset_type}
                  onChange={(e) => {
                    const asset_type = e.target.value as AssetType;
                    setForm((p) => ({
                      ...p,
                      asset_type,
                      vehicle_id: asset_type === "vehicle" ? p.vehicle_id : "",
                      trailer_id: asset_type === "trailer" ? p.trailer_id : "",
                      po_number: editing ? p.po_number : "", // clear on new
                    }));
                  }}
                  style={styles.input}
                  disabled={!!editing} // keep fixed while editing (safer)
                >
                  <option value="vehicle">Vehicle</option>
                  <option value="trailer">Trailer</option>
                </select>
              </Field>

              {form.asset_type === "vehicle" ? (
                <Field label="Vehicle *">
                  <select
                    value={form.vehicle_id}
                    onChange={(e) => setForm((p) => ({ ...p, vehicle_id: e.target.value, po_number: editing ? p.po_number : "" }))}
                    style={styles.input}
                    disabled={!!editing}
                  >
                    <option value="">Select a vehicle…</option>
                    {vehicles.map((v) => {
                      const reg = (v.registration ?? "").toUpperCase();
                      const mm = [v.make ?? "", v.model ?? ""].map((x) => x.trim()).filter(Boolean).join(" ");
                      return (
                        <option key={v.id} value={v.id}>
                          {mm ? `${reg} — ${mm}` : reg}
                        </option>
                      );
                    })}
                  </select>
                </Field>
              ) : (
                <Field label="Trailer *">
                  <select
                    value={form.trailer_id}
                    onChange={(e) => setForm((p) => ({ ...p, trailer_id: e.target.value, po_number: editing ? p.po_number : "" }))}
                    style={styles.input}
                    disabled={!!editing}
                  >
                    <option value="">Select a trailer…</option>
                    {trailers.map((t) => {
                      const reg = (t.identifier ?? "").toUpperCase();
                      const extra = [t.type ?? "", t.make ?? ""].map((x) => x.trim()).filter(Boolean).join(" • ");
                      return (
                        <option key={t.id} value={t.id}>
                          {extra ? `${reg} — ${extra}` : reg}
                        </option>
                      );
                    })}
                  </select>
                </Field>
              )}

              <Field label="Work type *">
                <select value={form.work_type} onChange={(e) => setForm((p) => ({ ...p, work_type: e.target.value as WorkType }))} style={styles.input}>
                  {WORK_TYPES.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Work date *">
                <div style={{ position: "relative" }}>
                  <CalendarDays size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
                  <input
                    type="date"
                    value={form.work_date}
                    onChange={(e) => setForm((p) => ({ ...p, work_date: e.target.value, po_number: editing ? p.po_number : "" }))}
                    style={{ ...styles.input, paddingLeft: 36 }}
                    disabled={!!editing}
                  />
                </div>
              </Field>

              <Field label={editing ? "PO number (locked)" : "PO number *"}>
                <div style={{ display: "flex", gap: 10 }}>
                  <input
                    value={form.po_number}
                    onChange={(e) => setForm((p) => ({ ...p, po_number: e.target.value }))}
                    style={{ ...styles.input, flex: 1 }}
                    placeholder={editing ? "" : "Generate PO number"}
                    disabled={!!editing} // locked on edit
                    readOnly={!editing} // on add we allow only via generator; but still readable
                  />
                  {!editing && (
                    <button
                      type="button"
                      onClick={generatePoNumber}
                      disabled={generating}
                      style={{
                        ...styles.btn,
                        background: generating ? "#9ca3af" : "#111827",
                        color: "white",
                        border: "none",
                        whiteSpace: "nowrap",
                      }}
                      title="Generate PO number"
                    >
                      {generating ? "Generating…" : "Generate"}
                    </button>
                  )}
                </div>
                {!editing && (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
                    Tip: choose asset + date first, then generate.
                  </div>
                )}
              </Field>

              <Field label="Supplier (optional)">
                <input
                  value={form.supplier_name}
                  onChange={(e) => setForm((p) => ({ ...p, supplier_name: e.target.value }))}
                  style={styles.input}
                  placeholder="e.g. Main dealer / workshop"
                />
              </Field>

              <Field label="Status">
                <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as Status }))} style={styles.input}>
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Estimate amount (optional)">
                <div style={{ position: "relative" }}>
                  <PoundSterling size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
                  <input
                    type="number"
                    step="0.01"
                    value={form.estimate_amount}
                    onChange={(e) => setForm((p) => ({ ...p, estimate_amount: e.target.value }))}
                    style={{ ...styles.input, paddingLeft: 36 }}
                    placeholder="e.g. 1250.00"
                  />
                </div>
              </Field>

              <Field label="Payment due (optional)">
                <input
                  type="date"
                  value={form.payment_due}
                  onChange={(e) => setForm((p) => ({ ...p, payment_due: e.target.value }))}
                  style={styles.input}
                />
              </Field>

              <Field label="Notes (optional)">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  style={{ ...styles.input, minHeight: 90, resize: "vertical" }}
                  placeholder="Extra details, defects, instructions…"
                />
              </Field>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button
                onClick={closeModal}
                disabled={saving}
                style={{ ...styles.btn, background: "white", border: "1px solid #ddd", color: "#374151" }}
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                style={{
                  ...styles.btn,
                  background: saving ? "#9ca3af" : "#7c3aed",
                  color: "white",
                  border: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
                type="button"
              >
                {saving ? (
                  "Saving…"
                ) : (
                  <>
                    <CheckCircle size={16} />
                    {editing ? "Update" : "Create PO"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spinner animation */}
      <style>{`
        @keyframes spin { 0% { transform: rotate(0deg);} 100% { transform: rotate(360deg);} }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 13, fontWeight: 900, color: "#374151", marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const actionBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "white",
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 13,
  color: "#374151",
};

const deleteBtn: React.CSSProperties = {
  ...actionBtn,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#dc2626",
};

const styles: Record<string, React.CSSProperties> = {
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    outline: "none",
    fontSize: 14,
    boxSizing: "border-box",
    background: "white",
  },
  btn: {
    padding: "10px 14px",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 14,
  },
};
