"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Calendar,
  CheckCircle,
  Clock,
  Coins,
  Edit3,
  Loader2,
  Trash2,
  Users,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  MinusCircle,
  HeartPulse,
  Briefcase,
  StickyNote,
} from "lucide-react";

type PayType = "hourly" | "shift";

/**
 * IMPORTANT:
 * - driver_day_entries.status is assumed to be TEXT in Postgres (so we can store: work/leave/off/sick).
 * - We store the "reason" in notes (no schema change required).
 */
type DayStatus = "work" | "leave" | "off" | "sick";

type DriverRow = {
  id: string;
  full_name: string;
  pay_type: PayType;
  pay_rate: number;
};

type DayEntry = {
  id: string;
  driver_id: string;
  entry_date: string; // YYYY-MM-DD
  status: DayStatus;
  shifts: number; // for shift-based: 1 shift for work/leave. off/sick => 0
  hours: number | null; // for hourly: work hours; leave uses defaultLeaveHours; off/sick => 0
  notes: string | null;
};

type PayrollRow = {
  id: string;
  driver_id: string;
  week_start: string; // YYYY-MM-DD
  paid: boolean;
  paid_at: string | null;
  paid_note: string | null;
};

// View for sync (created earlier in your SQL work)
type CompletedJobDay = {
  driver_id: string;
  entry_date: string; // YYYY-MM-DD
  jobs_count: number;
  owner_id?: string | null;
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

function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // move to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ISO week number (Monday-start)
function getISOWeekInfo(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const day = d.getDay() || 7; // Sunday=7
  d.setDate(d.getDate() + (4 - day)); // Thursday decides ISO year
  const isoYear = d.getFullYear();

  const jan4 = new Date(isoYear, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - (jan4Day - 1));

  const diffMs = d.getTime() - week1Monday.getTime();
  const week = 1 + Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  return { isoYear, week };
}

function mondayFromISOWeek(isoYear: number, week: number) {
  const jan4 = new Date(isoYear, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - (jan4Day - 1));
  const monday = new Date(week1Monday);
  monday.setDate(week1Monday.getDate() + (week - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function formatMoneyGBP(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatUKDate(isoDate: string) {
  const d = parseISODate(isoDate);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function weekdayLabel(isoDate: string) {
  const d = parseISODate(isoDate);
  return d.toLocaleDateString("en-GB", { weekday: "short" });
}

function clampNum(v: string, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const MANUAL_REASONS = [
  "Standby",
  "Yard work",
  "Training",
  "Vehicle checks",
  "Maintenance support",
  "Ferry/Waiting",
  "Other",
] as const;

function buildManualNote(kind: "Work" | "Leave" | "Off" | "Sick", reason: string, free: string) {
  const r = (reason || "").trim();
  const t = (free || "").trim();
  const parts = [`Manual: ${kind}`];
  if (r && r !== "Other") parts.push(`(${r})`);
  if (r === "Other" && t) parts.push(`(${t})`);
  else if (t) parts.push(`— ${t}`);
  return parts.join(" ");
}

function isProtectedStatus(s: DayStatus) {
  // We never overwrite these on sync
  return s === "leave" || s === "off" || s === "sick";
}

export default function DriverPayPage() {
  const [weekStart, setWeekStart] = useState<string>(() => toISODate(startOfWeekMonday(new Date())));
  const [defaultLeaveHours, setDefaultLeaveHours] = useState<string>("8");

  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [entries, setEntries] = useState<DayEntry[]>([]);
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);

  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // jump controls
  const isoInfo = useMemo(() => getISOWeekInfo(parseISODate(weekStart)), [weekStart]);
  const [jumpYear, setJumpYear] = useState<number>(isoInfo.isoYear);
  const [jumpWeek, setJumpWeek] = useState<number>(isoInfo.week);

  useEffect(() => {
    setJumpYear(isoInfo.isoYear);
    setJumpWeek(isoInfo.week);
  }, [isoInfo.isoYear, isoInfo.week]);

  // detail modal
  const [open, setOpen] = useState(false);
  const [activeDriver, setActiveDriver] = useState<DriverRow | null>(null);
  const [savingDay, setSavingDay] = useState(false);
  const [savingPaid, setSavingPaid] = useState<string | null>(null);
  const [syncingJobs, setSyncingJobs] = useState(false);

  // manual fields (per modal)
  const [manualReason, setManualReason] = useState<(typeof MANUAL_REASONS)[number]>("Standby");
  const [manualFreeText, setManualFreeText] = useState<string>("");

  const weekDates = useMemo(() => {
    const s = parseISODate(weekStart);
    return Array.from({ length: 7 }, (_, i) => toISODate(addDays(s, i)));
  }, [weekStart]);

  const weekEnd = useMemo(() => weekDates[6], [weekDates]);

  const entriesByDriverDate = useMemo(() => {
    const map = new Map<string, DayEntry>();
    for (const e of entries) map.set(`${e.driver_id}__${e.entry_date}`, e);
    return map;
  }, [entries]);

  const payrollByDriver = useMemo(() => {
    const map = new Map<string, PayrollRow>();
    for (const p of payroll) map.set(p.driver_id, p);
    return map;
  }, [payroll]);

  function getEntry(driver_id: string, date: string) {
    return entriesByDriverDate.get(`${driver_id}__${date}`) ?? null;
  }

  /**
   * Pay rules (recommended):
   * - Paid statuses: work, leave
   * - Unpaid statuses: off, sick  (you can later add an option for paid sick if you want)
   */
  function computeDriverWeek(d: DriverRow) {
    let workUnits = 0;
    let leaveUnits = 0;
    let unpaidUnits = 0;

    let hoursWork = 0;
    let hoursLeave = 0;
    let hoursUnpaid = 0;

    for (const day of weekDates) {
      const entry = getEntry(d.id, day);
      if (!entry) continue;

      if (entry.status === "work") {
        if (d.pay_type === "shift") workUnits += entry.shifts ?? 1;
        else hoursWork += entry.hours ?? 0;
      } else if (entry.status === "leave") {
        if (d.pay_type === "shift") leaveUnits += entry.shifts ?? 1;
        else hoursLeave += entry.hours ?? 0;
      } else {
        // off / sick
        if (d.pay_type === "shift") unpaidUnits += 1;
        else hoursUnpaid += entry.hours ?? 0;
      }
    }

    let amount = 0;
    if (d.pay_type === "shift") {
      amount = (workUnits + leaveUnits) * (d.pay_rate ?? 0);
    } else {
      amount = (hoursWork + hoursLeave) * (d.pay_rate ?? 0);
    }

    return { workUnits, leaveUnits, unpaidUnits, hoursWork, hoursLeave, hoursUnpaid, amount };
  }

  async function load() {
    setBusy(true);
    setError(null);

    try {
      const s = weekStart;
      const e = weekEnd;

      const { data: dRows, error: dErr } = await supabase
        .from("drivers")
        .select("id, full_name, pay_type, pay_rate")
        .order("full_name", { ascending: true });
      if (dErr) throw dErr;

      const { data: eRows, error: eErr } = await supabase
        .from("driver_day_entries")
        .select("id, driver_id, entry_date, status, shifts, hours, notes")
        .gte("entry_date", s)
        .lte("entry_date", e)
        .order("entry_date", { ascending: true });
      if (eErr) throw eErr;

      const { data: pRows, error: pErr } = await supabase
        .from("driver_week_payroll")
        .select("id, driver_id, week_start, paid, paid_at, paid_note")
        .eq("week_start", s);
      if (pErr) throw pErr;

      setDrivers((dRows as DriverRow[]) ?? []);
      setEntries(((eRows as any[]) ?? []) as DayEntry[]);
      setPayroll((pRows as PayrollRow[]) ?? []);
    } catch (err: any) {
      setDrivers([]);
      setEntries([]);
      setPayroll([]);
      setError(err?.message ?? "Failed to load weekly pay.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  function openDriverDetail(d: DriverRow) {
    setActiveDriver(d);
    setManualReason("Standby");
    setManualFreeText("");
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setActiveDriver(null);
  }

  function prevWeek() {
    const s = parseISODate(weekStart);
    setWeekStart(toISODate(addDays(s, -7)));
  }
  function nextWeek() {
    const s = parseISODate(weekStart);
    setWeekStart(toISODate(addDays(s, 7)));
  }
  function jumpToWeek() {
    const wk = Math.max(1, Math.min(53, Number(jumpWeek)));
    const yr = Number(jumpYear);
    const monday = mondayFromISOWeek(yr, wk);
    setWeekStart(toISODate(monday));
  }

  async function setPaid(driver_id: string, paid: boolean) {
    setSavingPaid(driver_id);
    setError(null);

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = authData?.user;
      if (!user) throw new Error("Auth session missing. Please log in again.");

      const payload = {
        owner_id: user.id,
        driver_id,
        week_start: weekStart,
        paid,
        paid_at: paid ? new Date().toISOString() : null,
        paid_note: null,
      };

      const { error: upErr } = await supabase
        .from("driver_week_payroll")
        .upsert(payload, { onConflict: "owner_id,driver_id,week_start" });

      if (upErr) throw upErr;

      await load();
    } catch (err: any) {
      setError(err?.message ?? "Failed to update paid status.");
    } finally {
      setSavingPaid(null);
    }
  }

  async function upsertDayEntry(
    driver: DriverRow,
    date: string,
    status: DayStatus,
    opts?: { manual?: boolean; manualKindLabel?: "Work" | "Leave" | "Off" | "Sick"; hoursOverride?: number | null }
  ) {
    setSavingDay(true);
    setError(null);

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = authData?.user;
      if (!user) throw new Error("Auth session missing. Please log in again.");

      const existing = getEntry(driver.id, date);

      const leaveHoursNum = Math.max(0, clampNum(defaultLeaveHours, 8));

      // For shift-based drivers:
      // - work/leave => shifts=1
      // - off/sick => shifts=0
      const shifts =
        driver.pay_type === "shift"
          ? status === "work" || status === "leave"
            ? 1
            : 0
          : 1; // ignored for hourly calculations, but keep consistent.

      // For hourly drivers:
      // - work => hours as existing or override
      // - leave => defaultLeaveHours (or override)
      // - off/sick => 0
      let hours: number | null = null;
      if (driver.pay_type === "hourly") {
        if (status === "work") {
          const base = existing?.status === "work" ? existing?.hours ?? 0 : 0;
          hours = typeof opts?.hoursOverride === "number" ? opts.hoursOverride : base;
        } else if (status === "leave") {
          hours = typeof opts?.hoursOverride === "number" ? opts.hoursOverride : leaveHoursNum;
        } else {
          hours = 0;
        }
      }

      let notes = existing?.notes ?? null;

      if (opts?.manual) {
        const kind = opts.manualKindLabel ?? "Work";
        notes = buildManualNote(kind, manualReason, manualFreeText);
      } else {
        if (status === "work") notes = existing?.notes ?? "Auto: from completed job";
        if (status === "leave") notes = existing?.notes ?? "Manual: Annual leave";
        if (status === "off") notes = existing?.notes ?? "Manual: Off (unpaid)";
        if (status === "sick") notes = existing?.notes ?? "Manual: Sick (unpaid)";
      }

      const payload = {
        owner_id: user.id,
        driver_id: driver.id,
        entry_date: date,
        status,
        shifts,
        hours,
        notes,
      };

      const { error: upErr } = await supabase
        .from("driver_day_entries")
        .upsert(payload, { onConflict: "owner_id,driver_id,entry_date" });

      if (upErr) throw upErr;

      await load();
    } catch (err: any) {
      setError(err?.message ?? "Failed to save day entry.");
    } finally {
      setSavingDay(false);
    }
  }

  async function clearDayEntry(driver_id: string, date: string) {
    setSavingDay(true);
    setError(null);

    try {
      const { error: delErr } = await supabase
        .from("driver_day_entries")
        .delete()
        .eq("driver_id", driver_id)
        .eq("entry_date", date);

      if (delErr) throw delErr;

      await load();
    } catch (err: any) {
      setError(err?.message ?? "Failed to clear day entry.");
    } finally {
      setSavingDay(false);
    }
  }

  async function updateWorkHours(driver: DriverRow, date: string, hoursStr: string) {
    if (driver.pay_type !== "hourly") return;

    const entry = getEntry(driver.id, date);
    if (!entry || entry.status !== "work") return;

    setSavingDay(true);
    setError(null);

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = authData?.user;
      if (!user) throw new Error("Auth session missing. Please log in again.");

      const hours = Math.max(0, clampNum(hoursStr, 0));

      const payload = {
        owner_id: user.id,
        driver_id: driver.id,
        entry_date: date,
        status: "work" as const,
        shifts: 1,
        hours,
        notes: entry.notes ?? null,
      };

      const { error: upErr } = await supabase
        .from("driver_day_entries")
        .upsert(payload, { onConflict: "owner_id,driver_id,entry_date" });

      if (upErr) throw upErr;

      await load();
    } catch (err: any) {
      setError(err?.message ?? "Failed to update hours.");
    } finally {
      setSavingDay(false);
    }
  }

  /**
   * Sync shifts from completed jobs (1 shift per driver per day if any completed job exists that day).
   * Uses v_driver_completed_job_days (driver_id, entry_date, jobs_count, owner_id)
   *
   * RULES:
   * - Never overwrite leave/off/sick
   * - Never overwrite an existing manual work entry (notes starts with "Manual:")
   * - Only creates work entries where none exist
   */
  async function syncFromCompletedJobs() {
    setSyncingJobs(true);
    setError(null);

    try {
      const { data: authData, error: authErr } = await supabase.auth.getUser();
      if (authErr) throw authErr;
      const user = authData?.user;
      if (!user) throw new Error("Auth session missing. Please log in again.");

      const start = weekStart;
      const end = weekEnd;

      const { data: rows, error: vErr } = await supabase
  .from("v_driver_completed_job_days")
  .select("driver_id, entry_date, owner_id")   // ✅ remove jobs_count
  .eq("owner_id", user.id)
  .gte("entry_date", start)
  .lte("entry_date", end)
  .order("entry_date", { ascending: true });

if (vErr) throw vErr;

const list = (rows as Array<{ driver_id: string; entry_date: string }>) ?? [];

for (const r of list) {
  if (!r.driver_id || !r.entry_date) continue;

  const key = `${r.driver_id}__${r.entry_date}`;
  const existing = entriesByDriverDate.get(key);

  // don't overwrite protected statuses
  if (existing && isProtectedStatus(existing.status)) continue;

  // don't overwrite manual work
  if (existing?.notes?.trim().toLowerCase().startsWith("manual:")) continue;

  // if already work, do nothing
  if (existing?.status === "work") continue;

  const payload = {
    owner_id: user.id,
    driver_id: r.driver_id,
    entry_date: r.entry_date,
    status: "work" as const,
    shifts: 1,
    hours: null,
    notes: "Auto: from completed job",
  };

  const { error: upErr } = await supabase
    .from("driver_day_entries")
    .upsert(payload, { onConflict: "owner_id,driver_id,entry_date" });

  if (upErr) throw upErr;
}


      await load();
    } catch (err: any) {
      setError(err?.message ?? "Failed to sync from completed jobs.");
    } finally {
      setSyncingJobs(false);
    }
  }

  const totals = useMemo(() => {
    let totalDue = 0;
    let unpaidDrivers = 0;

    for (const d of drivers) {
      const w = computeDriverWeek(d);
      totalDue += w.amount;

      const hasAny =
        (d.pay_type === "shift" && (w.workUnits > 0 || w.leaveUnits > 0 || w.unpaidUnits > 0)) ||
        (d.pay_type === "hourly" && (w.hoursWork > 0 || w.hoursLeave > 0 || w.hoursUnpaid > 0));

      const p = payrollByDriver.get(d.id);
      if (!p?.paid && hasAny && w.amount > 0) unpaidDrivers += 1;
    }

    return { totalDue, unpaidDrivers };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drivers, payrollByDriver, entries, weekDates]);

  const weekLabel = useMemo(() => {
    const s = parseISODate(weekStart);
    const e = parseISODate(weekEnd);
    const sTxt = s.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
    const eTxt = e.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    return `${sTxt} – ${eTxt}`;
  }, [weekStart, weekEnd]);

  return (
    <div style={{ maxWidth: 1350, margin: "0 auto", padding: "24px 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "#111827", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <Coins size={24} />
            Driver Payroll
          </h1>
          <p style={{ margin: "8px 0 0 0", color: "#6b7280", fontSize: 14 }}>
            <strong>Week {isoInfo.week}</strong> ({isoInfo.isoYear}) • {weekLabel}
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div style={cardPill}>
            <span style={{ color: "#6b7280", fontSize: 12 }}>Total due</span>
            <div style={{ fontWeight: 900, color: "#111827" }}>{formatMoneyGBP(totals.totalDue)}</div>
          </div>

          <div
            style={{
              ...cardPill,
              borderColor: totals.unpaidDrivers ? "#fecaca" : "#e5e7eb",
              background: totals.unpaidDrivers ? "#fef2f2" : "white",
            }}
          >
            <span style={{ color: totals.unpaidDrivers ? "#991b1b" : "#6b7280", fontSize: 12 }}>Unpaid drivers</span>
            <div style={{ fontWeight: 900, color: totals.unpaidDrivers ? "#991b1b" : "#111827" }}>{totals.unpaidDrivers}</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
          <div>
            <label style={label}>Scroll weeks</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={prevWeek} style={btn}>
                <ChevronLeft size={16} />
                Prev
              </button>
              <button type="button" onClick={nextWeek} style={btn}>
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div style={{ minWidth: 220 }}>
            <label style={label}>Week starting (Monday)</label>
            <div style={{ position: "relative" }}>
              <Calendar size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
              <input
                type="date"
                value={weekStart}
                onChange={(e) => {
                  const picked = parseISODate(e.target.value);
                  setWeekStart(toISODate(startOfWeekMonday(picked)));
                }}
                style={{ ...input, paddingLeft: 38 }}
              />
            </div>
          </div>

          <div style={{ minWidth: 300 }}>
            <label style={label}>Jump to ISO week</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="number"
                min={1}
                max={53}
                value={jumpWeek}
                onChange={(e) => setJumpWeek(Number(e.target.value))}
                style={input}
                placeholder="Week"
              />
              <input
                type="number"
                value={jumpYear}
                onChange={(e) => setJumpYear(Number(e.target.value))}
                style={input}
                placeholder="Year"
              />
              <button type="button" onClick={jumpToWeek} style={{ ...btn, fontWeight: 900 }}>
                Go
              </button>
            </div>
          </div>

          <div style={{ minWidth: 240 }}>
            <label style={label}>Hourly leave: paid hours/day</label>
            <div style={{ position: "relative" }}>
              <Clock size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
              <input
                type="number"
                min="0"
                step="0.25"
                value={defaultLeaveHours}
                onChange={(e) => setDefaultLeaveHours(e.target.value)}
                style={{ ...input, paddingLeft: 38 }}
              />
            </div>
          </div>

          <div style={{ marginLeft: "auto" }}>
            <label style={label}>Sync</label>
            <button
              type="button"
              onClick={syncFromCompletedJobs}
              disabled={syncingJobs}
              style={{ ...btn, fontWeight: 900 }}
              title="Mark a work-day if driver has any completed job that day (won't overwrite leave/off/sick/manual)"
            >
              {syncingJobs ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              Sync from completed jobs
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 14, padding: 14, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <AlertCircle size={18} color="#dc2626" style={{ marginTop: 2 }} />
          <div style={{ color: "#991b1b" }}>{error}</div>
        </div>
      )}

      {busy ? (
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, padding: 18, display: "flex", gap: 10, alignItems: "center" }}>
          <Loader2 className="spin" size={18} />
          Loading…
          <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1060 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e5e7eb" }}>
                  {["Driver", "Pay", "Work", "Leave (paid)", "Off/Sick (unpaid)", "Amount due", "Paid", "Actions"].map((h) => (
                    <th key={h} style={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {drivers.map((d, idx) => {
                  const w = computeDriverWeek(d);
                  const p = payrollByDriver.get(d.id);
                  const paid = !!p?.paid;

                  const payLabel =
                    d.pay_type === "shift"
                      ? `${formatMoneyGBP(d.pay_rate)}/shift`
                      : `${formatMoneyGBP(d.pay_rate)}/hr`;

                  return (
                    <tr key={d.id} style={{ borderBottom: idx < drivers.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 10,
                              background: "linear-gradient(135deg,#3b82f6,#1d4ed8)",
                              display: "grid",
                              placeItems: "center",
                              color: "white",
                              fontWeight: 900,
                            }}
                          >
                            {d.full_name?.slice(0, 1)?.toUpperCase() ?? "D"}
                          </div>
                          <div>
                            <div style={{ fontWeight: 900, color: "#111827" }}>{d.full_name}</div>
                            <div style={{ fontSize: 12, color: "#6b7280" }}>ID: {d.id.slice(0, 8)}</div>
                          </div>
                        </div>
                      </td>

                      <td style={td}>
                        <div style={{ fontWeight: 800, color: "#111827" }}>{payLabel}</div>
                      </td>

                      <td style={td}>
                        {d.pay_type === "shift" ? (
                          <span style={pillBlue}>{w.workUnits} shift{w.workUnits === 1 ? "" : "s"}</span>
                        ) : (
                          <span style={pillBlue}>{w.hoursWork.toFixed(2)} hr</span>
                        )}
                      </td>

                      <td style={td}>
                        {d.pay_type === "shift" ? (
                          <span style={pillAmber}>{w.leaveUnits} day{w.leaveUnits === 1 ? "" : "s"}</span>
                        ) : (
                          <span style={pillAmber}>{w.hoursLeave.toFixed(2)} hr</span>
                        )}
                      </td>

                      <td style={td}>
                        {d.pay_type === "shift" ? (
                          <span style={pillGray}>{w.unpaidUnits} day{w.unpaidUnits === 1 ? "" : "s"}</span>
                        ) : (
                          <span style={pillGray}>{w.hoursUnpaid.toFixed(2)} hr</span>
                        )}
                      </td>

                      <td style={td}>
                        <div style={{ fontWeight: 900, color: "#111827" }}>{formatMoneyGBP(w.amount)}</div>
                      </td>

                      <td style={td}>
                        <button
                          type="button"
                          onClick={() => setPaid(d.id, !paid)}
                          disabled={savingPaid === d.id}
                          style={{
                            ...btn,
                            background: paid ? "#d1fae5" : "#fef2f2",
                            borderColor: paid ? "#a7f3d0" : "#fecaca",
                            color: paid ? "#065f46" : "#991b1b",
                            fontWeight: 900,
                          }}
                        >
                          {savingPaid === d.id ? (
                            <>
                              <Loader2 className="spin" size={16} />
                              Saving…
                            </>
                          ) : paid ? (
                            <>
                              <CheckCircle size={16} />
                              Paid
                            </>
                          ) : (
                            <>
                              <Users size={16} />
                              Unpaid
                            </>
                          )}
                        </button>
                      </td>

                      <td style={td}>
                        <button type="button" onClick={() => openDriverDetail(d)} style={{ ...btn, fontWeight: 900 }}>
                          <Edit3 size={16} />
                          Week details
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {drivers.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: 28, textAlign: "center", color: "#6b7280" }}>
                      No drivers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Details modal */}
      {open && activeDriver && (
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
              padding: 20,
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#111827" }}>
                  {activeDriver.full_name} — Week details
                </h2>
                <div style={{ marginTop: 6, color: "#6b7280", fontSize: 14 }}>
                  Week {isoInfo.week} ({isoInfo.isoYear}) • {weekLabel}
                </div>
              </div>

              <button type="button" onClick={closeModal} style={{ ...btn, fontWeight: 900 }}>
                <X size={16} />
                Close
              </button>
            </div>

            {/* Manual reason controls */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, marginBottom: 14, background: "#fafafa" }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
                <div style={{ minWidth: 220 }}>
                  <label style={label}>
                    <StickyNote size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                    Manual reason
                  </label>
                  <select value={manualReason} onChange={(e) => setManualReason(e.target.value as any)} style={input}>
                    {MANUAL_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ flex: 1, minWidth: 260 }}>
                  <label style={label}>Extra notes (optional)</label>
                  <input
                    value={manualFreeText}
                    onChange={(e) => setManualFreeText(e.target.value)}
                    placeholder="e.g. Yard work / standby / training details…"
                    style={input}
                  />
                </div>

                <div style={{ fontSize: 12, color: "#6b7280", maxWidth: 520 }}>
                  Manual entries are useful for <strong>standby</strong>, <strong>yard work</strong>, <strong>training</strong>, or days where no jobs were completed.
                  Sync will not overwrite Leave / Off / Sick, and will not overwrite manual work notes.
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
              {weekDates.map((day) => {
                const entry = getEntry(activeDriver.id, day);
                const isWork = entry?.status === "work";
                const isLeave = entry?.status === "leave";
                const isOff = entry?.status === "off";
                const isSick = entry?.status === "sick";

                const tag = isWork ? pillBlue : isLeave ? pillAmber : isOff || isSick ? pillGray : pillGray;

                const statusLabel = isWork ? "Work" : isLeave ? "Leave (paid)" : isOff ? "Off (unpaid)" : isSick ? "Sick (unpaid)" : "—";

                return (
                  <div key={day} style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "white" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 900, color: "#111827" }}>{weekdayLabel(day)}</div>
                        <div style={{ fontSize: 13, color: "#6b7280" }}>{formatUKDate(day)}</div>
                      </div>

                      <div>
                        <span style={tag}>{statusLabel}</span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {/* Manual Work */}
                      <button
                        type="button"
                        disabled={savingDay}
                        onClick={() => upsertDayEntry(activeDriver, day, "work", { manual: true, manualKindLabel: "Work" })}
                        style={{
                          ...btnSmall,
                          background: isWork ? "#eff6ff" : "white",
                          borderColor: isWork ? "#bfdbfe" : "#e5e7eb",
                          color: isWork ? "#1d4ed8" : "#374151",
                          fontWeight: 900,
                        }}
                        title="Manual Work day (paid)"
                      >
                        <Briefcase size={14} />
                        Work
                      </button>

                      {/* Manual Leave */}
                      <button
                        type="button"
                        disabled={savingDay}
                        onClick={() => upsertDayEntry(activeDriver, day, "leave", { manual: true, manualKindLabel: "Leave" })}
                        style={{
                          ...btnSmall,
                          background: isLeave ? "#fffbeb" : "white",
                          borderColor: isLeave ? "#fde68a" : "#e5e7eb",
                          color: isLeave ? "#92400e" : "#374151",
                          fontWeight: 900,
                        }}
                        title="Annual leave (paid)"
                      >
                        Leave
                      </button>

                      {/* Manual Off (unpaid) */}
                      <button
                        type="button"
                        disabled={savingDay}
                        onClick={() => upsertDayEntry(activeDriver, day, "off", { manual: true, manualKindLabel: "Off" })}
                        style={{
                          ...btnSmall,
                          background: isOff ? "#f3f4f6" : "white",
                          borderColor: isOff ? "#e5e7eb" : "#e5e7eb",
                          color: isOff ? "#374151" : "#374151",
                          fontWeight: 900,
                        }}
                        title="Off day (unpaid)"
                      >
                        <MinusCircle size={14} />
                        Off
                      </button>

                      {/* Manual Sick (unpaid) */}
                      <button
                        type="button"
                        disabled={savingDay}
                        onClick={() => upsertDayEntry(activeDriver, day, "sick", { manual: true, manualKindLabel: "Sick" })}
                        style={{
                          ...btnSmall,
                          background: isSick ? "#f3f4f6" : "white",
                          borderColor: isSick ? "#e5e7eb" : "#e5e7eb",
                          color: isSick ? "#374151" : "#374151",
                          fontWeight: 900,
                        }}
                        title="Sick day (unpaid)"
                      >
                        <HeartPulse size={14} />
                        Sick
                      </button>

                      {/* Clear */}
                      <button
                        type="button"
                        disabled={savingDay || !entry}
                        onClick={() => clearDayEntry(activeDriver.id, day)}
                        style={{
                          ...btnSmall,
                          background: "white",
                          borderColor: "#fecaca",
                          color: "#b91c1c",
                          fontWeight: 900,
                          opacity: entry ? 1 : 0.5,
                          cursor: entry ? "pointer" : "not-allowed",
                        }}
                      >
                        <Trash2 size={14} />
                        Clear
                      </button>
                    </div>

                    {/* Notes preview */}
                    <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
                      <strong style={{ color: "#374151" }}>Notes:</strong>{" "}
                      {entry?.notes?.trim() ? entry.notes : "—"}
                    </div>

                    {/* Hourly input */}
                    {activeDriver.pay_type === "hourly" && (
                      <div style={{ marginTop: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 900, color: "#374151" }}>Hours</label>
                        <div style={{ marginTop: 6 }}>
                          <input
                            type="number"
                            min="0"
                            step="0.25"
                            value={
                              entry?.hours ??
                              (isLeave ? clampNum(defaultLeaveHours, 8) : isOff || isSick ? 0 : 0)
                            }
                            disabled={!isWork || savingDay}
                            onChange={(e) => updateWorkHours(activeDriver, day, e.target.value)}
                            style={{
                              ...input,
                              opacity: isWork ? 1 : 0.6,
                              cursor: isWork ? "text" : "not-allowed",
                            }}
                          />
                          <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                            {isLeave
                              ? `Paid leave hours: ${clampNum(defaultLeaveHours, 8)}`
                              : isOff || isSick
                              ? "Unpaid day (hours set to 0)"
                              : isWork
                              ? "Enter worked hours (paid)"
                              : "Select Work to edit hours"}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Shift-based helper */}
                    {activeDriver.pay_type === "shift" && (
                      <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280" }}>
                        {isLeave
                          ? "Counts as 1 paid leave day."
                          : isWork
                          ? "Counts as 1 paid shift."
                          : isOff
                          ? "Off day (unpaid)."
                          : isSick
                          ? "Sick day (unpaid)."
                          : "Select Work / Leave / Off / Sick."}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* styles */
const label: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 900,
  color: "#374151",
  marginBottom: 6,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  outline: "none",
  fontSize: 14,
  boxSizing: "border-box",
  background: "white",
};

const th: React.CSSProperties = {
  padding: "14px 16px",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 900,
  color: "#374151",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const td: React.CSSProperties = {
  padding: "14px 16px",
  color: "#374151",
  verticalAlign: "middle",
};

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "white",
  cursor: "pointer",
  color: "#374151",
};

const btnSmall: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid #e5e7eb",
  background: "white",
  cursor: "pointer",
  color: "#374151",
  fontSize: 13,
};

const cardPill: React.CSSProperties = {
  background: "white",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  padding: "10px 12px",
  display: "grid",
  gap: 2,
  minWidth: 150,
};

const pillBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 900,
};

const pillBlue: React.CSSProperties = {
  ...pillBase,
  background: "#eff6ff",
  color: "#1d4ed8",
  border: "1px solid #bfdbfe",
};

const pillAmber: React.CSSProperties = {
  ...pillBase,
  background: "#fffbeb",
  color: "#92400e",
  border: "1px solid #fde68a",
};

const pillGray: React.CSSProperties = {
  ...pillBase,
  background: "#f3f4f6",
  color: "#374151",
  border: "1px solid #e5e7eb",
};
