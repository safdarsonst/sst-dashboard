"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import RouteModal, { RouteStopFinal } from "@/components/RouteModal";

type Option = { id: string; label: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  job?: any | null; // job row (from your view / list)
};

const invoiceTerms = [
  { label: "Same day", value: "same_day" },
  { label: "7 days", value: "7_days" },
  { label: "30 days", value: "30_days" },
  { label: "30 days + EOM", value: "30_days_eom" },
] as const;

const statuses = [
  { label: "Booked", value: "booked" },
  { label: "In progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
] as const;

export default function AddJobModal({ open, onClose, onSaved, job }: Props) {
  const isEdit = !!job?.id;

  // ✅ Use cookie-based Supabase client (works with middleware + custom domain)
  const supabase = supabaseBrowser();

  // Job fields
  const [jobRef, setJobRef] = useState("");
  const [jobDate, setJobDate] = useState(() => new Date().toISOString().slice(0, 10));
  // ✅ store as string so decimals are never lost by the browser
  const [amount, setAmount] = useState<string>("");

  const [terms, setTerms] = useState<(typeof invoiceTerms)[number]["value"]>("30_days");
  const [status, setStatus] = useState<(typeof statuses)[number]["value"]>("booked");

  // Dropdown data
  const [customers, setCustomers] = useState<Option[]>([]);
  const [drivers, setDrivers] = useState<Option[]>([]);
  const [vehicles, setVehicles] = useState<Option[]>([]);
  const [trailers, setTrailers] = useState<Option[]>([]);

  // Selected IDs
  const [customerId, setCustomerId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [trailerId, setTrailerId] = useState("");

  // UI state
  const [busy, setBusy] = useState(false);
  const [optionsBusy, setOptionsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debug
  const [userEmail, setUserEmail] = useState<string>("(checking...)");

  // Route state (OPTIONAL)
  const [routeOpen, setRouteOpen] = useState(false);
  const [routeStops, setRouteStops] = useState<RouteStopFinal[]>([]);
  const [routeMiles, setRouteMiles] = useState<number | null>(null);

  // 1) Auth debug
  useEffect(() => {
    if (!open) return;

    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        setUserEmail("(auth error)");
        return;
      }
      setUserEmail(data?.user?.email ?? "(not signed in - anon)");
    })();
  }, [open, supabase]);

  // 2) Load dropdown options whenever modal opens
  useEffect(() => {
    if (!open) return;

    async function loadOptions() {
      setOptionsBusy(true);
      setError(null);

      const [c, d, v, t] = await Promise.all([
        supabase.from("customers").select("id, company_name").order("company_name"),
        supabase.from("drivers").select("id, full_name").order("full_name"),
        supabase.from("vehicles").select("id, registration").order("registration"),
        supabase.from("trailers").select("id, identifier").order("identifier"),
      ]);

      const firstErr =
        c.error?.message || d.error?.message || v.error?.message || t.error?.message || null;

      if (firstErr) {
        setError(firstErr);
        setCustomers([]);
        setDrivers([]);
        setVehicles([]);
        setTrailers([]);
        setOptionsBusy(false);
        return;
      }

      setCustomers((c.data ?? []).map((x: any) => ({ id: x.id, label: x.company_name })));
      setDrivers((d.data ?? []).map((x: any) => ({ id: x.id, label: x.full_name })));
      setVehicles((v.data ?? []).map((x: any) => ({ id: x.id, label: x.registration })));
      setTrailers((t.data ?? []).map((x: any) => ({ id: x.id, label: x.identifier })));

      setOptionsBusy(false);
    }

    loadOptions().catch((e) => {
      setOptionsBusy(false);
      setError(e?.message ?? "Failed to load dropdown options");
    });
  }, [open, supabase]);

  // 3) Prefill fields when opening (Add vs Edit)
  useEffect(() => {
    if (!open) return;

    setError(null);

    if (isEdit) {
      // ✅ Prefill from job prop
      setJobRef(job?.job_reference ?? "");
      setJobDate((job?.job_date ?? new Date().toISOString().slice(0, 10)).slice(0, 10));
      setAmount(
        job?.agreed_amount == null
          ? ""
          : typeof job.agreed_amount === "number"
          ? job.agreed_amount.toFixed(2)
          : String(job.agreed_amount)
      );

      setTerms((job?.invoice_terms as any) ?? "30_days");
      setStatus((job?.status as any) ?? "booked");

      setCustomerId(job?.customer_id ?? "");
      setDriverId(job?.driver_id ?? "");
      setVehicleId(job?.vehicle_id ?? "");
      setTrailerId(job?.trailer_id ?? "");

      // If your view has a distance field, prefer that
      const miles =
        typeof job?.planned_distance_miles === "number"
          ? job.planned_distance_miles
          : typeof job?.total_distance_miles === "number"
          ? job.total_distance_miles
          : null;
      setRouteMiles(miles);

      // ✅ Load route stops for editing (optional)
      (async () => {
        const { data, error } = await supabase
          .from("job_stops")
          .select("stop_order, postcode, name, planned_time, lat, lng")
          .eq("job_id", job.id)
          .order("stop_order", { ascending: true });

        if (error) {
          // don't block editing if stops fail
          console.warn("Failed to load stops:", error.message);
          return;
        }

        const stops = (data ?? []).map((s: any) => ({
          stop_order: s.stop_order,
          postcode: s.postcode,
          name: s.name ?? null,
          planned_time: s.planned_time ?? null,
          lat: s.lat ?? null,
          lng: s.lng ?? null,
        })) as RouteStopFinal[];

        setRouteStops(stops);
      })();
    } else {
      // ✅ Reset for Add
      setJobRef("");
      setJobDate(new Date().toISOString().slice(0, 10));
      setAmount("");
      setTerms("30_days");
      setStatus("booked");

      setCustomerId("");
      setDriverId("");
      setVehicleId("");
      setTrailerId("");

      setRouteStops([]);
      setRouteMiles(null);
    }
  }, [open, isEdit, job?.id, supabase]);

  // Helper: parse amount safely (supports comma decimal too)
  function parseAmountToNumber(v: string): number {
    const n = Number(v.replace(",", "."));
    return n;
  }

  async function save() {
    setBusy(true);
    setError(null);

    try {
      // Must be signed in for Option A RLS policies
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;

      const user = authData?.user;
      if (!user) throw new Error("You must be signed in.");

      if (!jobRef.trim()) throw new Error("Job reference is required.");
      if (!customerId) throw new Error("Customer is required.");
      if (!jobDate) throw new Error("Job date is required.");

      if (!amount.trim()) throw new Error("Amount is required.");
      const amountNum = parseAmountToNumber(amount);
      if (Number.isNaN(amountNum)) throw new Error("Amount must be a valid number (e.g. 111.32).");

      // Route optional
      const plannedMiles = routeStops.length ? routeMiles : null;

      let jobId: string;

      if (!isEdit) {
        // INSERT
        const { data: inserted, error: jobErr } = await supabase
          .from("jobs")
          .insert({
            owner_id: user.id,
            job_reference: jobRef.trim().toUpperCase(),
            job_date: jobDate,
            customer_id: customerId,
            agreed_amount: amountNum,
            invoice_terms: terms,
            status,
            planned_distance_miles: plannedMiles,
          })
          .select("id"); // returns array

        if (jobErr) throw jobErr;
        jobId = inserted?.[0]?.id;
        if (!jobId) throw new Error("Job created but no id returned.");
      } else {
        // UPDATE
        if (!job?.id) throw new Error("Missing job.id for edit.");

        const { data: updated, error: jobErr } = await supabase
          .from("jobs")
          .update({
            // don't change owner_id here
            job_reference: jobRef.trim().toUpperCase(),
            job_date: jobDate,
            customer_id: customerId,
            agreed_amount: amountNum,
            invoice_terms: terms,
            status,
            planned_distance_miles: plannedMiles,
          })
          .eq("id", job.id)
          .select("id"); // returns array

        if (jobErr) throw jobErr;
        jobId = updated?.[0]?.id;
        if (!jobId) throw new Error("Job updated but no id returned.");
      }

      // Allocation upsert
      const { error: allocErr } = await supabase.from("job_allocations").upsert(
        {
          job_id: jobId,
          driver_id: driverId || null,
          vehicle_id: vehicleId || null,
          trailer_id: trailerId || null,
        },
        { onConflict: "job_id" }
      );
      if (allocErr) throw allocErr;

      // Stops: replace ONLY if route provided
      if (routeStops.length) {
        // delete existing stops on edit/add (safe)
        const { error: delErr } = await supabase.from("job_stops").delete().eq("job_id", jobId);
        if (delErr) throw delErr;

        const stopRows = routeStops.map((s) => ({
          job_id: jobId,
          stop_order: s.stop_order,
          postcode: s.postcode,
          name: s.name ?? null,
          planned_time: s.planned_time ?? null,
          lat: s.lat,
          lng: s.lng,
        }));

        const { error: stopsErr } = await supabase.from("job_stops").insert(stopRows);
        if (stopsErr) throw stopsErr;
      }

      onSaved();
      onClose();
    } catch (e: any) {
      console.error(e);

      if (typeof e?.message === "string" && e.message.includes("row-level security")) {
        setError("RLS blocked this action. Check your jobs/job_allocations/job_stops policies.");
      } else {
        setError(e?.message ?? "Failed to save job.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "grid",
          placeItems: "center",
          padding: 16,
          zIndex: 50,
        }}
        onMouseDown={onClose}
      >
        <div
          style={{
            width: "min(880px, 96%)",
            maxHeight: "90vh",
            background: "white",
            borderRadius: 16,
            padding: 24,
            overflowY: "auto",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>{isEdit ? "Edit Job" : "Create New Job"}</h2>
            <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 18 }}>
              ✕
            </button>
          </div>

          {/* DEBUG PANEL */}
          <div style={{ marginTop: 12, padding: 10, border: "1px solid #eee", borderRadius: 10, fontSize: 13 }}>
            <div><strong>Auth:</strong> {userEmail}</div>
            <div style={{ marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span><strong>Customers:</strong> {customers.length}</span>
              <span><strong>Drivers:</strong> {drivers.length}</span>
              <span><strong>Vehicles:</strong> {vehicles.length}</span>
              <span><strong>Trailers:</strong> {trailers.length}</span>
              <span><strong>Loading:</strong> {String(optionsBusy)}</span>
            </div>
          </div>

          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label>Job Reference *</label>
              <input
                value={jobRef}
                onChange={(e) => setJobRef(e.target.value.toUpperCase())}
                style={{ width: "95%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
              />
            </div>

            <div>
              <label>Job Date *</label>
              <input
                type="date"
                value={jobDate}
                onChange={(e) => setJobDate(e.target.value)}
                style={{ width: "95%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
              />
            </div>

            <div>
              <label>Customer *</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
              >
                <option value="">{optionsBusy ? "Loading customers…" : "Select a customer…"}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Amount (£) *</label>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 111.32"
                style={{ width: "95%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
              />
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                You can use decimals (e.g. 111.32).
              </div>
            </div>

            <div>
              <label>Invoice Terms</label>
              <select
                value={terms}
                onChange={(e) => setTerms(e.target.value as any)}
                style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
              >
                {invoiceTerms.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
              >
                {statuses.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ gridColumn: "1 / -1", padding: 12, background: "#f8fafc", borderRadius: 10 }}>
              <button
                type="button"
                onClick={() => setRouteOpen(true)}
                style={{
                  padding: "10px 14px",
                  background: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                Route & Stops (optional)
              </button>

              <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
                <div>Stops: <strong>{routeStops.length}</strong></div>
                <div>Miles: <strong>{routeMiles ?? "-"}</strong></div>

                {routeStops.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setRouteStops([]);
                      setRouteMiles(null);
                    }}
                    style={{
                      marginLeft: "auto",
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: "1px solid #ddd",
                      background: "white",
                      cursor: "pointer",
                    }}
                  >
                    Clear route
                  </button>
                )}
              </div>
            </div>

            <div>
              <label>Driver (optional)</label>
              <select
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
              >
                <option value="">Unassigned</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Vehicle (optional)</label>
              <select
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
              >
                <option value="">Unassigned</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Trailer (optional)</label>
              <select
                value={trailerId}
                onChange={(e) => setTrailerId(e.target.value)}
                style={{ width: "100%", padding: 10, border: "1px solid #ddd", borderRadius: 8 }}
              >
                <option value="">None</option>
                {trailers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div style={{ marginTop: 14, padding: 12, background: "#fee2e2", borderRadius: 10, border: "1px solid #ef4444" }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
            <button onClick={onClose} disabled={busy} style={{ padding: "10px 14px", borderRadius: 8 }}>
              Cancel
            </button>
            <button
              onClick={save}
              disabled={busy}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: busy ? "#9ca3af" : "#3b82f6",
                color: "white",
                border: "none",
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              {busy ? "Saving..." : isEdit ? "Save Changes" : "Create Job"}
            </button>
          </div>
        </div>
      </div>

      <RouteModal
        open={routeOpen}
        onClose={() => setRouteOpen(false)}
        initialStops={routeStops}
        onConfirm={({ stops, totalMiles }) => {
          setRouteStops(stops);
          setRouteMiles(totalMiles);
        }}
      />
    </>
  );
}
