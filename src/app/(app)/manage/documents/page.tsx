"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Upload,
  Download,
  Trash2,
  Search,
  AlertCircle,
  CheckCircle,
  FileText,
  Filter,
} from "lucide-react";

type EntityType =
  | "vehicle"
  | "trailer"
  | "driver"
  | "customer"
  | "maintenance"
  | "job"
  | "invoice"
  | "other";

type DocRow = {
  id: string;
  owner_id: string;
  bucket: string;
  path: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  entity_type: EntityType;
  entity_id: string | null;
  document_type: string;
  issue_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  created_at: string;
};

type PickerOption = {
  id: string; // uuid
  label: string; // friendly
  active?: boolean | null;
};

type FormState = {
  entity_type: EntityType;
  entity_id: string; // chosen UUID (or blank when other/general)
  document_type_mode: "preset" | "custom";
  document_type_preset: string;
  document_type_custom: string;

  issue_date: string;
  expiry_date: string;
  notes: string;
};

const BUCKET = "documents";

const DOC_TYPE_PRESETS = [
  "Insurance Certificate",
  "MOT Certificate",
  "Road Tax",
  "Service / PMI Record",
  "PO (Purchase Order)",
  "Invoice / Estimate",
  "Driver Licence",
  "CPC / Driver Qualification",
  "Insurance Policy Schedule",
  "Accident / Incident Report",
  "Other",
] as const;

