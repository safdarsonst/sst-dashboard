"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Truck, Plus, Edit, Trash2, Search, AlertCircle, CheckCircle, Download } from "lucide-react";

type VehicleRow = {
  id: string;
  registration: string;
  make: string;
  model: string;
  created_at?: string | null;
};

type FormState = {
  registration: string;
  make: string;
  model: string;
};

function cleanReg(v: string) {
  // Uppercase, collapse spaces, trim
  return v.replace(/\s+/g, " ").trim().toUpperCase();
}

export default function VehiclesPage() {
  const [rows, setRows] = useState<VehicleRow[]>([]);
  const [filteredRows, setFilteredRows] = useState<VehicleRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VehicleRow | null>(null);

  const [form, setForm] = useState<FormState>({
    registration: "",
    make: "",
    model: "",
  });

  const title = useMemo(() => (editing ? "Edit Vehicle" : "Add New Vehicle"), [editing]);

  async function load() {
    setBusy(true);
    setError(null);

    const { data, error } = await supabase
      .from("vehicles")
      .select("id, registration, make, model, created_at")
      .order("registration", { ascending: true });

    setBusy(false);

    if (error) {
      setError(error.message);
      setRows([]);
      setFilteredRows([]);
      return;
    }

    const vehicles = (data as VehicleRow[]) ?? [];
    setRows(vehicles);
    setFilteredRows(vehicles);
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
      rows.filter(
        (v) =>
          v.registration.toLowerCase().includes(t) ||
          v.make.toLowerCase().includes(t) ||
          v.model.toLowerCase().includes(t)
      )
    );
  }, [searchTerm, rows]);

  function openAdd() {
    setEditing(null);
    setForm({ registration: "", make: "", model: "" });
    setError(null);
    setOpen(true);
  }

  function openEdit(row: VehicleRow) {
    setEditing(row);
    setForm({
      registration: row.registration ?? "",
      make: row.make ?? "",
      model: row.model ?? "",
    });
    setError(null);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
    setForm({ registration: "", make: "", model: "" });
  }

  async function save() {
    setSaving(true);
    setError(null);

    try {
      // RLS-safe: must be logged in
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = authData?.user;
      if (!user) throw new Error("Auth session missing. Please log in again.");

      const registration = cleanReg(form.registration);
      const make = form.make.trim();
      const model = form.model.trim();

      if (!registration) throw new Error("Registration is required.");
      if (!make) throw new Error("Make is required.");
      if (!model) throw new Error("Model is required.");

      const payloadBase = {
        registration,
        make,
        model,
      };

      if (!editing) {
        // include owner_id if your table has it
        const insertPayload: any = { ...payloadBase, owner_id: user.id };

        const { error: insErr } = await supabase.from("vehicles").insert(insertPayload);
        if (insErr) throw insErr;
      } else {
        const { error: updErr } = await supabase.from("vehicles").update(payloadBase).eq("id", editing.id);
        if (updErr) throw updErr;
      }

      closeModal();
      await load();
    } catch (e: any) {
      console.error(e);

      const msg = e?.message ?? "Failed to save vehicle.";

      if (typeof msg === "string" && msg.toLowerCase().includes("duplicate")) {
        setError("That registration already exists. Please use a unique registration.");
      } else if (typeof msg === "string" && msg.includes("row-level security")) {
        setError("RLS blocked this action. Check vehicles policies and owner_id handling.");
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: VehicleRow) {
    const ok = confirm(`Delete vehicle "${row.registration}"? This cannot be undone.`);
    if (!ok) return;

    setError(null);

    const { error } = await supabase.from("vehicles").delete().eq("id", row.id);
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
      {/* Header */}
      <div style={{ marginBottom: "32px" }}>
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center",
          marginBottom: "12px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
              }}
            >
              <Truck size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: "#111827", margin: 0 }}>Vehicles</h1>
              <p style={{ fontSize: 14, color: "#6b7280", margin: "4px 0 0 0" }}>
                Manage your vehicle fleet and registrations
              </p>
            </div>
          </div>

          <button
            onClick={openAdd}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 24px",
              borderRadius: 10,
              border: "none",
              background: "#10b981",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
              transition: "all 0.2s ease"
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <Plus size={18} />
            Add Vehicle
          </button>
        </div>

        {/* Stats Cards */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
          gap: "16px", 
          marginTop: "24px"
        }}>
          <div style={{ 
            background: "white", 
            padding: "20px", 
            borderRadius: "12px", 
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)"
          }}>
            <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "8px" }}>Total Vehicles</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{ fontSize: "28px", fontWeight: 700, color: "#111827" }}>{rows.length}</span>
              <span style={{ 
                fontSize: "12px", 
                background: "#d1fae5", 
                color: "#065f46",
                padding: "2px 8px",
                borderRadius: "12px",
                fontWeight: 500
              }}>
                All vehicles
              </span>
            </div>
          </div>
          
          <div style={{ 
            background: "white", 
            padding: "20px", 
            borderRadius: "12px", 
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)"
          }}>
            <div style={{ fontSize: "14px", color: "#6b7280", marginBottom: "8px" }}>Active</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
              <span style={{ fontSize: "28px", fontWeight: 700, color: "#10b981" }}>{rows.length}</span>
              <span style={{ 
                fontSize: "12px", 
                background: "#d1fae5", 
                color: "#065f46",
                padding: "2px 8px",
                borderRadius: "12px",
                fontWeight: 500
              }}>
                100%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: "24px",
        padding: "16px",
        background: "white",
        borderRadius: "12px",
        border: "1px solid #e5e7eb",
        boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)"
      }}>
        <div style={{ position: "relative", flex: 1 }}>
          <Search 
            size={20} 
            style={{ 
              position: "absolute", 
              left: "16px", 
              top: "50%", 
              transform: "translateY(-50%)", 
              color: "#9ca3af" 
            }} 
          />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search vehicles by registration, make, or model…"
            style={{
              width: "90%",
              padding: "14px 16px 14px 48px",
              borderRadius: "8px",
              border: "1px solid #d1d5db",
              fontSize: "14px",
              transition: "border 0.2s ease"
            }}
            onFocus={(e) => e.target.style.borderColor = "#10b981"}
            onBlur={(e) => e.target.style.borderColor = "#d1d5db"}
          />
        </div>
        
        <div style={{ display: "flex", gap: "12px", marginLeft: "16px" }}>
          <button style={{ 
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "12px 20px",
            borderRadius: "8px",
            border: "1px solid #d1d5db",
            background: "white",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 500,
            color: "#374151",
            transition: "all 0.2s ease"
          }}
          onMouseOver={(e) => e.currentTarget.style.background = "#f9fafb"}
          onMouseOut={(e) => e.currentTarget.style.background = "white"}
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ 
          marginBottom: "20px", 
          padding: "16px", 
          background: "#fef2f2", 
          border: "1px solid #fecaca", 
          borderRadius: "12px",
          display: "flex",
          alignItems: "flex-start",
          gap: "12px"
        }}>
          <AlertCircle size={20} color="#dc2626" />
          <div>
            <strong style={{ color: "#991b1b", display: "block", marginBottom: "4px" }}>Error</strong>
            <span style={{ color: "#991b1b", fontSize: "14px" }}>{error}</span>
          </div>
        </div>
      )}

      {/* Loading */}
      {busy && (
        <div style={{ 
          display: "flex", 
          justifyContent: "center", 
          alignItems: "center", 
          padding: "48px",
          background: "white",
          borderRadius: "12px",
          border: "1px solid #e5e7eb"
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ 
              width: "40px", 
              height: "40px", 
              border: "3px solid #e5e7eb",
              borderTopColor: "#10b981",
              borderRadius: "50%",
              margin: "0 auto 16px",
              animation: "spin 1s linear infinite"
            }}></div>
            <p style={{ color: "#6b7280", margin: 0 }}>Loading vehicles...</p>
          </div>
        </div>
      )}

      {/* Table */}
      {!busy && (
        <div style={{ 
          background: "white", 
          border: "1px solid #e5e7eb", 
          borderRadius: "12px", 
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)"
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ 
                  background: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
                  borderBottom: "2px solid #e5e7eb"
                }}>
                  {["Registration", "Make", "Model", "Added", "Actions"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "18px 16px",
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
                {filteredRows.map((r, idx) => (
                  <tr 
                    key={r.id} 
                    style={{ 
                      borderBottom: idx < filteredRows.length - 1 ? "1px solid #f3f4f6" : "none",
                      transition: "background 0.2s ease"
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = "#f9fafb"}
                    onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <td style={{ padding: "18px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div style={{ 
                          width: "40px", 
                          height: "40px", 
                          borderRadius: "10px",
                          background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "white",
                          fontWeight: 600,
                          fontSize: "14px"
                        }}>
                          {r.registration.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: "#111827", fontSize: "15px" }}>{r.registration}</div>
                          <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "2px" }}>Vehicle ID: {r.id.slice(0, 8)}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "18px 16px", fontWeight: 500, color: "#374151", fontSize: "14px" }}>
                      {r.make}
                    </td>
                    <td style={{ padding: "18px 16px", color: "#374151", fontSize: "14px" }}>
                      {r.model}
                    </td>
                    <td style={{ padding: "18px 16px" }}>
                      <div style={{ 
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "6px 12px",
                        background: "#f3f4f6",
                        color: "#374151",
                        borderRadius: "20px",
                        fontSize: "13px",
                        fontWeight: 500
                      }}>
                        {formatDate(r.created_at)}
                      </div>
                    </td>
                    <td style={{ padding: "18px 16px" }}>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          onClick={() => openEdit(r)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "8px 16px",
                            borderRadius: "8px",
                            border: "1px solid #d1d5db",
                            background: "white",
                            cursor: "pointer",
                            fontWeight: 500,
                            fontSize: "13px",
                            color: "#374151",
                            transition: "all 0.2s ease"
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = "#f3f4f6";
                            e.currentTarget.style.borderColor = "#9ca3af";
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = "white";
                            e.currentTarget.style.borderColor = "#d1d5db";
                          }}
                        >
                          <Edit size={14} />
                          Edit
                        </button>
                        <button
                          onClick={() => remove(r)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "8px 16px",
                            borderRadius: "8px",
                            border: "1px solid #fecaca",
                            background: "#fef2f2",
                            cursor: "pointer",
                            fontWeight: 500,
                            fontSize: "13px",
                            color: "#dc2626",
                            transition: "all 0.2s ease"
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = "#fee2e2";
                            e.currentTarget.style.borderColor = "#f87171";
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = "#fef2f2";
                            e.currentTarget.style.borderColor = "#fca5a5";
                          }}
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredRows.length === 0 && !busy && (
                  <tr>
                    <td colSpan={5} style={{ padding: "48px 16px", textAlign: "center" }}>
                      <div style={{ color: "#6b7280", textAlign: "center" }}>
                        <Truck size={48} style={{ opacity: 0.3, marginBottom: "16px" }} />
                        <h3 style={{ fontSize: "18px", fontWeight: 600, color: "#374151", margin: "0 0 8px 0" }}>
                          {searchTerm ? 'No matching vehicles found' : 'No vehicles yet'}
                        </h3>
                        <p style={{ margin: 0, fontSize: "14px", maxWidth: "400px" }}>
                          {searchTerm ? 'Try adjusting your search terms.' : 'Get started by adding your first vehicle.'}
                        </p>
                        {!searchTerm && (
                          <button
                            onClick={openAdd}
                            style={{
                              marginTop: "16px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "10px 20px",
                              borderRadius: "8px",
                              border: "none",
                              background: "#10b981",
                              color: "white",
                              cursor: "pointer",
                              fontWeight: 500,
                              fontSize: "14px",
                              transition: "all 0.2s ease"
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.transform = "translateY(-2px)";
                              e.currentTarget.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.transform = "translateY(0)";
                              e.currentTarget.style.boxShadow = "none";
                            }}
                          >
                            <Plus size={16} />
                            Add Your First Vehicle
                          </button>
                        )}
                      </div>
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
            padding: "20px",
            zIndex: 50,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 96vw)",
              background: "white",
              borderRadius: "16px",
              padding: "24px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center", 
              marginBottom: "20px",
              paddingBottom: "16px",
              borderBottom: "1px solid #e5e7eb"
            }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#111827" }}>{title}</h2>
                <p style={{ margin: "6px 0 0 0", fontSize: "14px", color: "#6b7280" }}>
                  {editing ? "Update vehicle details" : "Add a new vehicle"}
                </p>
              </div>
              <button
                onClick={closeModal}
                type="button"
                style={{ 
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "8px",
                  borderRadius: "8px",
                  fontSize: "18px",
                  color: "#6b7280",
                  transition: "all 0.2s ease"
                }}
                onMouseOver={(e) => e.currentTarget.style.background = "#f3f4f6"}
                onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gap: "16px" }}>
              <Field label="Registration *">
                <input
                  value={form.registration}
                  onChange={(e) => setForm((p) => ({ ...p, registration: e.target.value }))}
                  onBlur={() => setForm((p) => ({ ...p, registration: cleanReg(p.registration) }))}
                  style={styles.input}
                  placeholder="e.g. AB12 CDE"
                />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <Field label="Make *">
                  <input
                    value={form.make}
                    onChange={(e) => setForm((p) => ({ ...p, make: e.target.value }))}
                    style={styles.input}
                    placeholder="e.g. Volvo"
                  />
                </Field>
                <Field label="Model *">
                  <input
                    value={form.model}
                    onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
                    style={styles.input}
                    placeholder="e.g. FH"
                  />
                </Field>
              </div>
            </div>

            <div style={{ 
              display: "flex", 
              justifyContent: "flex-end", 
              gap: "12px", 
              marginTop: "24px",
              paddingTop: "20px",
              borderTop: "1px solid #e5e7eb"
            }}>
              <button 
                onClick={closeModal} 
                disabled={saving} 
                style={{ 
                  ...styles.btn, 
                  background: "white", 
                  border: "1px solid #d1d5db", 
                  color: "#374151" 
                }} 
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                style={{ 
                  ...styles.btn, 
                  background: saving ? "#9ca3af" : "#10b981", 
                  color: "white", 
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}
                type="button"
              >
                {saving ? (
                  <>
                    <div style={{
                      width: "16px",
                      height: "16px",
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "white",
                      borderRadius: "50%",
                      animation: "spin 1s linear infinite"
                    }}></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle size={16} />
                    {editing ? "Update Vehicle" : "Add Vehicle"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spinner Animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: "14px", fontWeight: 500, color: "#374151", marginBottom: "6px" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  input: {
    width: "100%",
    padding: "12px 16px",
    borderRadius: "8px",
    border: "1px solid #d1d5db",
    outline: "none",
    fontSize: "14px",
    boxSizing: "border-box",
    background: "white",
    transition: "border 0.2s ease"
  },
  btn: {
    padding: "12px 24px",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "14px",
    transition: "all 0.2s ease"
  },
};