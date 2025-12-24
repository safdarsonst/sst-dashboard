"use client";

import { useEffect, useMemo, useState } from "react";
// ✅ only change: use your browser client helper instead of the old supabaseClient singleton
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  Users,
  UserPlus,
  Edit,
  Trash2,
  Phone,
  Mail,
  Search,
  Filter,
  Download,
  CheckCircle,
  AlertCircle,
  PoundSterling,
} from "lucide-react";

type PayType = "hourly" | "shift";

type DriverRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  pay_type: PayType;
  pay_rate: number; // numeric
  created_at?: string | null;
};

type FormState = {
  full_name: string;
  phone: string;
  email: string;
  pay_type: PayType;
  pay_rate: string; // keep as string so decimals are not lost while typing
};

function cleanPhone(v: string) {
  return v.trim();
}
function cleanEmail(v: string) {
  const s = v.trim();
  return s.length ? s : "";
}
function parseMoney(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function formatPay(pay_type: PayType, pay_rate: number) {
  const money = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pay_rate ?? 0);

  return pay_type === "hourly" ? `${money}/hr` : `${money}/shift`;
}

export default function DriversPage() {
  // ✅ only change: create the browser client instance
  const supabase = supabaseBrowser();

  const [rows, setRows] = useState<DriverRow[]>([]);
  const [filteredRows, setFilteredRows] = useState<DriverRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // modal state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DriverRow | null>(null);

  // form
  const [form, setForm] = useState<FormState>({
    full_name: "",
    phone: "",
    email: "",
    pay_type: "shift",
    pay_rate: "0.00",
  });

  const title = useMemo(() => (editing ? "Edit Driver" : "Add New Driver"), [editing]);

  async function load() {
    setBusy(true);
    setError(null);

    const { data, error } = await supabase
      .from("drivers")
      .select("id, full_name, phone, email, pay_type, pay_rate, created_at")
      .order("full_name", { ascending: true });

    setBusy(false);

    if (error) {
      setError(error.message);
      setRows([]);
      setFilteredRows([]);
      return;
    }

    const drivers = (data as DriverRow[]) ?? [];
    setRows(drivers);
    setFilteredRows(drivers);
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredRows(rows);
      return;
    }
    const term = searchTerm.toLowerCase();

    const filtered = rows.filter((driver) => {
      const payStr = formatPay(driver.pay_type, driver.pay_rate).toLowerCase();
      return (
        driver.full_name.toLowerCase().includes(term) ||
        driver.phone?.toLowerCase().includes(term) ||
        driver.email?.toLowerCase().includes(term) ||
        payStr.includes(term)
      );
    });

    setFilteredRows(filtered);
  }, [searchTerm, rows]);

  function openAdd() {
    setEditing(null);
    setForm({ full_name: "", phone: "", email: "", pay_type: "shift", pay_rate: "0.00" });
    setError(null);
    setOpen(true);
  }

  function openEdit(row: DriverRow) {
    setEditing(row);
    setForm({
      full_name: row.full_name ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      pay_type: row.pay_type ?? "shift",
      pay_rate: (row.pay_rate ?? 0).toFixed(2),
    });
    setError(null);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
    setForm({ full_name: "", phone: "", email: "", pay_type: "shift", pay_rate: "0.00" });
  }

  async function save() {
    setSaving(true);
    setError(null);

    try {
      const fullName = form.full_name.trim();
      if (!fullName) throw new Error("Driver name is required.");

      const rateNum = parseMoney(form.pay_rate);
      if (!Number.isFinite(rateNum) || rateNum < 0) throw new Error("Pay rate must be a valid number (>= 0).");

      // signed-in user required for RLS
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = authData?.user;
      if (!user) throw new Error("Auth session missing. Please log in again.");

      const payloadBase = {
        full_name: fullName,
        phone: cleanPhone(form.phone) || null,
        email: cleanEmail(form.email) || null,
        pay_type: form.pay_type,
        pay_rate: rateNum, // numeric
      };

      if (!editing) {
        // If your RLS uses owner_id, include it. If you don't have owner_id column, remove owner_id here.
        const insertPayload: any = { ...payloadBase, owner_id: user.id };

        const { error: insErr } = await supabase.from("drivers").insert(insertPayload);
        if (insErr) throw insErr;
      } else {
        const { error: updErr } = await supabase.from("drivers").update(payloadBase).eq("id", editing.id);
        if (updErr) throw updErr;
      }

      closeModal();
      await load();
    } catch (e: any) {
      console.error(e);
      if (typeof e?.message === "string" && e.message.includes("row-level security")) {
        setError("RLS blocked this action. Check your drivers policies and owner_id handling.");
      } else {
        setError(e?.message ?? "Failed to save driver.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: DriverRow) {
    const ok = confirm(`Are you sure you want to delete driver "${row.full_name}"? This action cannot be undone.`);
    if (!ok) return;

    setError(null);

    const { error } = await supabase.from("drivers").delete().eq("id", row.id);
    if (error) setError(error.message);
    else await load();
  }

  function formatDate(dateString: string | null | undefined) {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
              }}
            >
              <Users size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 800, color: "#111827", margin: 0 }}>Drivers</h1>
              <p style={{ fontSize: 14, color: "#6b7280", margin: "4px 0 0 0" }}>
                Manage driver details + pay rates
              </p>
            </div>
          </div>

          <button
            onClick={openAdd}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 24px",
              borderRadius: 10,
              border: "none",
              background: "#3b82f6",
              color: "white",
              cursor: "pointer",
              fontWeight: 600,
              fontSize: 14,
              boxShadow: "0 4px 6px -1px rgba(59, 130, 246, 0.3)",
            }}
          >
            <UserPlus size={18} />
            Add Driver
          </button>
        </div>
      </div>

      {/* Search */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
          padding: 16,
          background: "white",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={20} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, phone, email, pay…"
              style={{
                width: "90%",
                padding: "12px 12px 12px 40px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
              }}
            />
          </div>

          <button
            type="button"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "12px 16px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "white",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 500,
              color: "#374151",
            }}
          >
            <Filter size={16} />
            Filter
          </button>
        </div>

        <button
          type="button"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "white",
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500,
            color: "#374151",
            marginLeft: 12,
          }}
        >
          <Download size={16} />
          Export
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            marginBottom: 16,
            padding: 16,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 12,
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
          }}
        >
          <AlertCircle size={20} color="#dc2626" />
          <div>
            <strong style={{ color: "#991b1b", display: "block", marginBottom: 4 }}>Error</strong>
            <span style={{ color: "#991b1b", fontSize: 14 }}>{error}</span>
          </div>
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
                  {["Driver", "Contact", "Pay", "Added", "Actions"].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "14px 16px",
                        textAlign: "left",
                        fontSize: 12,
                        fontWeight: 700,
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
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: 700, color: "#111827" }}>{r.full_name}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>ID: {r.id.slice(0, 8)}</div>
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "grid", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Phone size={14} style={{ color: r.phone ? "#6b7280" : "#d1d5db" }} />
                          <span style={{ color: r.phone ? "#374151" : "#9ca3af", fontSize: 14 }}>{r.phone ?? "No phone"}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Mail size={14} style={{ color: r.email ? "#6b7280" : "#d1d5db" }} />
                          <span style={{ color: r.email ? "#374151" : "#9ca3af", fontSize: 14 }}>{r.email ?? "No email"}</span>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <PoundSterling size={14} style={{ color: "#6b7280" }} />
                        <span style={{ fontWeight: 700, color: "#111827" }}>{formatPay(r.pay_type, r.pay_rate)}</span>
                      </div>
                    </td>

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
                    <td colSpan={5} style={{ padding: 32, textAlign: "center", color: "#6b7280" }}>
                      No drivers found.
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
            zIndex: 50,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 96vw)",
              background: "white",
              borderRadius: 16,
              padding: 24,
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#111827" }}>{title}</h2>
                <p style={{ margin: "6px 0 0 0", fontSize: 14, color: "#6b7280" }}>
                  {editing ? "Update driver details and pay settings" : "Add a new driver including pay type"}
                </p>
              </div>

              <button onClick={closeModal} type="button" style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 18, color: "#6b7280" }}>
                ✕
              </button>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <Field label="Full Name *">
                <input value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} style={styles.input} placeholder="e.g. John Smith" />
              </Field>

              <Field label="Phone (optional)">
                <input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} style={styles.input} placeholder="07..." />
              </Field>

              <Field label="Email (optional)">
                <input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} style={styles.input} placeholder="john@example.com" />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Pay Type *">
                  <select value={form.pay_type} onChange={(e) => setForm((p) => ({ ...p, pay_type: e.target.value as PayType }))} style={styles.input}>
                    <option value="hourly">Hourly</option>
                    <option value="shift">Per shift</option>
                  </select>
                </Field>

                <Field label={form.pay_type === "hourly" ? "Hourly Rate (£) *" : "Shift Rate (£) *"}>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={form.pay_rate}
                    onChange={(e) => setForm((p) => ({ ...p, pay_rate: e.target.value }))}
                    onBlur={() =>
                      setForm((p) => ({
                        ...p,
                        pay_rate: parseMoney(p.pay_rate).toFixed(2),
                      }))
                    }
                    style={styles.input}
                    placeholder="0.00"
                  />
                </Field>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button onClick={closeModal} disabled={saving} style={{ ...styles.btn, background: "white", border: "1px solid #ddd" }} type="button">
                Cancel
              </button>
              <button onClick={save} disabled={saving} style={{ ...styles.btn, background: saving ? "#9ca3af" : "#3b82f6", color: "white", border: "none" }} type="button">
                {saving ? (
                  "Saving..."
                ) : (
                  <>
                    <CheckCircle size={16} style={{ marginRight: 8 }} />
                    {editing ? "Update Driver" : "Add Driver"}
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
      <label style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#374151", marginBottom: 6 }}>{label}</label>
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
  fontWeight: 700,
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
    fontWeight: 800,
    fontSize: 14,
    display: "inline-flex",
    alignItems: "center",
  },
};
