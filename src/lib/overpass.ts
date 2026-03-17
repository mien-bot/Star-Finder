// ─── OpenStreetMap Overpass API client ────────────────────────────────────────
// Fetches building footprints and roads from OSM, converts to Feature[] format.

import { Point, Feature, centerlineToPolygon, computeParcels } from "./geometry";

// ─── Types ───────────────────────────────────────────────────────────────────

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
}

interface BBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface OverpassResult {
  features: Feature[];
  buildings: { id: number; points: Point[] }[];
  viewBox: { width: number; height: number };
  location: string;
}

// ─── Geocoding via Nominatim ─────────────────────────────────────────────────

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; displayName: string }> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;

  const res = await fetch(url, {
    headers: { "User-Agent": "HYLO-SP/1.0 (site-plan-generator)" },
  });

  if (!res.ok) {
    throw new Error(`Geocoding failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (!data || data.length === 0) {
    throw new Error(`Address not found: "${address}"`);
  }

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  };
}

// ─── Overpass API query ──────────────────────────────────────────────────────

async function queryOverpass(
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<OverpassElement[]> {
  // Compute bounding box from center + radius
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));

  const bbox = `${lat - latDelta},${lng - lngDelta},${lat + latDelta},${lng + lngDelta}`;

  const query = `
[out:json][timeout:25];
(
  way["building"](${bbox});
  way["highway"](${bbox});
  way["natural"="water"](${bbox});
  way["waterway"](${bbox});
  way["leisure"="park"](${bbox});
  way["landuse"="grass"](${bbox});
  way["natural"="wood"](${bbox});
);
out body;
>;
out skel qt;
`;

  console.log(`Overpass query: center ${lat.toFixed(5)},${lng.toFixed(5)}, radius ${radiusMeters}m`);

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    if (res.status === 429) {
      throw new Error("Overpass API rate limited. Please wait a moment and try again.");
    }
    throw new Error(`Overpass API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.elements || [];
}

// ─── Convert OSM elements to Feature[] ───────────────────────────────────────

function osmToFeatures(
  elements: OverpassElement[],
  centerLat: number,
  centerLng: number,
  radiusMeters: number
): OverpassResult {
  // Build node lookup
  const nodes = new Map<number, { lat: number; lon: number }>();
  for (const el of elements) {
    if (el.type === "node" && el.lat !== undefined && el.lon !== undefined) {
      nodes.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  // Compute actual bounding box from all nodes for accurate viewBox
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.cos((centerLat * Math.PI) / 180));
  const bbox: BBox = {
    minLat: centerLat - latDelta,
    maxLat: centerLat + latDelta,
    minLng: centerLng - lngDelta,
    maxLng: centerLng + lngDelta,
  };

  // ViewBox with correct aspect ratio (longest side = 100)
  const bboxWidthMeters =
    (bbox.maxLng - bbox.minLng) * 111320 * Math.cos((centerLat * Math.PI) / 180);
  const bboxHeightMeters = (bbox.maxLat - bbox.minLat) * 111320;
  const longest = Math.max(bboxWidthMeters, bboxHeightMeters);
  const viewBoxW = +((bboxWidthMeters / longest) * 100).toFixed(2);
  const viewBoxH = +((bboxHeightMeters / longest) * 100).toFixed(2);

  // Projection: geo coords → viewBox coords
  function project(lat: number, lon: number): Point {
    const x = ((lon - bbox.minLng) / (bbox.maxLng - bbox.minLng)) * viewBoxW;
    const y = ((bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat)) * viewBoxH; // Y inverted
    return { x: Math.max(0, Math.min(viewBoxW, x)), y: Math.max(0, Math.min(viewBoxH, y)) };
  }

  // Resolve way nodes to projected coordinates
  function resolveWay(way: OverpassElement): Point[] | null {
    if (!way.nodes || way.nodes.length < 2) return null;
    const points: Point[] = [];
    for (const nid of way.nodes) {
      const node = nodes.get(nid);
      if (!node) return null;
      points.push(project(node.lat, node.lon));
    }
    return points;
  }

  // Street width based on highway classification
  function streetWidth(highway: string): number {
    switch (highway) {
      case "motorway":
      case "trunk":
        return 10;
      case "primary":
        return 7;
      case "secondary":
        return 6;
      case "tertiary":
        return 5;
      case "residential":
      case "unclassified":
        return 4.5;
      case "service":
        return 3;
      case "footway":
      case "path":
      case "cycleway":
      case "pedestrian":
        return 1.5;
      default:
        return 4;
    }
  }

  const buildingFeatures: Feature[] = [];
  const streetFeatures: Feature[] = [];
  const vegFeatures: Feature[] = [];
  const waterFeatures: Feature[] = [];
  let featureId = 1;

  // Process ways
  for (const el of elements) {
    if (el.type !== "way" || !el.tags) continue;

    const points = resolveWay(el);
    if (!points) continue;

    // Buildings
    if (el.tags.building) {
      // Close polygon if needed
      const first = points[0];
      const last = points[points.length - 1];
      const closed =
        Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01
          ? points.slice(0, -1)
          : points;

      if (closed.length < 3) continue;

      const label =
        el.tags["addr:housenumber"] ||
        el.tags.name ||
        undefined;

      buildingFeatures.push({
        id: featureId++,
        type: "building",
        points: closed,
        label,
        cornerRadius: 0,
      });
      continue;
    }

    // Roads
    if (el.tags.highway) {
      // Skip very minor paths at this stage
      const hw = el.tags.highway;
      if (hw === "steps" || hw === "corridor") continue;

      const w = streetWidth(hw);
      const centerline = points;
      const polyPoints = centerlineToPolygon(centerline, w);

      streetFeatures.push({
        id: featureId++,
        type: "street",
        points: polyPoints,
        centerline,
        width: w,
        label: el.tags.name || undefined,
        cornerRadius: 1,
      });
      continue;
    }

    // Vegetation
    if (
      el.tags.leisure === "park" ||
      el.tags.landuse === "grass" ||
      el.tags.natural === "wood"
    ) {
      const closed = points.length > 2 ? points.slice(0, -1) : points;
      if (closed.length < 3) continue;
      vegFeatures.push({
        id: featureId++,
        type: "vegetation",
        points: closed,
        label: el.tags.name || undefined,
      });
      continue;
    }

    // Water
    if (el.tags.natural === "water" || el.tags.waterway) {
      const closed = points.length > 2 ? points.slice(0, -1) : points;
      if (closed.length < 3) continue;
      waterFeatures.push({
        id: featureId++,
        type: "water",
        points: closed,
        label: el.tags.name || undefined,
      });
      continue;
    }
  }

  // Compute parcels from detected streets + buildings
  const streetData = streetFeatures
    .filter((f) => f.centerline && f.centerline.length >= 2)
    .map((f) => ({ centerline: f.centerline!, width: f.width || 5 }));

  const parcelFeatures = computeParcels(
    streetData,
    buildingFeatures,
    viewBoxW,
    viewBoxH
  );

  // Combine: parcels → vegetation → water → streets → buildings
  const allFeatures: Feature[] = [
    ...parcelFeatures,
    ...vegFeatures,
    ...waterFeatures,
    ...streetFeatures,
    ...buildingFeatures,
  ].map((f, idx) => ({ ...f, id: idx + 1 }));

  const buildings = buildingFeatures.map((f, idx) => ({
    id: idx + 1,
    points: f.points,
  }));

  console.log(
    `OSM conversion: ${buildingFeatures.length} buildings, ${streetFeatures.length} streets, ${vegFeatures.length} vegetation, ${waterFeatures.length} water, ${parcelFeatures.length} parcels`
  );

  return {
    features: allFeatures,
    buildings,
    viewBox: { width: viewBoxW, height: viewBoxH },
    location: `${centerLat.toFixed(5)}, ${centerLng.toFixed(5)}`,
  };
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function fetchOsmSitePlan(
  lat: number,
  lng: number,
  radiusMeters: number = 200
): Promise<OverpassResult> {
  const elements = await queryOverpass(lat, lng, radiusMeters);

  console.log(`Overpass returned ${elements.length} elements`);

  const result = osmToFeatures(elements, lat, lng, radiusMeters);
  return result;
}
