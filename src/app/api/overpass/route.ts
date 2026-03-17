import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress, fetchOsmSitePlan } from "@/lib/overpass";
import { featuresToSvg } from "@/lib/svg-renderer";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address, lat, lng, radius = 200 } = body;

    // Resolve coordinates
    let coords: { lat: number; lng: number; displayName: string };

    if (address && typeof address === "string") {
      console.log(`Geocoding address: "${address}"`);
      coords = await geocodeAddress(address);
      console.log(`Geocoded to: ${coords.lat}, ${coords.lng} (${coords.displayName})`);
    } else if (lat !== undefined && lng !== undefined) {
      coords = {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        displayName: `${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}`,
      };
    } else {
      return NextResponse.json(
        { error: "Address or coordinates (lat, lng) required" },
        { status: 400 }
      );
    }

    if (isNaN(coords.lat) || isNaN(coords.lng)) {
      return NextResponse.json(
        { error: "Invalid coordinates" },
        { status: 400 }
      );
    }

    // Clamp radius to reasonable range
    const clampedRadius = Math.max(50, Math.min(500, Number(radius) || 200));

    // Fetch from Overpass API
    console.log(`Fetching OSM data: ${coords.lat}, ${coords.lng}, radius ${clampedRadius}m`);
    const result = await fetchOsmSitePlan(coords.lat, coords.lng, clampedRadius);

    // Render SVG
    const svg = featuresToSvg(result.features, result.viewBox, { showOsmAttribution: true });

    const featureCounts = result.features.reduce(
      (acc, f) => {
        acc[f.type] = (acc[f.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const summary = Object.entries(featureCounts)
      .map(([type, count]) => `${count} ${type}(s)`)
      .join(", ");

    return NextResponse.json({
      svg,
      buildings: result.buildings,
      features: result.features,
      message: `Site plan from OpenStreetMap near ${coords.displayName}: ${summary}`,
      tracingUsed: false,
      viewBox: result.viewBox,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Overpass API error:", message, error);
    return NextResponse.json(
      { error: `Failed to fetch site plan: ${message}` },
      { status: 500 }
    );
  }
}
