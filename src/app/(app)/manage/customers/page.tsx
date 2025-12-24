"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Plus, Edit, Trash2, Search, AlertCircle, CheckCircle } from "lucide-react";

type CustomerRow = {
  id: string;
  company_name: string;
  billing_address: string | null;
  email: string | null;
  phone: string | null;
  default_invoice_terms: string | null;
  payment_notes: string | null;
  active: boolean | null;
  created_at?: string | null;
};

type FormState = {
  company_name: string;
  billing_address: string;
  email: string;
  phone: string;
  default_invoice_terms: string;
  payment_notes: string;
  active: boolean;
};

const invoiceTerms = [
  { label: "Same day", value: "same_day" },
  { label: "7 days", value: "7_days" },
  { label: "30 days", value: "30_days" },
  { label: "30 days + EOM", value: "30_days_eom" },
] as const;

function cleanTextRequired(v: string) {
  return v.trim();
}
function cleanTextOptional(v: string) {
  const s = v.trim();
  return s.length ? s : null;
}
function cleanEmailOptional(v: string) {
  const s = v.trim();
  return s.length ? s : null;
}
function cleanPhoneOptional(v: string) {
  const s = v.trim();
  return s.length ? s : null;
}

export default function CustomersPage() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [filteredRows, setFilteredRows] = useState<CustomerRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);

  const [form, setForm] = useState<FormState>({
    company_name: "",
    billing_address: "",
    email: "",
    phone: "",
    default_invoice_terms: "30_days",
    payment_notes: "",
    active: true,
  });

  const title = useMemo(() => (editing ? "Edit Customer" : "Add New Customer"), [editing]);

  async function load() {
    setBusy(true);
    setError(null);

    const { data, error } = await supabase
      .from("customers")
      .select(
        "id, company_name, billing_address, email, phone, default_invoice_terms, payment_notes, active, created_at"
      )
      .order("active", { ascending: false })
      .order("company_name", { ascending: true });

    setBusy(false);

    if (error) {
      setError(error.message);
      setRows([]);
      setFilteredRows([]);
      return;
    }

    const customers = (data as CustomerRow[]) ?? [];
    setRows(customers);
    setFilteredRows(customers);
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
        const name = x.company_name?.toLowerCase() ?? "";
        const em = x.email?.toLowerCase() ?? "";
        const ph = x.phone?.toLowerCase() ?? "";
        return name.includes(t) || em.includes(t) || ph.includes(t);
      })
    );
  }, [searchTerm, rows]);

  function openAdd() {
    setEditing(null);
    setForm({
      company_name: "",
      billing_address: "",
      email: "",
      phone: "",
      default_invoice_terms: "30_days",
      payment_notes: "",
      active: true,
    });
    setError(null);
    setOpen(true);
  }

  function openEdit(row: CustomerRow) {
    setEditing(row);
    setForm({
      company_name: row.company_name ?? "",
      billing_address: row.billing_address ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      default_invoice_terms: (row.default_invoice_terms as any) ?? "30_days",
      payment_notes: row.payment_notes ?? "",
      active: row.active ?? true,
    });
    setError(null);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setEditing(null);
  }

  async function save() {
    setSaving(true);
    setError(null);

    try {
      // Ensure authed session for RLS
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      if (!authData?.user) throw new Error("Auth session missing. Please log in again.");

      const company_name = cleanTextRequired(form.company_name);
      if (!company_name) throw new Error("Company name is required.");

      const payload = {
        company_name,
        billing_address: cleanTextOptional(form.billing_address),
        email: cleanEmailOptional(form.email),
        phone: cleanPhoneOptional(form.phone),
        default_invoice_terms: cleanTextOptional(form.default_invoice_terms),
        payment_notes: cleanTextOptional(form.payment_notes),
        active: !!form.active,
      };

      if (!editing) {
        const { error: insErr } = await supabase.from("customers").insert(payload);
        if (insErr) throw insErr;
      } else {
        const { error: updErr } = await supabase.from("customers").update(payload).eq("id", editing.id);
        if (updErr) throw updErr;
      }

      closeModal();
      await load();
    } catch (e: any) {
      console.error(e);
      const msg = e?.message ?? "Failed to save customer.";

      if (typeof msg === "string" && msg.includes("row-level security")) {
        setError("RLS blocked this action. Check your customers policies (insert/update/delete).");
      } else if (typeof msg === "string" && msg.toLowerCase().includes("duplicate")) {
        setError("That customer already exists (duplicate). Please use a unique company name.");
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: CustomerRow) {
    const ok = confirm(`Delete customer "${row.company_name}"? This cannot be undone.`);
    if (!ok) return;

    setError(null);
    const { error } = await supabase.from("customers").delete().eq("id", row.id);
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
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111827", margin: 0 }}>Customers</h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "6px 0 0 0" }}>
            Manage customers, billing info and default invoice terms
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
            background: "#2563eb",
            color: "white",
            cursor: "pointer",
            fontWeight: 900,
            fontSize: 14,
          }}
          type="button"
        >
          <Plus size={18} />
          Add Customer
        </button>
      </div>

      <div style={{ marginBottom: 14, background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
        <div style={{ position: "relative" }}>
          <Search size={18} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search company name, email, phone…"
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
                  {["Company", "Contact", "Terms", "Active", "Added", "Actions"].map((h) => (
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
                    <td style={{ padding: "14px 16px" }}>
                      <div style={{ fontWeight: 900, color: "#111827" }}>{r.company_name}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                        {r.billing_address ? r.billing_address : <span style={{ fontStyle: "italic" }}>No billing address</span>}
                      </div>
                    </td>

                    <td style={{ padding: "14px 16px", color: "#374151" }}>
                      <div>{r.email ?? <span style={{ color: "#9ca3af", fontStyle: "italic" }}>No email</span>}</div>
                      <div style={{ marginTop: 6 }}>{r.phone ?? <span style={{ color: "#9ca3af", fontStyle: "italic" }}>No phone</span>}</div>
                    </td>

                    <td style={{ padding: "14px 16px", color: "#374151" }}>
                      {r.default_invoice_terms ? r.default_invoice_terms.replaceAll("_", " ") : "-"}
                    </td>

                    <td style={{ padding: "14px 16px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          padding: "4px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 900,
                          background: r.active ? "#d1fae5" : "#fee2e2",
                          color: r.active ? "#065f46" : "#991b1b",
                        }}
                      >
                        {r.active ? "Active" : "Inactive"}
                      </span>
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
                    <td colSpan={6} style={{ padding: 28, textAlign: "center", color: "#6b7280" }}>
                      No customers found.
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
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#111827" }}>{title}</h2>
                <p style={{ margin: "6px 0 0 0", fontSize: 14, color: "#6b7280" }}>
                  {editing ? "Update customer details" : "Add a new customer"}
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
              <Field label="Company Name *">
                <input
                  value={form.company_name}
                  onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))}
                  style={styles.input}
                  placeholder="e.g. Acme Logistics Ltd"
                />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Email (optional)">
                  <input
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    style={styles.input}
                    placeholder="accounts@acme.com"
                  />
                </Field>

                <Field label="Phone (optional)">
                  <input
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    style={styles.input}
                    placeholder="07..."
                  />
                </Field>
              </div>

              <Field label="Billing Address (optional)">
                <textarea
                  value={form.billing_address}
                  onChange={(e) => setForm((p) => ({ ...p, billing_address: e.target.value }))}
                  style={{ ...styles.input, minHeight: 90, resize: "vertical" }}
                  placeholder="Billing address..."
                />
              </Field>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Default Invoice Terms (optional)">
                  <select
                    value={form.default_invoice_terms}
                    onChange={(e) => setForm((p) => ({ ...p, default_invoice_terms: e.target.value }))}
                    style={styles.input}
                  >
                    {invoiceTerms.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Active">
                  <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
                    />
                    <span style={{ color: "#374151", fontWeight: 700 }}>{form.active ? "Active" : "Inactive"}</span>
                  </label>
                </Field>
              </div>

              <Field label="Payment Notes (optional)">
                <textarea
                  value={form.payment_notes}
                  onChange={(e) => setForm((p) => ({ ...p, payment_notes: e.target.value }))}
                  style={{ ...styles.input, minHeight: 90, resize: "vertical" }}
                  placeholder="e.g. BACS only, payment reference required..."
                />
              </Field>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              <button
                onClick={closeModal}
                disabled={saving}
                style={{ ...styles.btn, background: "white", border: "1px solid #ddd" }}
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                style={{ ...styles.btn, background: saving ? "#9ca3af" : "#2563eb", color: "white", border: "none" }}
                type="button"
              >
                {saving ? (
                  "Saving..."
                ) : (
                  <>
                    <CheckCircle size={16} style={{ marginRight: 8 }} />
                    {editing ? "Update Customer" : "Add Customer"}
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