function yyyyMm(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function bytesToHuman(n: number | null) {
  if (!n || n <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function safeFileName(name: string) {
  const base = name.split("/").pop()?.split("\\").pop() ?? name;
  return base.replace(/[^\w.\-()\s]/g, "_");
}

function formatDate(d: string | null | undefined) {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function daysUntil(dateStr: string | null) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diff = target.getTime() - today.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

export default function DocumentsPage() {
  const [rows, setRows] = useState<DocRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterEntity, setFilterEntity] = useState<EntityType | "all">("all");
  const [filterExpiring, setFilterExpiring] = useState<"all" | "soon" | "expired">("all");

  const [openUpload, setOpenUpload] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // entity picker options for current entity_type
  const [entityOptions, setEntityOptions] = useState<PickerOption[]>([]);
  const [entityLoading, setEntityLoading] = useState(false);

  const [form, setForm] = useState<FormState>({
    entity_type: "vehicle",
    entity_id: "",
    document_type_mode: "preset",
    document_type_preset: "Insurance Certificate",
    document_type_custom: "",

    issue_date: "",
    expiry_date: "",
    notes: "",
  });

  async function load() {
    setBusy(true);
    setError(null);

    const { data, error } = await supabase
      .from("documents")
      .select(
        "id, owner_id, bucket, path, filename, mime_type, size_bytes, entity_type, entity_id, document_type, issue_date, expiry_date, notes, created_at"
      )
      .order("created_at", { ascending: false });

    setBusy(false);

    if (error) {
      setError(error.message);
      setRows([]);
      return;
    }

    setRows((data as DocRow[]) ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  // Load entity dropdown options when modal opens or entity type changes
  useEffect(() => {
    if (!openUpload) return;

    const et = form.entity_type;

    // For now, only make dropdowns for the main “human” entities.
    // For maintenance/job/invoice you can still set entity type = other, or we can extend later.
    async function loadOptions() {
      setEntityLoading(true);
      setError(null);
      setEntityOptions([]);

      try {
        if (et === "vehicle") {
          const { data, error } = await supabase
            .from("vehicles")
            .select("id, registration, make, model, active")
            .order("registration", { ascending: true });
          if (error) throw error;

          const opts = (data ?? []).map((v: any) => ({
            id: v.id,
            label: `${(v.registration ?? "").toUpperCase()}${v.make || v.model ? ` — ${v.make ?? ""} ${v.model ?? ""}`.trim() : ""}`,
            active: v.active ?? null,
          }));
          setEntityOptions(opts);
          return;
        }

        if (et === "trailer") {
          const { data, error } = await supabase
            .from("trailers")
            .select("id, identifier, type, year")
            .order("identifier", { ascending: true });
          if (error) throw error;

          const opts = (data ?? []).map((t: any) => ({
            id: t.id,
            label: `${(t.identifier ?? "").toUpperCase()}${t.type ? ` — ${t.type}` : ""}${t.year ? ` (${t.year})` : ""}`,
          }));
          setEntityOptions(opts);
          return;
        }

        if (et === "driver") {
          const { data, error } = await supabase
            .from("drivers")
            .select("id, full_name, phone, email")
            .order("full_name", { ascending: true });
          if (error) throw error;

          const opts = (data ?? []).map((d: any) => ({
            id: d.id,
            label: `${d.full_name}${d.phone ? ` — ${d.phone}` : ""}`,
          }));
          setEntityOptions(opts);
          return;
        }

        if (et === "customer") {
          const { data, error } = await supabase
            .from("customers")
            .select("id, company_name, active")
            .order("company_name", { ascending: true });
          if (error) throw error;

          const opts = (data ?? []).map((c: any) => ({
            id: c.id,
            label: `${c.company_name}${c.active === false ? " (inactive)" : ""}`,
            active: c.active ?? null,
          }));
          setEntityOptions(opts);
          return;
        }

        // other / maintenance / job / invoice: no dropdown for now
        setEntityOptions([]);
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? "Failed to load entity list.");
      } finally {
        setEntityLoading(false);
      }
    }

    loadOptions();
    // reset entity_id whenever entity_type changes in modal
    setForm((p) => ({ ...p, entity_id: "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openUpload, form.entity_type]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();

    return rows.filter((r) => {
      if (filterEntity !== "all" && r.entity_type !== filterEntity) return false;

      const du = daysUntil(r.expiry_date);
      if (filterExpiring === "soon") {
        if (du == null || du < 0 || du > 30) return false;
      }
      if (filterExpiring === "expired") {
        if (du == null || du >= 0) return false;
      }

      if (!s) return true;

      const hay = [r.filename, r.document_type, r.entity_type, r.entity_id ?? "", r.notes ?? ""]
        .join(" ")
        .toLowerCase();

      return hay.includes(s);
    });
  }, [rows, search, filterEntity, filterExpiring]);

  const stats = useMemo(() => {
    const total = rows.length;
    const soon = rows.filter((r) => {
      const du = daysUntil(r.expiry_date);
      return du != null && du >= 0 && du <= 30;
    }).length;
    const expired = rows.filter((r) => {
      const du = daysUntil(r.expiry_date);
      return du != null && du < 0;
    }).length;
    return { total, soon, expired };
  }, [rows]);

  function openAdd() {
    setError(null);
    setSelectedFile(null);
    setForm({
      entity_type: "vehicle",
      entity_id: "",
      document_type_mode: "preset",
      document_type_preset: "Insurance Certificate",
      document_type_custom: "",
      issue_date: "",
      expiry_date: "",
      notes: "",
    });
    setOpenUpload(true);
  }

  function closeAdd() {
    setOpenUpload(false);
    setSelectedFile(null);
  }

  function getFinalDocType() {
    if (form.document_type_mode === "preset") {
      const preset = form.document_type_preset.trim();
      if (preset === "Other") {
        const custom = form.document_type_custom.trim();
        return custom;
      }
      return preset;
    }
    return form.document_type_custom.trim();
  }

  async function upload() {
    setSaving(true);
    setError(null);

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = authData?.user;
      if (!user) throw new Error("Auth session missing. Please log in again.");

      if (!selectedFile) throw new Error("Please choose a file to upload.");
      const filename = safeFileName(selectedFile.name);

      const entityType = form.entity_type;
      const entityIdRaw = form.entity_id.trim();

      // Require entity_id for the 4 dropdown-backed types (and for anything except "other")
      let entityId: string | null = null;
      if (entityType !== "other") {
        if (!entityIdRaw) throw new Error("Please select what this document relates to.");
        entityId = entityIdRaw;
      } else {
        entityId = entityIdRaw ? entityIdRaw : null;
      }

      const docType = getFinalDocType();
      if (!docType) throw new Error("Please select a document type or type one.");

      const folder = `owner/${user.id}/${entityType}/${entityId ?? "general"}/${yyyyMm()}`;
      const path = `${folder}/${filename}`;

      // 1) Upload to storage
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, selectedFile, {
        upsert: false,
        contentType: selectedFile.type || undefined,
      });
      if (upErr) throw upErr;

      // 2) Insert metadata row
      const payload = {
        owner_id: user.id,
        bucket: BUCKET,
        path,
        filename,
        mime_type: selectedFile.type || null,
        size_bytes: selectedFile.size ?? null,

        entity_type: entityType,
        entity_id: entityId,

        document_type: docType,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        notes: form.notes.trim() || null,
      };

      const { error: insErr } = await supabase.from("documents").insert(payload);
      if (insErr) throw insErr;

      closeAdd();
      await load();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Upload failed.");
    } finally {
      setSaving(false);
    }
  }

  async function downloadDoc(row: DocRow) {
    setError(null);
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(row.path, 60);
      if (error) throw error;
      const url = data?.signedUrl;
      if (!url) throw new Error("Could not generate download link.");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setError(e?.message ?? "Download failed.");
    }
  }

  async function removeDoc(row: DocRow) {
    const ok = confirm(`Delete "${row.filename}"? This will remove the file and record.`);
    if (!ok) return;

    setError(null);
    try {
      const { error: storErr } = await supabase.storage.from(BUCKET).remove([row.path]);
      if (storErr) throw storErr;

      const { error: dbErr } = await supabase.from("documents").delete().eq("id", row.id);
      if (dbErr) throw dbErr;

      await load();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Delete failed.");
    }
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "#111827" }}>Documents</h1>
          <p style={{ margin: "6px 0 0 0", color: "#6b7280", fontSize: 14 }}>
            Upload and track licences, insurance, MOT, PO docs and more (private storage).
          </p>
        </div>

        <button
          onClick={openAdd}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 18px",
            borderRadius: 10,
            border: "none",
            background: "#111827",
            color: "white",
            cursor: "pointer",
            fontWeight: 900,
            fontSize: 14,
          }}
        >
          <Upload size={18} />
          Upload document
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
        <StatCard label="Total" value={String(stats.total)} tone="neutral" />
        <StatCard label="Expiring in 30 days" value={String(stats.soon)} tone="warn" />
        <StatCard label="Expired" value={String(stats.expired)} tone="danger" />
      </div>

      {/* Filters */}
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 240 }}>
            <Search size={18} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search filename, type, notes, entity…"
              style={{
                width: "90%",
                padding: "12px 12px 12px 40px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                fontSize: 14,
              }}
            />
          </div>

          <div style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
            <Filter size={18} style={{ color: "#6b7280" }} />
            <select
              value={filterEntity}
              onChange={(e) => setFilterEntity(e.target.value as any)}
              style={selectStyle}
            >
              <option value="all">All entities</option>
              <option value="vehicle">Vehicle</option>
              <option value="trailer">Trailer</option>
              <option value="driver">Driver</option>
              <option value="customer">Customer</option>
              <option value="maintenance">Maintenance</option>
              <option value="job">Job</option>
              <option value="invoice">Invoice</option>
              <option value="other">Other</option>
            </select>

            <select
              value={filterExpiring}
              onChange={(e) => setFilterExpiring(e.target.value as any)}
              style={selectStyle}
            >
              <option value="all">All expiry</option>
              <option value="soon">Expiring soon</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 14, padding: 14, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, display: "flex", gap: 10 }}>
          <AlertCircle size={20} color="#dc2626" />
          <div style={{ color: "#991b1b" }}>{error}</div>
        </div>
      )}

      {/* Table */}
      {busy ? (
        <p>Loading…</p>
      ) : (
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                  {["File", "Type", "Entity", "Issue", "Expiry", "Size", "Added", "Actions"].map((h) => (
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
                {filtered.map((r, idx) => {
                  const du = daysUntil(r.expiry_date);
                  const expiryPill = expiryBadge(du);

                  return (
                    <tr key={r.id} style={{ borderBottom: idx < filtered.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                      <td style={{ padding: "14px 16px", fontWeight: 800, color: "#111827" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 10, background: "#f3f4f6", display: "grid", placeItems: "center" }}>
                            <FileText size={16} />
                          </div>
                          <div style={{ minWidth: 220 }}>
                            <div style={{ fontWeight: 900 }}>{r.filename}</div>
                            <div style={{ fontSize: 12, color: "#6b7280" }}>{r.mime_type ?? "unknown"}</div>
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: "14px 16px", color: "#374151" }}>{r.document_type}</td>

                      <td style={{ padding: "14px 16px", color: "#374151", whiteSpace: "nowrap" }}>
                        <span style={{ fontWeight: 900, textTransform: "capitalize" }}>{r.entity_type}</span>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{r.entity_id ? `ID: ${r.entity_id.slice(0, 8)}` : "-"}</div>
                      </td>

                      <td style={{ padding: "14px 16px", color: "#374151", whiteSpace: "nowrap" }}>{formatDate(r.issue_date)}</td>

                      <td style={{ padding: "14px 16px", whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ color: "#374151" }}>{formatDate(r.expiry_date)}</span>
                          {expiryPill}
                        </div>
                      </td>

                      <td style={{ padding: "14px 16px", color: "#374151", whiteSpace: "nowrap" }}>{bytesToHuman(r.size_bytes)}</td>
                      <td style={{ padding: "14px 16px", color: "#374151", whiteSpace: "nowrap" }}>{formatDate(r.created_at)}</td>

                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button type="button" onClick={() => downloadDoc(r)} style={actionBtn}>
                            <Download size={14} /> Download
                          </button>
                          <button type="button" onClick={() => removeDoc(r)} style={deleteBtn}>
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: 28, textAlign: "center", color: "#6b7280" }}>
                      No documents found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload modal */}
      {openUpload && (
        <div
          onMouseDown={closeAdd}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "grid",
            placeItems: "center",
            padding: 20,
            zIndex: 50,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(720px, 96vw)",
              background: "white",
              borderRadius: 16,
              padding: 24,
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#111827" }}>Upload document</h2>
                <p style={{ margin: "6px 0 0 0", fontSize: 14, color: "#6b7280" }}>
                  Pick what the document relates to — no UUID copy/paste.
                </p>
              </div>

              <button
                onClick={closeAdd}
                type="button"
                style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, color: "#6b7280" }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <Field label="File *">
                <input
                  type="file"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                  style={inputStyle}
                />
                {selectedFile && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                    Selected: <strong>{selectedFile.name}</strong> ({bytesToHuman(selectedFile.size)})
                  </div>
                )}
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Entity type *">
                  <select
                    value={form.entity_type}
                    onChange={(e) => setForm((p) => ({ ...p, entity_type: e.target.value as EntityType }))}
                    style={inputStyle}
                  >
                    <option value="vehicle">Vehicle</option>
                    <option value="trailer">Trailer</option>
                    <option value="driver">Driver</option>
                    <option value="customer">Customer</option>
                    <option value="other">Other / General</option>
                  </select>
                </Field>

                <Field label={form.entity_type === "other" ? "Linked record (optional)" : "Select record *"}>
                  {form.entity_type === "other" ? (
                    <input
                      value={form.entity_id}
                      onChange={(e) => setForm((p) => ({ ...p, entity_id: e.target.value }))}
                      style={inputStyle}
                      placeholder="Optional: paste an ID or leave blank"
                    />
                  ) : (
                    <select
                      value={form.entity_id}
                      onChange={(e) => setForm((p) => ({ ...p, entity_id: e.target.value }))}
                      style={inputStyle}
                      disabled={entityLoading}
                    >
                      <option value="">{entityLoading ? "Loading…" : "Select…"}</option>
                      {entityOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {form.entity_type !== "other" && !entityLoading && entityOptions.length === 0 && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#b45309" }}>
                      No records found for this entity type yet.
                    </div>
                  )}
                </Field>
              </div>

              {/* Document type: presets + custom */}
              <Field label="Document type *">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <select
                    value={form.document_type_preset}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        document_type_mode: "preset",
                        document_type_preset: e.target.value,
                      }))
                    }
                    style={inputStyle}
                  >
                    {DOC_TYPE_PRESETS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>

                  <input
                    value={form.document_type_custom}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        document_type_mode: "custom",
                        document_type_custom: e.target.value,
                      }))
                    }
                    style={inputStyle}
                    placeholder="Or type a custom type…"
                  />
                </div>

                <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                  Tip: choose a preset, or type your own (typing overrides the preset).
                </div>
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Issue date (optional)">
                  <input
                    type="date"
                    value={form.issue_date}
                    onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>

                <Field label="Expiry date (optional)">
                  <input
                    type="date"
                    value={form.expiry_date}
                    onChange={(e) => setForm((p) => ({ ...p, expiry_date: e.target.value }))}
                    style={inputStyle}
                  />
                </Field>
              </div>

              <Field label="Notes (optional)">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  style={{ ...inputStyle, minHeight: 90 }}
                  placeholder="Policy number, renewal reminders, reference, etc."
                />
              </Field>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button
                onClick={closeAdd}
                disabled={saving}
                style={{ ...btnStyle, background: "white", border: "1px solid #ddd", color: "#374151" }}
                type="button"
              >
                Cancel
              </button>

              <button
                onClick={upload}
                disabled={saving}
                style={{ ...btnStyle, background: saving ? "#9ca3af" : "#111827", color: "white", border: "none" }}
                type="button"
              >
                {saving ? (
                  "Uploading..."
                ) : (
                  <>
                    <CheckCircle size={16} style={{ marginRight: 8 }} />
                    Upload
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: "neutral" | "warn" | "danger" }) {
  const map = {
    neutral: { bg: "#f9fafb", border: "#e5e7eb", text: "#111827" },
    warn: { bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
    danger: { bg: "#fef2f2", border: "#fecaca", text: "#991b1b" },
  }[tone];

  return (
    <div style={{ background: "white", border: `1px solid ${map.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 26, fontWeight: 900, color: "#111827" }}>{value}</span>
        <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, background: map.bg, color: map.text, fontWeight: 800 }}>
          {tone === "neutral" ? "All docs" : tone === "warn" ? "Due soon" : "Expired"}
        </span>
      </div>
    </div>
  );
}

function expiryBadge(days: number | null) {
  if (days == null) return null;
  if (days < 0) {
    return <Pill bg="#fef2f2" border="#fecaca" text="#991b1b">{`Expired ${Math.abs(days)}d`}</Pill>;
  }
  if (days <= 30) {
    return <Pill bg="#fffbeb" border="#fde68a" text="#92400e">{`${days}d`}</Pill>;
  }
  return <Pill bg="#ecfeff" border="#a5f3fc" text="#155e75">{`${days}d`}</Pill>;
}

function Pill({ bg, border, text, children }: { bg: string; border: string; text: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 900, background: bg, border: `1px solid ${border}`, color: text, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 14, fontWeight: 900, color: "#374151", marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: 14,
  boxSizing: "border-box",
  background: "white",
};

const selectStyle: React.CSSProperties = {
  padding: "12px 12px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "white",
  fontSize: 14,
};

const btnStyle: React.CSSProperties = {
  padding: "10px 16px",
  borderRadius: 10,
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 14,
  display: "inline-flex",
  alignItems: "center",
};

const actionBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "white",
  cursor: "pointer",
  fontWeight: 800,
  fontSize: 13,
  color: "#374151",
};

const deleteBtn: React.CSSProperties = {
  ...actionBtn,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#dc2626",
};
