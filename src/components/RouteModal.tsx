"use client";

import { useEffect, useMemo, useState } from "react";

export type RouteStopFinal = {
  stop_order: number;
  postcode: string; // pretty e.g. "WN5 0LR"
  name: string | null;
  planned_time: string | null; // ✅ ISO string (UTC) or null
  lat: number | null;
  lng: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: { stops: RouteStopFinal[]; totalMiles: number | null }) => void;
  initialStops?: RouteStopFinal[]; // ✅ prefill when editing
};

type DraftStop = {
  postcode: string;
  name?: string;
  planned_time?: string; // datetime-local string: "2025-12-21T09:30"
};

/**
 * Normalise postcode key for lookups:
 * - remove spaces
 * - uppercase
 * Example: "wn5 0lr" or "WN50LR" => "WN50LR"
 */
const normKey = (pc: string) => pc.replace(/\s+/g, "").toUpperCase();

/**
 * Pretty format for storing/display:
 * - uppercase
 * - remove spaces
 * - insert a single space before last 3 chars if length > 3
 * Example: "WN50LR" => "WN5 0LR"
 */
const formatUKPostcode = (pc: string) => {
  const key = normKey(pc);
  if (!key) return "";
  if (key.length <= 3) return key;
  return `${key.slice(0, -3)} ${key.slice(-3)}`;
};

/**
 * Convert ISO -> datetime-local value (local time)
 * ISO example: "2025-12-21T08:30:00.000Z"
 * datetime-local wants: "2025-12-21T09:30" (in your local timezone)
 */
function isoToLocalDatetime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

/**
 * Convert datetime-local -> ISO string (UTC)
 * datetime-local example: "2025-12-21T09:30"
 */
function localDatetimeToIso(local: string): string {
  // new Date("YYYY-MM-DDTHH:mm") is treated as local time by JS
  return new Date(local).toISOString();
}

