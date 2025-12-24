"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  AlertCircle,
  Calendar,
  ChevronRight,
  Loader2,
  MapPin,
  Navigation,
  Truck,
  X,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type JobOpenRow = {
  id: string;
  job_reference: string;
  job_date: string | null;
  status: string | null;

  invoice_terms: string | null;
  agreed_amount: number | null;

  customer_id: string | null;
  customer_name: string | null;

  driver_id: string | null;
  driver_name: string | null;

  vehicle_id: string | null;
  vehicle_reg: string | null;

  trailer_id: string | null;
  trailer_identifier: string | null;

  planned_distance_miles: number | null;
  total_distance_miles: number | null;
  rate_per_mile: number | null;

  collection_time: string | null;
  delivery_time: string | null;
  next_stop_time: string | null;
};

type JobStop = {
  id: string;
  job_id: string;
  stop_type?: string | null;
  name?: string | null;
  address?: string | null;
  postcode?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
  sequence?: number | null;
  planned_time?: string | null; // timestamptz-like field
};

type CompletedJobLite = {
  job_date: string | null;
  status: string | null;
};

function toISODate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function parseISODate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function formatUKDate(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function formatTime(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function safeText(...parts: Array<string | null | undefined>) {
  return parts.filter((p) => (p ?? "").trim().length > 0).join(", ");
}
function encodeQ(s: string) {
  return encodeURIComponent(s);
}

function OSMEmbed({ lat, lng }: { lat: number; lng: number }) {
  const delta = 0.02;
  const left = lng - delta;
  const right = lng + delta;
  const top = lat + delta;
  const bottom = lat - delta;

  const src =
    `https://www.openstreetmap.org/export/embed.html?bbox=` +
    `${left}%2C${bottom}%2C${right}%2C${top}` +
    `&layer=mapnik&marker=${lat}%2C${lng}`;

  return (
    <iframe
      title="map"
      src={src}
      style={{ width: "100%", height: 280, border: "1px solid #e5e7eb", borderRadius: 12 }}
      loading="lazy"
    />
  );
}

function isInProgressStatus(status: string | null | undefined) {
  const st = (status ?? "").toLowerCase();
  return (
    st.includes("progress") ||
    st.includes("in_progress") ||
    st === "in progress" ||
    st === "en route" ||
    st.includes("enroute")
  );
}

export default function OperationsDashboardPage() {
  // ✅ Create browser Supabase client (cookie-aware, works on custom domain)
  const supabase = supabaseBrowser();

  const pathname = usePathname();
  const isFinance = pathname === "/dashboard";
  const isOps = pathname === "/dashboard/operations";

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayISO = useMemo(() => toISODate(today), [today]);
  const next3ISO = useMemo(() => toISODate(addDays(today, 3)), [today]);

  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<JobOpenRow[]>([]);
  const [completedLite, setCompletedLite] = useState<CompletedJobLite[]>([]);

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<JobOpenRow | null>(null);
  const [stops, setStops] = useState<JobStop[]>([]);
  const [loadingStops, setLoadingStops] = useState(false);

  function closeModal() {
    setOpen(false);
    setActive(null);
    setStops([]);
  }

  async function load() {
    setBusy(true);
    setError(null);

    try {
      // ✅ Auth guard: if cookie/session missing, redirect to login
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      if (!authData?.user) {
        window.location.href = "/login";
        return;
      }

      // 1) Upcoming range: today -> next 3 days
      const { data: upcomingData, error: upcomingErr } = await supabase
        .from("v_jobs_open")
        .select(
          "id, job_reference, job_date, status, customer_name, driver_name, vehicle_reg, trailer_identifier, planned_distance_miles, total_distance_miles, collection_time, delivery_time, next_stop_time"
        )
        .gte("job_date", todayISO)
        .lte("job_date", next3ISO)
        .order("job_date", { ascending: true });

      if (upcomingErr) throw upcomingErr;

      // 2) In-progress: NO date filter (always show)
      const { data: inProgData, error: inProgErr } = await supabase
        .from("v_jobs_open")
        .select(
          "id, job_reference, job_date, status, customer_name, driver_name, vehicle_reg, trailer_identifier, planned_distance_miles, total_distance_miles, collection_time, delivery_time, next_stop_time"
        );

      if (inProgErr) throw inProgErr;

      const upcoming = (upcomingData as JobOpenRow[]) ?? [];
      const inProgAll = ((inProgData as JobOpenRow[]) ?? []).filter((r) =>
        isInProgressStatus(r.status)
      );

      // Merge + de-dupe by id (keeps in-progress even if outside date window)
      const map = new Map<string, JobOpenRow>();
      for (const r of [...inProgAll, ...upcoming]) map.set(r.id, r);
      const merged = Array.from(map.values());

      // Optional sort: in-progress first, then by job_date
      merged.sort((a, b) => {
        const ap = isInProgressStatus(a.status) ? 0 : 1;
        const bp = isInProgressStatus(b.status) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        const ad = a.job_date ?? "9999-12-31";
        const bd = b.job_date ?? "9999-12-31";
        return ad.localeCompare(bd);
      });

      setRows(merged);

      // Weekly bars source (completed jobs)
      const startWeek = startOfWeekMonday(addDays(today, -7 * 5));
      const startISO = toISODate(startWeek);
      const endISO = toISODate(addDays(today, 1));

      const { data: cj, error: cjErr } = await supabase
        .from("jobs")
        .select("job_date, status")
        .gte("job_date", startISO)
        .lte("job_date", endISO);

      if (cjErr) throw cjErr;
      setCompletedLite((cj as CompletedJobLite[]) ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load operations dashboard.");
      setRows([]);
      setCompletedLite([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const classified = useMemo(() => {
    const inProgress = rows.filter((r) => isInProgressStatus(r.status));

    const todayJobs = rows.filter(
      (r) => r.job_date === todayISO && !isInProgressStatus(r.status)
    );

    const upcoming = rows.filter((r) => {
      if (!r.job_date) return false;
      if (isInProgressStatus(r.status)) return false; // keep in-progress strictly in the in-progress column
      return r.job_date > todayISO && r.job_date <= next3ISO;
    });

    return { inProgress, todayJobs, upcoming };
  }, [rows, todayISO, next3ISO]);

  async function openJob(row: JobOpenRow) {
    setActive(row);
    setOpen(true);
    setStops([]);
    setLoadingStops(true);
    setError(null);

    try {
      const { data, error } = await supabase.from("job_stops").select("*").eq("job_id", row.id);
      if (error) throw error;

      const list = ((data as JobStop[]) ?? []).slice();
      list.sort((a, b) => {
        const aKey = a.planned_time ?? "";
        const bKey = b.planned_time ?? "";
        if (aKey && bKey) return aKey.localeCompare(bKey);
        if (aKey && !bKey) return -1;
        if (!aKey && bKey) return 1;
        return String(a.id).localeCompare(String(b.id));
      });

      setStops(list);
    } catch (e: any) {
      setStops([]);
      setError(e?.message ?? "Failed to load job details.");
    } finally {
      setLoadingStops(false);
    }
  }

  const stopInfo = useMemo(() => {
    if (!stops || stops.length === 0)
      return { pickup: null as JobStop | null, drop: null as JobStop | null };

    const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();

    const pickup =
      stops.find((s) => norm(s.stop_type).includes("collect") || norm(s.stop_type).includes("pick")) ??
      stops[0] ??
      null;

    const drop =
      [...stops]
        .reverse()
        .find((s) => norm(s.stop_type).includes("deliver") || norm(s.stop_type).includes("drop")) ??
      stops[stops.length - 1] ??
      null;

    return { pickup, drop };
  }, [stops]);

  const weeklyBars = useMemo(() => {
    const weeks: { key: string; label: string; count: number }[] = [];
    const now = new Date();
    const thisWeekStart = startOfWeekMonday(now);

    for (let i = 4; i >= 0; i--) {
      const ws = startOfWeekMonday(addDays(thisWeekStart, -7 * i));
      const we = addDays(ws, 6);

      const label = `${ws.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} – ${we.toLocaleDateString(
        "en-GB",
        { day: "2-digit", month: "short" }
      )}`;

      const count = (completedLite ?? []).filter((j) => {
        const st = (j.status ?? "").toLowerCase();
        if (!st.includes("comp")) return false;
        if (!j.job_date) return false;
        const d = parseISODate(j.job_date);
        d.setHours(0, 0, 0, 0);
        return d >= ws && d <= we;
      }).length;

      weeks.push({ key: toISODate(ws), label, count });
    }

    const max = Math.max(...weeks.map((w) => w.count), 1);
    return { weeks, max };
  }, [completedLite]);

  return (
    <div style={{ maxWidth: 1300, margin: "0 auto", padding: "24px 20px" }}>
      {/* Combined Header with Toggle Buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "start",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
              display: "grid",
              placeItems: "center",
              color: "white",
            }}
          >
            <Truck size={22} />
          </div>

          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "#111827" }}>
              Operations
            </h1>
            <p style={{ margin: "6px 0 0 0", color: "#6b7280" }}>
              Jobs in progress + upcoming jobs + weekly load volume
            </p>

            {/* Toggle buttons */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <Link href="/dashboard" style={{ textDecoration: "none" }}>
                <button
                  type="button"
                  style={{
                    ...btnTab,
                    background: isFinance ? "#111827" : "white",
                    color: isFinance ? "white" : "#111827",
                    borderColor: isFinance ? "#111827" : "#e5e7eb",
                  }}
                >
                  Finance dashboard
                </button>
              </Link>

              <Link href="/dashboard/operations" style={{ textDecoration: "none" }}>
                <button
                  type="button"
                  style={{
                    ...btnTab,
                    background: isOps ? "#111827" : "white",
                    color: isOps ? "white" : "#111827",
                    borderColor: isOps ? "#111827" : "#e5e7eb",
                  }}
                >
                  Operations dashboard
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* Refresh button */}
        <div
          style={{
            display: "flex",
            gap: 17,
            alignItems: "center",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          <button type="button" onClick={load} style={{ ...btn, fontWeight: 900, height: 44 }}>
            Refresh
          </button>
        </div>
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
          }}
        >
          <AlertCircle size={20} color="#dc2626" />
          <div style={{ color: "#991b1b" }}>{error}</div>
        </div>
      )}

      {busy ? (
        <div
          style={{
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 18,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Loader2 className="spin" size={18} /> Loading…
          <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <>
          {/* Sections */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(12, 1fr)",
              gap: 12,
              marginBottom: 14,
            }}
          >
            <Section
              title="In progress"
              subtitle=""
              icon={<Truck size={18} />}
              rows={classified.inProgress}
              onOpen={openJob}
              colSpan={4}
              emptyText="No in-progress loads."
            />

            <Section
              title="Today"
              subtitle=""
              icon={<Calendar size={18} />}
              rows={classified.todayJobs}
              onOpen={openJob}
              colSpan={4}
              emptyText="No loads scheduled for today."
            />

            <Section
              title="Upcoming"
              subtitle="Next 3 days"
              icon={<ChevronRight size={18} />}
              rows={classified.upcoming}
              onOpen={openJob}
              colSpan={4}
              emptyText="No upcoming loads in next 3 days."
            />
          </div>

          {/* Weekly chart */}
          <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <div style={{ fontWeight: 950, color: "#111827", display: "flex", alignItems: "center", gap: 10 }}>
                <BarChart3 size={18} />
                Loads completed per week (last 5 weeks)
              </div>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {weeklyBars.weeks.map((w) => {
                const pct = Math.round((w.count / weeklyBars.max) * 100);
                return (
                  <div
                    key={w.key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "170px 1fr 60px",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>{w.label}</div>
                    <div
                      style={{
                        height: 12,
                        background: "#f3f4f6",
                        borderRadius: 999,
                        overflow: "hidden",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ height: "100%", width: `${pct}%`, background: "#111827" }} />
                    </div>
                    <div style={{ textAlign: "right", fontWeight: 950, color: "#111827" }}>{w.count}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Modal */}
      {open && active && (
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
              width: "min(980px, 96vw)",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "white",
              borderRadius: 16,
              padding: 18,
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 950, color: "#111827" }}>
                  {active.job_reference} — {active.customer_name ?? "Customer"}
                </h2>
                <div style={{ marginTop: 6, color: "#6b7280", fontSize: 14 }}>
                  {formatUKDate(active.job_date)} • Status: <strong>{active.status ?? "-"}</strong>
                </div>
              </div>

              <button type="button" onClick={closeModal} style={{ ...btn, fontWeight: 900 }}>
                <X size={16} /> Close
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
              <div style={{ gridColumn: "span 6", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
                <div style={{ fontWeight: 950, color: "#111827", marginBottom: 10 }}>Assignment</div>
                <div style={{ display: "grid", gap: 8, color: "#374151" }}>
                  <div><strong>Driver:</strong> {active.driver_name ?? "-"}</div>
                  <div><strong>Vehicle:</strong> {active.vehicle_reg ?? "-"}</div>
                  <div><strong>Trailer:</strong> {active.trailer_identifier ?? "-"}</div>
                  <div><strong>Collection time:</strong> {active.collection_time ? `${formatUKDate(active.collection_time)} ${formatTime(active.collection_time)}` : "-"}</div>
                  <div><strong>Delivery time:</strong> {active.delivery_time ? `${formatUKDate(active.delivery_time)} ${formatTime(active.delivery_time)}` : "-"}</div>
                  <div><strong>Next stop:</strong> {active.next_stop_time ? `${formatUKDate(active.next_stop_time)} ${formatTime(active.next_stop_time)}` : "-"}</div>
                </div>
              </div>

              <div style={{ gridColumn: "span 6", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
                <div style={{ fontWeight: 950, color: "#111827", marginBottom: 10 }}>Route</div>
                <div style={{ display: "grid", gap: 8, color: "#374151" }}>
                  <div><strong>Planned miles:</strong> {Number(active.planned_distance_miles ?? 0).toFixed(0)}</div>
                  <div><strong>Total miles:</strong> {Number(active.total_distance_miles ?? 0).toFixed(0)}</div>
                </div>

                <div style={{ marginTop: 12, fontWeight: 950, color: "#111827", display: "flex", alignItems: "center", gap: 8 }}>
                  <MapPin size={16} /> Stops timeline
                </div>

                {loadingStops ? (
                  <div style={{ marginTop: 10, color: "#6b7280", display: "flex", gap: 8, alignItems: "center" }}>
                    <Loader2 className="spin" size={16} /> Loading stops…
                  </div>
                ) : stops.length === 0 ? (
                  <div style={{ marginTop: 10, color: "#6b7280" }}>
                    No stops found for this job (job_stops empty or not used yet).
                  </div>
                ) : (
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {/* Collection */}
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "#f9fafb" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 950, color: "#111827" }}>Collection</div>
                        <div style={{ color: "#6b7280", fontSize: 12 }}>
                          {stopInfo.pickup?.planned_time ? `${formatUKDate(stopInfo.pickup.planned_time)} ${formatTime(stopInfo.pickup.planned_time)}` : ""}
                        </div>
                      </div>
                      <div style={{ marginTop: 4, color: "#374151", fontSize: 13 }}>
                        {safeText(
                          stopInfo.pickup?.name ?? null,
                          stopInfo.pickup?.address ?? null,
                          stopInfo.pickup?.city ?? null,
                          stopInfo.pickup?.postcode ?? null
                        ) || <span style={{ color: "#6b7280" }}>No address fields on this stop row.</span>}
                      </div>
                    </div>

                    {/* All stops */}
                    {stops.map((s, idx) => {
                      const addr = safeText(s.name ?? null, s.address ?? null, s.city ?? null, s.postcode ?? null);
                      return (
                        <div key={s.id ?? idx} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ fontWeight: 900, color: "#111827" }}>
                              {(s.stop_type ?? "Stop").toString()}
                            </div>
                            <div style={{ color: "#6b7280", fontSize: 12 }}>
                              {s.planned_time ? `${formatUKDate(s.planned_time)} ${formatTime(s.planned_time)}` : ""}
                            </div>
                          </div>
                          <div style={{ marginTop: 4, color: "#374151", fontSize: 13 }}>
                            {addr || <span style={{ color: "#6b7280" }}>No address fields on this stop row.</span>}
                          </div>
                        </div>
                      );
                    })}

                    {/* Delivery */}
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "#f9fafb" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 950, color: "#111827" }}>Delivery</div>
                        <div style={{ color: "#6b7280", fontSize: 12 }}>
                          {stopInfo.drop?.planned_time ? `${formatUKDate(stopInfo.drop.planned_time)} ${formatTime(stopInfo.drop.planned_time)}` : ""}
                        </div>
                      </div>
                      <div style={{ marginTop: 4, color: "#374151", fontSize: 13 }}>
                        {safeText(
                          stopInfo.drop?.name ?? null,
                          stopInfo.drop?.address ?? null,
                          stopInfo.drop?.city ?? null,
                          stopInfo.drop?.postcode ?? null
                        ) || <span style={{ color: "#6b7280" }}>No address fields on this stop row.</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Map area */}
              <div style={{ gridColumn: "span 12", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14 }}>
                <div style={{ fontWeight: 950, color: "#111827", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  <Navigation size={16} />
                  Map view (optional)
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 12 }}>
                  <div style={{ gridColumn: "span 6" }}>
                    <div style={{ fontWeight: 900, color: "#111827", marginBottom: 8 }}>Collection</div>
                    {stopInfo.pickup?.lat != null && stopInfo.pickup?.lng != null ? (
                      <OSMEmbed lat={Number(stopInfo.pickup.lat)} lng={Number(stopInfo.pickup.lng)} />
                    ) : (
                      <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, color: "#6b7280" }}>
                        No lat/lng for collection stop.
                      </div>
                    )}
                  </div>

                  <div style={{ gridColumn: "span 6" }}>
                    <div style={{ fontWeight: 900, color: "#111827", marginBottom: 8 }}>Delivery</div>
                    {stopInfo.drop?.lat != null && stopInfo.drop?.lng != null ? (
                      <OSMEmbed lat={Number(stopInfo.drop.lat)} lng={Number(stopInfo.drop.lng)} />
                    ) : (
                      <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, color: "#6b7280" }}>
                        No lat/lng for delivery stop.
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {(() => {
                    const pAddr = stopInfo.pickup
                      ? safeText(stopInfo.pickup.name ?? null, stopInfo.pickup.address ?? null, stopInfo.pickup.postcode ?? null)
                      : "";
                    const dAddr = stopInfo.drop
                      ? safeText(stopInfo.drop.name ?? null, stopInfo.drop.address ?? null, stopInfo.drop.postcode ?? null)
                      : "";

                    const origin =
                      stopInfo.pickup?.lat != null && stopInfo.pickup?.lng != null
                        ? `${stopInfo.pickup.lat},${stopInfo.pickup.lng}`
                        : pAddr;

                    const dest =
                      stopInfo.drop?.lat != null && stopInfo.drop?.lng != null
                        ? `${stopInfo.drop.lat},${stopInfo.drop.lng}`
                        : dAddr;

                    if (!origin || !dest) return null;

                    const href = `https://www.google.com/maps/dir/?api=1&origin=${encodeQ(origin)}&destination=${encodeQ(dest)}`;

                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        style={{ ...btn, textDecoration: "none", fontWeight: 900 }}
                      >
                        <Navigation size={16} />
                        Open route in Google Maps
                      </a>
                    );
                  })()}
                </div>
              </div>
            </div>

            <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        </div>
      )}
    </div>
  );
}

/* Section component */
function Section({
  title,
  subtitle,
  icon,
  rows,
  onOpen,
  colSpan,
  emptyText,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  rows: JobOpenRow[];
  onOpen: (r: JobOpenRow) => void;
  colSpan: number;
  emptyText: string;
}) {
  return (
    <div style={{ gridColumn: `span ${colSpan}`, background: "white", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: 14, borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 950, color: "#111827", display: "flex", alignItems: "center", gap: 8 }}>
            {icon} {title}
          </div>
          <div style={{ marginTop: 4, color: "#6b7280", fontSize: 13 }}>{subtitle}</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>{rows.length}</div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: 14, color: "#6b7280" }}>{emptyText}</div>
      ) : (
        <div style={{ padding: 10, display: "grid", gap: 10 }}>
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onOpen(r)}
              style={{
                textAlign: "left",
                border: "1px solid #e5e7eb",
                background: "white",
                borderRadius: 12,
                padding: 12,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 950, color: "#111827" }}>{r.job_reference}</div>
                <span style={pill}>{r.status ?? "-"}</span>
              </div>

              <div style={{ marginTop: 6, color: "#374151", fontWeight: 800 }}>{r.customer_name ?? "-"}</div>
              <div style={{ marginTop: 4, color: "#6b7280", fontSize: 13 }}>
                Driver: {r.driver_name ?? "-"} • Vehicle: {r.vehicle_reg ?? "-"}
              </div>

              <div style={{ marginTop: 6, color: "#6b7280", fontSize: 12 }}>
                {r.collection_time ? `Collect ${formatUKDate(r.collection_time)} ${formatTime(r.collection_time)}` : "Collect -"}
                {"  "}•{"  "}
                {r.delivery_time ? `Deliver ${formatUKDate(r.delivery_time)} ${formatTime(r.delivery_time)}` : "Deliver -"}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getISOWeek(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + (4 - day));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return weekNo;
}

/* styles */
const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "white",
  cursor: "pointer",
  color: "#374151",
};

const btnTab: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "white",
  cursor: "pointer",
  fontWeight: 900,
  fontSize: 14,
};

const pill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
  border: "1px solid #e5e7eb",
  background: "#f3f4f6",
  color: "#374151",
};

const pillStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  background: "white",
  borderRadius: 14,
  padding: "10px 12px",
  minWidth: 150,
};
