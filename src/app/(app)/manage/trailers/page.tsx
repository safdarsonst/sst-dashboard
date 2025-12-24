"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Plus, Edit, Trash2, Search, AlertCircle, CheckCircle } from "lucide-react";

type TrailerRow = {
  id: string;
  identifier: string; // reg/identifier
  type: string;
  year: number | null;
  make: string | null;
  created_at?: string | null;
};

type FormState = {
  identifier: string;
  type: string;
  year: string; // keep as string for input
  make: string;
};

function cleanIdentifier(v: string) {
  return v.trim().toUpperCase();
}

function cleanTextOptional(v: string) {
  const s = v.trim();
  return s.length ? s : null;
}

function cleanYearOptional(v: string) {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
}

export default function TrailersPage() {
  const [rows, setRows] = useState<TrailerRow[]>([]);
  const [filteredRows, setFilteredRows] = useState<TrailerRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrailerRow | null>(null);

  const [form, setForm] = useState<FormState>({
    identifier: "",
    type: "curtainsider",
    year: "",
    make: "",
  });

  const title = useMemo(() => (editing ? "Edit Trailer" : "Add New Trailer"), [editing]);

  async function load() {
    setBusy(true);
    setError(null);

    const { data, error } = await supabase
      .from("trailers")
      .select("id, identifier, type, year, make, created_at")
      .order("identifier", { ascending: true });

    setBusy(false);

    if (error) {
      setError(error.message);
      setRows([]);
      setFilteredRows([]);
      return;
    }

    const trailers = (data as TrailerRow[]) ?? [];
    setRows(trailers);
    setFilteredRows(trailers);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredRows(rows);
      return;
    }

    const t = searchTerm.toLowerCase();
    setFilteredRows(
      rows.filter((x) => {
        const id = x.identifier?.toLowerCase() ?? "";
        const tp = x.type?.toLowerCase() ?? "";
        const mk = x.make?.toLowerCase() ?? "";
        const yr = x.year != null ? String(x.year) : "";
        return id.includes(t) || tp.includes(t) || mk.includes(t) || yr.includes(t);
      })
    );
  }, [searchTerm, rows]);

  function openAdd() {
    setEditing(null);
    setForm({ identifier: "", type: "curtainsider", year: "", make: "" });
    setError(null);
    setOpen(true);
  }

  function openEdit(row: TrailerRow) {
    setEditing(row);
    setForm({
      identifier: row.identifier ?? "",
      type: row.type ?? "curtainsider",
      year: row.year != null ? String(row.year) : "",
      make: row.make ?? "",
    });
    setError(null);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
    setForm({ identifier: "", type: "curtainsider", year: "", make: "" });
  }

  async function save() {
    setSaving(true);
    setError(null);

    try {
      // Required for RLS owner-based insert
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = authData?.user;
      if (!user) throw new Error("Auth session missing. Please log in again.");

      const identifier = cleanIdentifier(form.identifier);
      const type = form.type.trim();
      const year = cleanYearOptional(form.year);
      const make = cleanTextOptional(form.make);

      if (!identifier) throw new Error("Trailer reg/identifier is required.");
      if (!type) throw new Error("Trailer type is required.");

      const payloadBase = { identifier, type, year, make };

      if (!editing) {
        const insertPayload: any = { ...payloadBase, owner_id: user.id };
        const { error: insErr } = await supabase.from("trailers").insert(insertPayload);
        if (insErr) throw insErr;
      } else {
        const { error: updErr } = await supabase.from("trailers").update(payloadBase).eq("id", editing.id);
        if (updErr) throw updErr;
      }

      closeModal();
      await load();
    } catch (e: any) {
      console.error(e);
      const msg = e?.message ?? "Failed to save trailer.";

      if (typeof msg === "string" && msg.toLowerCase().includes("duplicate")) {
        setError("That trailer reg/identifier already exists. Please use a unique one.");
      } else if (typeof msg === "string" && msg.includes("row-level security")) {
        setError("RLS blocked this action. Check trailers policies and that inserts include owner_id.");
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: TrailerRow) {
    const ok = confirm(`Delete trailer "${row.identifier}"? This cannot be undone.`);
    if (!ok) return;

    setError(null);
    const { error } = await supabase.from("trailers").delete().eq("id", row.id);
    if (error) setError(error.message);
    else await load();
  }

  function formatDate(dateString: string | null | undefined) {
    if (!dateString) return "-";
    const d = new Date(dateString);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111827", margin: 0 }}>Trailers</h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "6px 0 0 0" }}>
            Reg/identifier + type required; year/make optional
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
            background: "#7c3aed",
            color: "white",
            cursor: "pointer",
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          <Plus size={18} />
          Add Trailer
        </button>
      </div>

      <div style={{ marginBottom: 14, background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
        <div style={{ position: "relative" }}>
          <Search size={18} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search reg, type, year, make…"
            style={{
              width: "90%",
              padding: "12px 12px 12px 40px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              fontSize: 14,
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
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                  {["Reg", "Type", "Year", "Make", "Added", "Actions"].map((h) => (
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
                {filteredRows.map((r, idx) => (
                  <tr key={r.id} style={{ borderBottom: idx < filteredRows.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                    <td style={{ padding: "14px 16px", fontWeight: 900, color: "#111827" }}>{r.identifier}</td>
                    <td style={{ padding: "14px 16px", color: "#374151" }}>{r.type}</td>
                    <td style={{ padding: "14px 16px", color: "#374151" }}>{r.year ?? "-"}</td>
                    <td style={{ padding: "14px 16px", color: "#374151" }}>{r.make ?? "-"}</td>
                    <td style={{ padding: "14px 16px", color: "#374151" }}>{formatDate(r.created_at)}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => openEdit(r)} style={actionBtn} type="button">
                          <Edit size={14} /> Edit
                        </button>
                        <button onClick={() => remove(r)} style={deleteBtn} type="button">
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 28, textAlign: "center", color: "#6b7280" }}>
                      No trailers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
            zIndex: 50,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(560px, 96vw)",
              background: "white",
              borderRadius: 16,
              padding: 24,
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#111827" }}>{title}</h2>
                <p style={{ margin: "6px 0 0 0", fontSize: 14, color: "#6b7280" }}>
                  {editing ? "Update trailer details" : "Add a new trailer"}
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

            <div style={{ display: "grid", gap: 12 }}>
              <Field label="Trailer Reg / Identifier *">
                <input
                    value={form.identifier}
                    onChange={(e) =>
                        setForm((p) => ({
                            ...p,
                            identifier: e.target.value.toUpperCase(), // 🔥 uppercase as user types
                         }))
                        }
                        onBlur={() =>
                            setForm((p) => ({
                                ...p,
                                identifier: cleanIdentifier(p.identifier), // 🔥 final clean
                            }))
                        }
                        style={styles.input}
                         placeholder="e.g. SST-1"
                    />

              </Field>

              <Field label="Type *">
                <select
                  value={form.type}
                  onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
                  style={styles.input}
                >
                  <option value="curtainsider">Curtainsider</option>
                  <option value="box">Box</option>
                  <option value="flatbed">Flatbed</option>
                  <option value="skeletal">Skeletal</option>
                  <option value="other">Other</option>
                </select>
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Year (optional)">
                  <input
                    type="number"
                    value={form.year}
                    onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))}
                    style={styles.input}
                    placeholder="e.g. 2019"
                  />
                </Field>

                <Field label="Make (optional)">
                  <input
                    value={form.make}
                    onChange={(e) => setForm((p) => ({ ...p, make: e.target.value }))}
                    style={styles.input}
                    placeholder="e.g. Schmitz"
                  />
                </Field>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button onClick={closeModal} disabled={saving} style={{ ...styles.btn, background: "white", border: "1px solid #ddd" }} type="button">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                style={{ ...styles.btn, background: saving ? "#9ca3af" : "#7c3aed", color: "white", border: "none" }}
                type="button"
              >
                {saving ? (
                  "Saving..."
                ) : (
                  <>
                    <CheckCircle size={16} style={{ marginRight: 8 }} />
                    {editing ? "Update Trailer" : "Add Trailer"}
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

const styles: Record<string, React.CSSProperties> = {
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #d1d5db",
    outline: "none",
    fontSize: 14,
    boxSizing: "border-box",
    background: "white",
  },
  btn: {
    padding: "10px 16px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 14,
    display: "inline-flex",
    alignItems: "center",
  },
};