export default function RouteModal({ open, onClose, onConfirm, initialStops }: Props) {
  const [collection, setCollection] = useState<DraftStop>({ postcode: "", name: "Collection" });
  const [delivery, setDelivery] = useState<DraftStop>({ postcode: "", name: "Delivery" });
  const [stops, setStops] = useState<DraftStop[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ✅ Prefill from initialStops whenever modal opens
  useEffect(() => {
    if (!open) return;

    setError(null);

    if (initialStops && initialStops.length >= 2) {
      const sorted = [...initialStops].sort((a, b) => a.stop_order - b.stop_order);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const mid = sorted.slice(1, -1);

      setCollection({
        postcode: first.postcode ?? "",
        name: first.name ?? "Collection",
        planned_time: first.planned_time ? isoToLocalDatetime(first.planned_time) : "",
      });

      setDelivery({
        postcode: last.postcode ?? "",
        name: last.name ?? "Delivery",
        planned_time: last.planned_time ? isoToLocalDatetime(last.planned_time) : "",
      });

      setStops(
        mid.map((m) => ({
          postcode: m.postcode ?? "",
          name: m.name ?? "Stop",
          planned_time: m.planned_time ? isoToLocalDatetime(m.planned_time) : "",
        }))
      );
    } else {
      setCollection({ postcode: "", name: "Collection", planned_time: "" });
      setDelivery({ postcode: "", name: "Delivery", planned_time: "" });
      setStops([]);
    }
  }, [open, initialStops]);

  const allDraft = useMemo(() => [collection, ...stops, delivery], [collection, stops, delivery]);

  if (!open) return null;

  function addStop() {
    setStops((s) => [...s, { postcode: "", name: "Stop", planned_time: "" }]);
  }

  function removeStop(i: number) {
    setStops((s) => s.filter((_, idx) => idx !== i));
  }

  function updateStopPostcode(i: number, value: string) {
    setStops((arr) => arr.map((x, idx) => (idx === i ? { ...x, postcode: value.toUpperCase() } : x)));
  }

  function blurStopPostcode(i: number) {
    setStops((arr) =>
      arr.map((x, idx) => (idx === i ? { ...x, postcode: formatUKPostcode(x.postcode) } : x))
    );
  }

  function updateStopTime(i: number, value: string) {
    setStops((arr) => arr.map((x, idx) => (idx === i ? { ...x, planned_time: value } : x)));
  }

  async function confirm() {
    setBusy(true);
    setError(null);

    try {
      const postcodes = allDraft.map((x) => normKey(x.postcode)).filter(Boolean);
      if (postcodes.length < 2) throw new Error("Please enter at least collection and delivery postcodes.");

      // 1) Geocode
      const geoResp = await fetch("/api/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcodes }),
      });

      const geoJson = await geoResp.json().catch(() => ({}));
      if (!geoResp.ok) {
        throw new Error(
          geoJson?.error ? `Geocoding failed: ${geoJson.error}` : `Geocoding failed (HTTP ${geoResp.status})`
        );
      }

      const map: Record<string, { lat: number; lng: number } | null> = geoJson?.results ?? {};
      const missing = postcodes.filter((pc) => map[pc] == null);
      if (missing.length) throw new Error(`Postcode(s) not found: ${missing.map(formatUKPostcode).join(", ")}`);

      // 2) Build final stops (include planned_time ✅)
      const finalStops: RouteStopFinal[] = allDraft.map((s, idx) => {
        const pcPretty = formatUKPostcode(s.postcode);
        const key = normKey(pcPretty);
        const hit = map[key];

        const localTime = (s.planned_time ?? "").trim();
        const isoTime = localTime ? localDatetimeToIso(localTime) : null;

        return {
          stop_order: idx + 1,
          postcode: pcPretty,
          name: s.name ?? null,
          planned_time: isoTime,
          lat: hit?.lat ?? null,
          lng: hit?.lng ?? null,
        };
      });

      // Safety: no null coords
      const bad = finalStops.find((s) => s.lat == null || s.lng == null);
      if (bad) throw new Error(`Missing coordinates for: ${bad.postcode}`);

      // 3) Road miles via OSRM
      const coords = finalStops.map((s) => ({ lat: s.lat as number, lng: s.lng as number }));

      const milesResp = await fetch("/api/route-miles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coords }),
      });

      const milesJson = await milesResp.json().catch(() => ({}));
      if (!milesResp.ok) {
        throw new Error(milesJson?.error ? `Road distance failed: ${milesJson.error}` : "Road distance failed");
      }

      const totalMiles: number | null = typeof milesJson?.miles === "number" ? milesJson.miles : null;

      onConfirm({ stops: finalStops, totalMiles });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to confirm route.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          display: "grid",
          placeItems: "center",
          padding: "20px",
          zIndex: 60,
        }}
        onMouseDown={onClose}
      >
        <div
          style={{ 
            width: "min(900px, 96%)", 
            maxHeight: "90vh",
            background: "white", 
            borderRadius: "16px", 
            padding: "24px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            overflowY: "auto"
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center",
            marginBottom: "24px",
            paddingBottom: "16px",
            borderBottom: "1px solid #e5e7eb"
          }}>
            <div>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#111827", margin: 0 }}>
                Route Planning
              </h2>
              <p style={{ fontSize: "14px", color: "#6b7280", margin: "4px 0 0 0" }}>
                Add collection, stops, and delivery locations with optional times
              </p>
            </div>
            <button 
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "8px",
                borderRadius: "8px",
                color: "#6b7280",
                fontSize: "18px",
                transition: "all 0.2s ease"
              }}
              onMouseOver={(e) => e.currentTarget.style.background = "#f3f4f6"}
              onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
            >
              ✕
            </button>
          </div>

          {/* Form Content */}
          <div style={{ marginTop: "16px" }}>
            {/* Collection Section */}
            <div style={{ 
              background: "#f0f9ff", 
              padding: "16px", 
              borderRadius: "12px",
              marginBottom: "20px",
              border: "1px solid #bae6fd"
            }}>
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "10px",
                marginBottom: "12px" 
              }}>
                <div style={{
                  width: "32px",
                  height: "32px",
                  background: "#0284c7",
                  color: "white",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 600,
                  fontSize: "14px"
                }}>
                  1
                </div>
                <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#0c4a6e", margin: 0 }}>
                  Collection Point
                </h3>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "16px", alignItems: "end" }}>
                <div>
                  <label style={{ 
                    display: "block", 
                    fontSize: "14px", 
                    fontWeight: 500, 
                    color: "#374151",
                    marginBottom: "6px"
                  }}>
                    Postcode *
                  </label>
                  <input
                    value={collection.postcode}
                    onChange={(e) => setCollection({ ...collection, postcode: e.target.value.toUpperCase() })}
                    onBlur={() => setCollection((x) => ({ ...x, postcode: formatUKPostcode(x.postcode) }))}
                    style={{ 
                      width: "90%", 
                      padding: "10px 12px", 
                      border: "1px solid #bae6fd",
                      borderRadius: "8px",
                      fontSize: "14px",
                      background: "white",
                      transition: "border 0.2s ease"
                    }}
                    placeholder="e.g. WN5 0LR"
                    onFocus={(e) => e.target.style.borderColor = "#0284c7"}
                  />
                </div>
                <div>
                  <label style={{ 
                    display: "block", 
                    fontSize: "14px", 
                    fontWeight: 500, 
                    color: "#374151",
                    marginBottom: "6px"
                  }}>
                    Collection Time <span style={{ color: "#6b7280", fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={collection.planned_time ?? ""}
                    onChange={(e) => setCollection({ ...collection, planned_time: e.target.value })}
                    style={{ 
                      width: "90%", 
                      padding: "10px 12px", 
                      border: "1px solid #d1d5db",
                      borderRadius: "8px",
                      fontSize: "14px",
                      background: "white",
                      transition: "border 0.2s ease"
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#3b82f6"}
                    onBlur={(e) => e.target.style.borderColor = "#d1d5db"}
                  />
                </div>
              </div>
            </div>

            {/* Intermediate Stops */}
            {stops.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "10px",
                  marginBottom: "16px" 
                }}>
                  <div style={{
                    width: "32px",
                    height: "32px",
                    background: "#7c3aed",
                    color: "white",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 600,
                    fontSize: "14px"
                  }}>
                    {stops.length}
                  </div>
                  <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#111827", margin: 0 }}>
                    Intermediate Stops
                  </h3>
                </div>

                <div style={{ display: "grid", gap: "12px" }}>
                  {stops.map((s, i) => (
                    <div 
                      key={i} 
                      style={{ 
                        display: "grid", 
                        gridTemplateColumns: "1fr 280px 100px", 
                        gap: "12px", 
                        alignItems: "end",
                        padding: "16px",
                        background: "#f9fafb",
                        borderRadius: "12px",
                        border: "1px solid #e5e7eb"
                      }}
                    >
                      <div>
                        <label style={{ 
                          display: "block", 
                          fontSize: "14px", 
                          fontWeight: 500, 
                          color: "#374151",
                          marginBottom: "6px"
                        }}>
                          Stop {i + 1} Postcode
                        </label>
                        <input
                          value={s.postcode}
                          onChange={(e) => updateStopPostcode(i, e.target.value)}
                          onBlur={() => blurStopPostcode(i)}
                          style={{ 
                            width: "90%", 
                            padding: "10px 12px", 
                            border: "1px solid #d1d5db",
                            borderRadius: "8px",
                            fontSize: "14px",
                            background: "white",
                            transition: "border 0.2s ease"
                          }}
                          placeholder="e.g. WS13 8NF"
                          onFocus={(e) => e.target.style.borderColor = "#3b82f6"}
                        />
                      </div>
                      <div>
                        <label style={{ 
                          display: "block", 
                          fontSize: "14px", 
                          fontWeight: 500, 
                          color: "#374151",
                          marginBottom: "6px"
                        }}>
                          Time <span style={{ color: "#6b7280", fontWeight: 400 }}>(optional)</span>
                        </label>
                        <input
                          type="datetime-local"
                          value={s.planned_time ?? ""}
                          onChange={(e) => updateStopTime(i, e.target.value)}
                          style={{ 
                            width: "85%", 
                            padding: "10px 12px", 
                            border: "1px solid #d1d5db",
                            borderRadius: "8px",
                            fontSize: "14px",
                            background: "white",
                            transition: "border 0.2s ease"
                          }}
                          onFocus={(e) => e.target.style.borderColor = "#3b82f6"}
                          onBlur={(e) => e.target.style.borderColor = "#d1d5db"}
                        />
                      </div>
                      <div style={{ display: "flex", alignItems: "end", height: "100%" }}>
                        <button 
                          onClick={() => removeStop(i)}
                          style={{ 
                            width: "100%",
                            padding: "10px 12px", 
                            background: "transparent",
                            color: "#dc2626",
                            border: "1px solid #fca5a5",
                            borderRadius: "8px",
                            cursor: "pointer",
                            fontWeight: 500,
                            fontSize: "14px",
                            transition: "all 0.2s ease"
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = "#fef2f2";
                            e.currentTarget.style.borderColor = "#f87171";
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = "transparent";
                            e.currentTarget.style.borderColor = "#fca5a5";
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add Stop Button */}
            <div style={{ marginBottom: "24px", display: "flex", justifyContent: "center" }}>
              <button 
                onClick={addStop}
                style={{ 
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "10px 20px", 
                  background: "transparent",
                  color: "#3b82f6",
                  border: "2px dashed #3b82f6",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: 500,
                  fontSize: "14px",
                  transition: "all 0.2s ease"
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "#eff6ff";
                  e.currentTarget.style.borderStyle = "solid";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderStyle = "dashed";
                }}
              >
                <svg 
                  width="16" 
                  height="16" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add Intermediate Stop
              </button>
            </div>

            {/* Delivery Section */}
            <div style={{ 
              background: "#f0fdf4", 
              padding: "16px", 
              borderRadius: "12px",
              border: "1px solid #86efac"
            }}>
              <div style={{ 
                display: "flex", 
                alignItems: "center", 
                gap: "10px",
                marginBottom: "12px" 
              }}>
                <div style={{
                  width: "32px",
                  height: "32px",
                  background: "#059669",
                  color: "white",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 600,
                  fontSize: "14px"
                }}>
                  {stops.length + 2}
                </div>
                <h3 style={{ fontSize: "16px", fontWeight: 600, color: "#064e3b", margin: 0 }}>
                  Delivery Point
                </h3>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: "16px", alignItems: "end" }}>
                <div>
                  <label style={{ 
                    display: "block", 
                    fontSize: "14px", 
                    fontWeight: 500, 
                    color: "#374151",
                    marginBottom: "6px"
                  }}>
                    Postcode *
                  </label>
                  <input
                    value={delivery.postcode}
                    onChange={(e) => setDelivery({ ...delivery, postcode: e.target.value.toUpperCase() })}
                    onBlur={() => setDelivery((x) => ({ ...x, postcode: formatUKPostcode(x.postcode) }))}
                    style={{ 
                      width: "90%", 
                      padding: "10px 12px", 
                      border: "1px solid #86efac",
                      borderRadius: "8px",
                      fontSize: "14px",
                      background: "white",
                      transition: "border 0.2s ease"
                    }}
                    placeholder="e.g. WN5 0LR"
                    onFocus={(e) => e.target.style.borderColor = "#059669"}
                  />
                </div>
                <div>
                  <label style={{ 
                    display: "block", 
                    fontSize: "14px", 
                    fontWeight: 500, 
                    color: "#374151",
                    marginBottom: "6px"
                  }}>
                    Delivery Time <span style={{ color: "#6b7280", fontWeight: 400 }}>(optional)</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={delivery.planned_time ?? ""}
                    onChange={(e) => setDelivery({ ...delivery, planned_time: e.target.value })}
                    style={{ 
                      width: "90%", 
                      padding: "10px 12px", 
                      border: "1px solid #d1d5db",
                      borderRadius: "8px",
                      fontSize: "14px",
                      background: "white",
                      transition: "border 0.2s ease"
                    }}
                    onFocus={(e) => e.target.style.borderColor = "#3b82f6"}
                    onBlur={(e) => e.target.style.borderColor = "#d1d5db"}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div style={{ 
              background: "#fef2f2", 
              border: "1px solid #fca5a5", 
              color: "#dc2626",
              padding: "12px 16px",
              borderRadius: "8px",
              marginTop: "24px",
              display: "flex",
              alignItems: "flex-start",
              gap: "10px"
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span style={{ fontSize: "14px" }}>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ 
            display: "flex", 
            justifyContent: "flex-end", 
            gap: "12px", 
            marginTop: "24px",
            paddingTop: "20px",
            borderTop: "1px solid #e5e7eb"
          }}>
            <button 
              onClick={onClose} 
              disabled={busy}
              style={{ 
                padding: "10px 20px", 
                background: "transparent",
                color: "#6b7280",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: "14px",
                transition: "all 0.2s ease"
              }}
              onMouseOver={(e) => {
                if (!busy) {
                  e.currentTarget.style.background = "#f3f4f6";
                  e.currentTarget.style.borderColor = "#9ca3af";
                }
              }}
              onMouseOut={(e) => {
                if (!busy) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = "#d1d5db";
                }
              }}
            >
              Cancel
            </button>
            <button 
              onClick={confirm} 
              disabled={busy}
              style={{ 
                padding: "10px 24px", 
                background: busy ? "#9ca3af" : "#059669",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: busy ? "not-allowed" : "pointer",
                fontWeight: 500,
                fontSize: "14px",
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
              onMouseOver={(e) => {
                if (!busy) {
                  e.currentTarget.style.background = "#047857";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }
              }}
              onMouseOut={(e) => {
                if (!busy) {
                  e.currentTarget.style.background = "#059669";
                  e.currentTarget.style.transform = "translateY(0)";
                }
              }}
            >
              {busy ? (
                <>
                  <div style={{
                    width: "16px",
                    height: "16px",
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "white",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite"
                  }}></div>
                  Calculating Route...
                </>
              ) : (
                <>
                  <svg 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  Confirm Route
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Spinner Animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}