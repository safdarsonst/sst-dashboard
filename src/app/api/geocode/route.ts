// app/api/geocode/route.ts
import { NextResponse } from "next/server";

type GeocodeResult = Record<string, { lat: number; lng: number } | null>;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const postcodesRaw: unknown = body?.postcodes;

    if (!Array.isArray(postcodesRaw) || postcodesRaw.length === 0) {
      return NextResponse.json({ error: "postcodes[] is required" }, { status: 400 });
    }

    // normalise: remove spaces, uppercase
    const postcodes = postcodesRaw
      .map((p) => String(p ?? ""))
      .map((p) => p.replace(/\s+/g, "").toUpperCase())
      .filter(Boolean);

    if (postcodes.length === 0) {
      return NextResponse.json({ error: "No valid postcodes provided" }, { status: 400 });
    }

    // Batch lookup (max 100 at once)
    const resp = await fetch("https://api.postcodes.io/postcodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postcodes }),
      // Next.js caching off for API calls
      cache: "no-store",
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return NextResponse.json(
        { error: `postcodes.io failed (${resp.status}): ${text.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const json = await resp.json();

    // postcodes.io returns: { status, result: [{query, result:{latitude,longitude} | null}, ...] }
    const results: GeocodeResult = {};
    for (const item of json?.result ?? []) {
      const query = String(item?.query ?? "").replace(/\s+/g, "").toUpperCase();
      const r = item?.result;
      if (!query) continue;

      if (!r) {
        results[query] = null;
      } else {
        results[query] = { lat: r.latitude, lng: r.longitude };
      }
    }

    return NextResponse.json({ results }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
