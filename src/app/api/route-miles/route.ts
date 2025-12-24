// app/api/route-miles/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const coordsRaw: unknown = body?.coords;

    if (!Array.isArray(coordsRaw) || coordsRaw.length < 2) {
      return NextResponse.json({ error: "coords[] (length >= 2) is required" }, { status: 400 });
    }

    // Expect: [{lat:number, lng:number}, ...]
    const coords = coordsRaw
      .map((c: any) => ({
        lat: Number(c?.lat),
        lng: Number(c?.lng),
      }))
      .filter((c: any) => Number.isFinite(c.lat) && Number.isFinite(c.lng));

    if (coords.length < 2) {
      return NextResponse.json({ error: "coords[] must contain valid lat/lng values" }, { status: 400 });
    }

    // OSRM expects "lng,lat;lng,lat;..."
    const path = coords.map((c) => `${c.lng},${c.lat}`).join(";");

    const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=false`;

    const resp = await fetch(url, { cache: "no-store" });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return NextResponse.json(
        { error: `OSRM failed (${resp.status}): ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const json = await resp.json();
    const meters = json?.routes?.[0]?.distance;

    if (typeof meters !== "number") {
      return NextResponse.json({ error: "OSRM did not return a distance" }, { status: 502 });
    }

    const miles = meters / 1609.344;
    const rounded = Math.round(miles * 10) / 10; // 1 decimal

    return NextResponse.json({ miles: rounded }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
