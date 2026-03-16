import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  traceImage,
  detectPreset,
  imageToBuffer,
  analyzeColors,
  findBuildingRegions,
  TracedFeature,
  DetectedRegion,
} from "@/lib/image-tracer";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
}

interface Feature {
  id: number;
  type:
    | "building"
    | "parcel"
    | "street"
    | "sidewalk"
    | "vegetation"
    | "water"
    | "parking";
  label?: string;
  points: Point[];
  cornerRadius?: number;
  centerline?: Point[];
  width?: number;
  svgPath?: string;
}

interface StreetData {
  label: string;
  centerline: Point[];
  width: number;
}

interface SitePlanData {
  features: Feature[];
  buildings: { id: number; points: Point[] }[];
  tracingUsed: boolean;
}

interface ColorInfo {
  color: string;
  hsl: string;
  percentage: number;
  likelyType: string;
}

interface TracingContext {
  traced: TracedFeature[];
  preset: string;
  colors: ColorInfo[];
  colorGuide: string;
  tracedHints: string;
  buildingRegions: DetectedRegion[];
}

// ─── Build context strings from color/tracing analysis ───────────────────────

function buildColorGuide(colors: ColorInfo[], preset: string): string {
  const typeDescriptions: Record<string, string> = {
    "street (blue-gray road)":
      "Local roads and streets — these blue-gray colored areas are road surfaces. Trace their centerlines.",
    "highway (dark gray road)":
      "Highways and expressways — darker gray, wider road surfaces. Trace as a single wide centerline.",
    "building (light gray footprint)":
      "Building footprints — these light gray rectangles ARE the buildings. There are MANY of them filling city blocks. Trace EVERY one.",
    "background (land)":
      "Background land — empty lot/parcel space between buildings. NOT a feature itself.",
    "vegetation (green)":
      "Parks, green spaces, median strips — trace these green areas.",
    "water (blue)": "Rivers, ponds, lakes, canals",
    "road marking (yellow center line)":
      "Yellow road center line markings — ignore, they just indicate the road center.",
    "text/label (dark)":
      "Map labels and text — ignore these pixels, but read the street names from them.",
  };

  const relevantColors = colors.filter(
    (c) =>
      c.likelyType !== "unclassified" &&
      !c.likelyType.startsWith("unclassified") &&
      c.percentage > 0.5
  );

  if (relevantColors.length === 0) return "";

  const mapType =
    preset === "googleMaps"
      ? "Google Maps"
      : preset === "satellite"
        ? "satellite/aerial"
        : preset === "osm"
          ? "OpenStreetMap"
          : "map";

  let guide = `\nCOLOR GUIDE — This appears to be a ${mapType} image. Key colors detected:\n`;
  for (const c of relevantColors) {
    const desc = typeDescriptions[c.likelyType] || c.likelyType;
    guide += `  ${c.color} (${c.hsl}): ${desc} — ${c.percentage}% of image\n`;
  }
  guide += `Use these color-to-feature mappings to precisely identify what each area represents.\n`;
  return guide;
}

function buildTracedHints(traced: TracedFeature[]): string {
  if (traced.length === 0) return "";

  let hints =
    "\nTRACED FEATURE HINTS (from pixel-level color analysis of the image):\n";
  hints +=
    "These approximate bounding boxes were detected by analyzing actual pixel colors. Use them as reference.\n";

  for (const t of traced) {
    if (t.points.length < 2) continue;
    const xs = t.points.map((p) => p.x);
    const ys = t.points.map((p) => p.y);
    const minX = Math.min(...xs).toFixed(0);
    const maxX = Math.max(...xs).toFixed(0);
    const minY = Math.min(...ys).toFixed(0);
    const maxY = Math.max(...ys).toFixed(0);
    hints += `  ${t.type}: pixels detected in area (${minX},${minY}) to (${maxX},${maxY})\n`;
  }

  return hints;
}

// ─── Build building region hints for GPT-4o ─────────────────────────────────

function buildBuildingRegionHints(regions: DetectedRegion[]): string {
  if (regions.length === 0) return "";

  const smallRegions: DetectedRegion[] = [];
  const mergedRegions: DetectedRegion[] = [];

  for (const r of regions) {
    const w = r.bounds.maxX - r.bounds.minX;
    const h = r.bounds.maxY - r.bounds.minY;
    if (w > 14 && h > 14) {
      mergedRegions.push(r);
    } else {
      smallRegions.push(r);
    }
  }

  let hints = `\nPIXEL-DETECTED BUILDING DATA:\n`;

  if (smallRegions.length > 0) {
    hints += `\n${smallRegions.length} INDIVIDUAL BUILDINGS detected (accurate pixel positions):\n`;
    for (let i = 0; i < smallRegions.length; i++) {
      const r = smallRegions[i];
      const w = (r.bounds.maxX - r.bounds.minX).toFixed(0);
      const h = (r.bounds.maxY - r.bounds.minY).toFixed(0);
      hints += `  Bldg ${i + 1}: center=(${r.center.x.toFixed(0)},${r.center.y.toFixed(0)}) size=${w}x${h} bounds=(${r.bounds.minX.toFixed(0)},${r.bounds.minY.toFixed(0)})-(${r.bounds.maxX.toFixed(0)},${r.bounds.maxY.toFixed(0)})\n`;
    }
  }

  if (mergedRegions.length > 0) {
    hints += `\n${mergedRegions.length} DENSE BUILDING AREAS detected (multiple buildings packed tightly):\n`;
    hints += `These areas contain MULTIPLE individual buildings. You MUST identify each building separately.\n`;
    for (let i = 0; i < mergedRegions.length; i++) {
      const r = mergedRegions[i];
      const w = (r.bounds.maxX - r.bounds.minX).toFixed(0);
      const h = (r.bounds.maxY - r.bounds.minY).toFixed(0);
      hints += `  Dense area ${i + 1}: bounds=(${r.bounds.minX.toFixed(0)},${r.bounds.minY.toFixed(0)})-(${r.bounds.maxX.toFixed(0)},${r.bounds.maxY.toFixed(0)}) size=${w}x${h}\n`;
      hints += `    → Subdivide this into individual buildings! Each building is typically ${w}x4-8 units.\n`;
    }
  }

  hints += `\nIMPORTANT: For buildings in dense areas, use consistent widths matching the block width.\n`;
  hints += `Buildings in the same block should have the SAME left and right x-coordinates.\n`;
  return hints;
}

// ─── Single-pass site plan extraction ────────────────────────────────────────
// One focused GPT-4o call with chain-of-thought: describe layout → extract all.

async function extractSitePlan(
  openai: OpenAI,
  imageContent: OpenAI.Chat.Completions.ChatCompletionContentPartImage,
  tracingCtx: TracingContext | null,
  maxTokens: number = 16384
): Promise<{ streets: StreetData[]; features: Feature[] }> {
  const colorSection = tracingCtx?.colorGuide || "";
  const buildingRegionSection = tracingCtx?.buildingRegions
    ? buildBuildingRegionHints(tracingCtx.buildingRegions)
    : "";

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: maxTokens,
    messages: [
      {
        role: "system",
        content: `You are a precise map analyst converting Google Maps screenshots into vector site plans.

PROCESS — follow these steps to produce accurate coordinates:

STEP 1 — LAYOUT ANALYSIS (write in the "layout" field):
Describe PRECISELY:
- How many streets? Name each one and its direction (vertical/horizontal/diagonal)
- Where does each street sit in the image? Give x or y coordinate
- How many city blocks are formed? Which streets bound each block?
- How many buildings in each block? List address numbers per block
- What is the y-coordinate of each horizontal street? What is the x-coordinate of each vertical street?

STEP 2 — ANCHOR POINTS:
Identify where streets ENTER/EXIT the image edges and where streets INTERSECT.
These intersection points are your coordinate anchors — everything else is placed relative to them.
A street at x=35 means its center is at 35% from the left edge.

STEP 3 — MEASURE EACH BLOCK:
For each city block between streets, determine:
- The left edge x, right edge x (bounded by vertical streets)
- The top edge y (just after the street above or image top)
- How many buildings fit in the block, each with address label
- Each building's top-y and bottom-y (stack them vertically with ~1 unit gap)

STEP 4 — EXTRACT ALL FEATURES using your measurements.
${colorSection}${buildingRegionSection}
COORDINATE SYSTEM (CRITICAL):
- (0,0) = top-left corner, (100,100) = bottom-right corner
- x increases LEFT→RIGHT, y increases TOP→BOTTOM
- Measure street positions as % from left/top edge

STREET RULES:
- "centerline": {x,y} points along road CENTER (not edges)
- "width": local road 4-6, collector 6-8, highway/avenue 8-12
- Vertical streets: x stays CONSTANT across all centerline points, y varies 0→100
- Horizontal streets: y stays CONSTANT across all centerline points, x varies 0→100
- Diagonal streets: both x and y change proportionally
- Include 3-5 points per street
- Streets at image edges: start/end at x=0, x=100, y=0, or y=100

BUILDING RULES (CRITICAL FOR ACCURACY):
- "points": 4 {x,y} vertices going CLOCKWISE (top-left, top-right, bottom-right, bottom-left)
- Buildings are GRAY RECTANGLES on the map
- Use VISIBLE address numbers or business names as "label"
- ALIGNMENT: All buildings in the same block must share the SAME left-x and right-x
  Example: If a block spans x=10 to x=30, ALL buildings in that block use x=10 and x=30
- STACKING: Buildings in a block stack vertically with ~1-2 unit gaps
  Building 1: y=2 to y=8, Building 2: y=9 to y=15, Building 3: y=16 to y=22, etc.
- Each building height (y-span) is typically 4-8 units
- Address numbers increase going SOUTH (larger y)
- Buildings sit BETWEEN streets, never overlapping them
- Include ALL buildings — Google Maps screenshots typically have 10-25 buildings

VEGETATION: Green areas visible on map. Use cornerRadius 3.
PARKING: Gray paved areas. Use cornerRadius 1.

RESPONSE — valid JSON only, NO markdown fences:
{
  "layout": "Detailed spatial layout description...",
  "streets": [
    {"label":"Street Name","centerline":[{"x":35,"y":0},{"x":35,"y":100}],"width":5}
  ],
  "features": [
    {"type":"building","label":"2825","points":[{"x":10,"y":2},{"x":30,"y":2},{"x":30,"y":8},{"x":10,"y":8}],"cornerRadius":0},
    {"type":"vegetation","label":"Park","points":[{"x":90,"y":0},{"x":100,"y":0},{"x":100,"y":100},{"x":90,"y":100}],"cornerRadius":3}
  ]
}`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract the COMPLETE site plan from this Google Maps screenshot.

CRITICAL CHECKLIST:
□ Every visible STREET with name label and PRECISE x or y coordinate
□ Every BUILDING gray rectangle — count them carefully, each has an address number
□ Every VEGETATION area (green strips, parks)
□ Any water, parking, or other features

ACCURACY TIPS:
- Look at the image CAREFULLY and count the exact number of buildings in each block
- Measure street positions precisely: a street at 1/3 from the left = x≈33
- Buildings in the same block MUST have identical left-x and right-x coordinates
- Stack buildings vertically within each block, each ~5-7 units tall with 1 unit gap
- Use the actual visible address numbers as labels (e.g., "2825", "2827")
- If a highlighted/cream-colored area is visible, it's a selected lot — note it as a building or parcel

Be THOROUGH and PRECISE — every building matters.`,
          },
          imageContent,
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No response from Vision API");

  const cleaned = content
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
  const parsed = JSON.parse(cleaned);

  if (parsed.layout) {
    console.log("GPT-4o layout analysis:", parsed.layout);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const streets: StreetData[] = (parsed.streets || []).map((s: any) => ({
    label: s.label || "Street",
    width: Math.max(1, Math.min(15, s.width || 5)),
    centerline: (s.centerline || []).map((p: Point) => ({
      x: clamp(p.x),
      y: clamp(p.y),
    })),
  }));

  const features: Feature[] = (parsed.features || []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (f: any, idx: number) => ({
      id: idx + 1,
      type: f.type || "building",
      label: f.label,
      cornerRadius: f.cornerRadius ?? 0,
      points: (f.points || []).map((p: Point) => ({
        x: clamp(p.x),
        y: clamp(p.y),
      })),
    })
  );

  return { streets, features };
}

// ─── Image tracing integration ───────────────────────────────────────────────

async function runImageTracing(
  imageData: string
): Promise<TracingContext | null> {
  try {
    const buffer = await imageToBuffer(imageData);
    if (!buffer) return null;

    // Analyze colors
    const colors = await analyzeColors(buffer);
    console.log("Image color analysis:");
    for (const c of colors) {
      console.log(
        `  ${c.color} ${c.hsl} → ${c.likelyType} (${c.percentage}%)`
      );
    }

    // Detect preset and trace
    const preset = await detectPreset(buffer);
    console.log(`Image tracing: detected preset "${preset}"`);

    const traced = await traceImage(buffer, preset);
    console.log(`Image tracing: found ${traced.length} feature layers`);

    // Detect individual building regions via connected components
    const buildingRegions = await findBuildingRegions(buffer);
    console.log(
      `Image tracing: found ${buildingRegions.length} individual building regions`
    );

    // Build context strings for GPT-4o
    const colorGuide = buildColorGuide(colors, preset);
    const tracedHints = buildTracedHints(traced);

    return { traced, preset, colors, colorGuide, tracedHints, buildingRegions };
  } catch (e) {
    console.warn("Image tracing failed, falling back to GPT-4o only:", e);
    return null;
  }
}

// ─── Traced geometry integration ─────────────────────────────────────────────
// Potrace traces binary masks → one compound SVG path per feature type.
// This works well for area fills (vegetation, water) but NOT for buildings
// (which need individual polygons). So:
//   - Buildings: always use GPT-4o polygons (individual, labeled)
//   - Vegetation/water: optionally add traced path as background layer
//   - Streets: always use GPT-4o centerlines (traced roads are blobs)

function addTracedBackgroundLayers(
  gptFeatures: Feature[],
  traced: TracedFeature[]
): Feature[] {
  if (traced.length === 0) return gptFeatures;

  const result = [...gptFeatures];

  for (const t of traced) {
    if (!t.svgPath || t.points.length < 2) continue;

    // Skip buildings and streets — Potrace compound paths merge ALL pixels
    // of a type into one giant blob, which looks terrible for individual features.
    // Only area fills (vegetation, water) work well as compound paths.
    if (t.type === "building" || t.type === "street") continue;

    result.push({
      id: result.length + 1,
      type: t.type,
      points: t.points,
      svgPath: t.svgPath,
      cornerRadius: t.type === "vegetation" || t.type === "water" ? 3 : 0,
    });
  }

  return result;
}

// ─── Merge pixel-detected regions with GPT-4o labeled buildings ──────────────
// Pixel analysis provides accurate geometry; GPT-4o provides labels/names.
// Strategy: use pixel regions as ground truth for positions, match GPT labels.

function mergePixelAndGptBuildings(
  features: Feature[],
  regions: DetectedRegion[]
): Feature[] {
  if (regions.length === 0) return features;

  const gptBuildings = features.filter((f) => f.type === "building");
  const nonBuildings = features.filter((f) => f.type !== "building");
  const mergedBuildings: Feature[] = [];
  const usedGptIndices = new Set<number>();

  // Track small pixel regions that are used (individual buildings)
  const usedPixelRegions: DetectedRegion[] = [];

  // For each pixel region, find the closest GPT-4o building for its label
  for (const region of regions) {
    const { minX, minY, maxX, maxY } = region.bounds;
    const regionW = maxX - minX;
    const regionH = maxY - minY;

    // Skip large merged regions (likely multiple buildings fused together)
    // Individual buildings are typically < 14 units in at least one dimension
    if (regionW > 14 && regionH > 14) continue;

    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = 0; i < gptBuildings.length; i++) {
      if (usedGptIndices.has(i)) continue;
      const b = gptBuildings[i];
      if (b.points.length === 0) continue;
      const bCx =
        b.points.reduce((s, p) => s + p.x, 0) / b.points.length;
      const bCy =
        b.points.reduce((s, p) => s + p.y, 0) / b.points.length;
      const dist = Math.sqrt(
        (bCx - region.center.x) ** 2 + (bCy - region.center.y) ** 2
      );
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    // Use pixel region geometry with GPT-4o label (if within 18 units)
    let label: string | undefined;
    if (bestIdx >= 0 && bestDist < 18) {
      label = gptBuildings[bestIdx].label;
      usedGptIndices.add(bestIdx);
    }

    // Shrink pixel bounds inward by 1 unit to compensate for color bleeding
    const inset = 1.0;
    const adjMinX = Math.min(minX + inset, (minX + maxX) / 2);
    const adjMinY = Math.min(minY + inset, (minY + maxY) / 2);
    const adjMaxX = Math.max(maxX - inset, (minX + maxX) / 2);
    let adjMaxY = Math.max(maxY - inset, (minY + maxY) / 2);

    // Cap pixel building height to 10 units max (taller = likely merged)
    if (adjMaxY - adjMinY > 10) {
      adjMaxY = adjMinY + 10;
    }

    usedPixelRegions.push(region);
    mergedBuildings.push({
      id: 0,
      type: "building",
      label,
      points: [
        { x: adjMinX, y: adjMinY },
        { x: adjMaxX, y: adjMinY },
        { x: adjMaxX, y: adjMaxY },
        { x: adjMinX, y: adjMaxY },
      ],
      cornerRadius: 0,
    });
  }

  // Keep unmatched GPT buildings that don't overlap any USED pixel region
  // (may be real buildings pixel analysis missed, or in areas with merged regions)
  for (let i = 0; i < gptBuildings.length; i++) {
    if (usedGptIndices.has(i)) continue;
    const b = gptBuildings[i];
    if (b.points.length === 0) continue;
    const bCx =
      b.points.reduce((s, p) => s + p.x, 0) / b.points.length;
    const bCy =
      b.points.reduce((s, p) => s + p.y, 0) / b.points.length;
    const tooClose = usedPixelRegions.some(
      (r) =>
        Math.abs(bCx - r.center.x) < 8 &&
        Math.abs(bCy - r.center.y) < 8
    );
    if (!tooClose) {
      mergedBuildings.push({ ...b, id: 0 });
    }
  }

  console.log(
    `Merged buildings: ${usedPixelRegions.length} pixel regions (${regions.length - usedPixelRegions.length} skipped as merged) + ${gptBuildings.length - usedGptIndices.size} unmatched GPT buildings (${usedGptIndices.size} labels matched)`
  );

  // Post-process: align buildings in the same column to consistent widths
  const alignedBuildings = alignBlockBuildings(mergedBuildings);

  return [...nonBuildings, ...alignedBuildings].map((f, idx) => ({
    ...f,
    id: idx + 1,
  }));
}

// ─── Post-process: align buildings in same block to consistent widths ────────
// Buildings in the same city block should share the same left/right x-coords.

function alignBlockBuildings(buildings: Feature[]): Feature[] {
  if (buildings.length < 3) return buildings;

  // Group buildings by approximate x-center (within 8 units = same column)
  const columns: Feature[][] = [];
  for (const b of buildings) {
    if (b.points.length < 4) {
      columns.push([b]);
      continue;
    }
    const cx =
      b.points.reduce((s, p) => s + p.x, 0) / b.points.length;
    const found = columns.find((col) => {
      const colCx =
        col[0].points.reduce((s, p) => s + p.x, 0) / col[0].points.length;
      return Math.abs(cx - colCx) < 8;
    });
    if (found) {
      found.push(b);
    } else {
      columns.push([b]);
    }
  }

  const result: Feature[] = [];
  for (const col of columns) {
    if (col.length < 2) {
      result.push(...col);
      continue;
    }

    // Find the most common width in this column
    const widths = col
      .filter((b) => b.points.length >= 4)
      .map((b) => {
        const xs = b.points.map((p) => p.x);
        return Math.max(...xs) - Math.min(...xs);
      });
    if (widths.length === 0) {
      result.push(...col);
      continue;
    }

    // Use median width and median left-x for alignment
    widths.sort((a, b) => a - b);
    const medianWidth = widths[Math.floor(widths.length / 2)];
    const leftXs = col
      .filter((b) => b.points.length >= 4)
      .map((b) => Math.min(...b.points.map((p) => p.x)));
    leftXs.sort((a, b) => a - b);
    const medianLeftX = leftXs[Math.floor(leftXs.length / 2)];
    const alignedRightX = medianLeftX + medianWidth;

    // Align all buildings in this column
    for (const b of col) {
      if (b.points.length < 4) {
        result.push(b);
        continue;
      }
      const ys = b.points.map((p) => p.y);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      result.push({
        ...b,
        points: [
          { x: medianLeftX, y: minY },
          { x: alignedRightX, y: minY },
          { x: alignedRightX, y: maxY },
          { x: medianLeftX, y: maxY },
        ],
      });
    }
  }

  return result;
}

// ─── Main analysis pipeline ──────────────────────────────────────────────────

async function analyzeSiteImage(imageData: string, detailLevel: number = 2): Promise<SitePlanData> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in environment variables");
  }

  const openai = new OpenAI({ apiKey });

  // Detail level controls processing intensity
  const gptMaxTokens = detailLevel === 1 ? 8192 : detailLevel === 3 ? 24576 : 16384;
  const imageDetail = detailLevel === 1 ? "low" : "high";
  const skipPixelTracing = detailLevel === 1;
  const minBuildingWidth = detailLevel === 3 ? 2 : 3;
  const minBuildingHeight = detailLevel === 3 ? 1.5 : 2;
  const minUnlabeledArea = detailLevel === 3 ? 10 : 20;

  const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPartImage = {
    type: "image_url",
    image_url: { url: imageData, detail: imageDetail as "low" | "high" },
  };

  // Step 1: Analyze image colors for context (+ trace vegetation/water)
  console.log(`Step 1: Analyzing image colors... (detail level: ${detailLevel})`);
  const tracingCtx = skipPixelTracing ? null : await runImageTracing(imageData);

  // Step 2: Single GPT-4o pass — extract streets + all features together
  // This produces more consistent coordinates than multi-pass approaches
  console.log("Step 2: Extracting site plan (single pass)...");
  const { streets, features: otherFeatures } = await extractSitePlan(
    openai,
    imageContent,
    tracingCtx,
    gptMaxTokens
  );
  console.log(
    `Step 2 complete: ${streets.length} streets, ${otherFeatures.length} features`
  );

  // Convert streets to Feature objects
  const streetFeatures: Feature[] = streets.map((s, idx) => {
    const polyPoints = centerlineToPolygon(s.centerline, s.width);
    return {
      id: idx + 1,
      type: "street" as const,
      label: s.label,
      points: polyPoints,
      centerline: s.centerline,
      width: s.width,
      cornerRadius: 1,
    };
  });

  let allFeatures: Feature[] = [...streetFeatures, ...otherFeatures].map(
    (f, idx) => ({ ...f, id: idx + 1 })
  );

  // Step 3: Add traced vegetation/water background layers
  let tracingUsed = false;
  if (tracingCtx && tracingCtx.traced.length > 0) {
    allFeatures = addTracedBackgroundLayers(allFeatures, tracingCtx.traced).map(
      (f, idx) => ({ ...f, id: idx + 1 })
    );
    tracingUsed = true;
  }

  // Step 4: Merge pixel-detected buildings with GPT-4o labeled buildings
  // Always prefer pixel geometry (accurate) with GPT-4o labels (semantic)
  if (tracingCtx && tracingCtx.buildingRegions.length > 0) {
    allFeatures = mergePixelAndGptBuildings(
      allFeatures,
      tracingCtx.buildingRegions
    );
    tracingUsed = true;
  }

  // Step 5: Remove unreasonably small buildings (noise or rendering artifacts)
  // Thresholds vary by detail level — level 3 keeps smaller features
  allFeatures = allFeatures.filter((f) => {
    if (f.type !== "building") return true;
    if (f.points.length < 4) return false;
    const xs = f.points.map((p) => p.x);
    const ys = f.points.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    if (w < minBuildingWidth || h < minBuildingHeight) return false;
    if (!f.label && w * h < minUnlabeledArea) return false;
    return true;
  });

  // Extract buildings for backward compatibility
  const buildings = allFeatures
    .filter((f) => f.type === "building")
    .map((f, idx) => ({ id: idx + 1, points: f.points }));

  console.log(
    `Done: ${allFeatures.length} features, ${buildings.length} buildings`
  );

  return { features: allFeatures, buildings, tracingUsed };
}

// ─── Centerline → Polygon conversion ────────────────────────────────────────

function centerlineToPolygon(centerline: Point[], width: number): Point[] {
  if (centerline.length < 2) return centerline;

  const halfWidth = width / 2;
  const left: Point[] = [];
  const right: Point[] = [];

  for (let i = 0; i < centerline.length; i++) {
    const curr = centerline[i];

    let dx: number, dy: number;
    if (i === 0) {
      dx = centerline[1].x - curr.x;
      dy = centerline[1].y - curr.y;
    } else if (i === centerline.length - 1) {
      dx = curr.x - centerline[i - 1].x;
      dy = curr.y - centerline[i - 1].y;
    } else {
      dx = centerline[i + 1].x - centerline[i - 1].x;
      dy = centerline[i + 1].y - centerline[i - 1].y;
    }

    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) continue;

    const px = (-dy / len) * halfWidth;
    const py = (dx / len) * halfWidth;

    left.push({ x: clamp(curr.x + px), y: clamp(curr.y + py) });
    right.push({ x: clamp(curr.x - px), y: clamp(curr.y - py) });
  }

  return [...left, ...right.reverse()];
}

// ─── SVG Rendering — Google Maps palette ─────────────────────────────────────

function featuresToSvg(features: Feature[]): string {
  const viewBox = "0 0 100 100";

  // Google Maps actual color palette (calibrated from real screenshots)
  const styles: Record<
    string,
    { fill: string; stroke: string; strokeWidth: number; opacity: number }
  > = {
    parcel: {
      fill: "#f0f0ee", // very light warm gray (Google Maps land background)
      stroke: "#e0ddd8",
      strokeWidth: 0.15,
      opacity: 0.7,
    },
    street: {
      fill: "#a0aab5", // blue-gray (Google Maps road surface)
      stroke: "#8e99a4",
      strokeWidth: 0.15,
      opacity: 0.9,
    },
    sidewalk: {
      fill: "#d8dce0",
      stroke: "#c8ccd0",
      strokeWidth: 0.1,
      opacity: 0.6,
    },
    building: {
      fill: "#c8c8d0", // visible gray with slight blue tint (clearer than #dcdcdc)
      stroke: "#9898a4",
      strokeWidth: 0.4,
      opacity: 0.95,
    },
    vegetation: {
      fill: "#c3e6c3", // soft green (Google Maps parks/medians)
      stroke: "#a5d6a5",
      strokeWidth: 0.2,
      opacity: 0.75,
    },
    water: {
      fill: "#aadaff", // light blue (Google Maps water)
      stroke: "#7dc4f0",
      strokeWidth: 0.2,
      opacity: 0.85,
    },
    parking: {
      fill: "#e8e8e8",
      stroke: "#d0d0d0",
      strokeWidth: 0.2,
      opacity: 0.7,
    },
  };

  // Street centerline rendering colors
  const streetColors = {
    local: { fill: "#a0aab5", border: "#8e99a4" }, // blue-gray roads
    highway: { fill: "#8a8e98", border: "#707580" }, // darker gray highways
  };

  // Render order: background → land → streets → features → buildings (top)
  const renderOrder = [
    "vegetation",
    "water",
    "parcel",
    "parking",
    "sidewalk",
    "street",
    "building",
  ];
  const sorted = [...features].sort(
    (a, b) => renderOrder.indexOf(a.type) - renderOrder.indexOf(b.type)
  );

  const featureSvgs: string[] = [];
  const labelSvgs: string[] = [];

  for (const feature of sorted) {
    const style = styles[feature.type] || styles.building;

    // ── Streets with centerline: render as stroked path ──
    if (
      feature.type === "street" &&
      feature.centerline &&
      feature.centerline.length >= 2
    ) {
      const pathD = feature.centerline
        .map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
        .join(" ");

      // Determine if this is a highway (wide + typically has highway-like label)
      const isHighway =
        (feature.width || 0) >= 8 ||
        /highway|expressway|interstate|i-\d|ramp|hwy/i.test(
          feature.label || ""
        );
      const colors = isHighway ? streetColors.highway : streetColors.local;

      // Outer border (shadow)
      featureSvgs.push(
        `<path d="${pathD}" fill="none" stroke="${colors.border}" stroke-width="${(feature.width || 5) + 0.6}" stroke-linecap="round" stroke-linejoin="round" opacity="0.4"/>`
      );
      // Main road surface
      featureSvgs.push(
        `<path d="${pathD}" fill="none" stroke="${colors.fill}" stroke-width="${feature.width || 5}" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`
      );

      // Yellow center line dashes for local roads (like Google Maps)
      if ((feature.width || 0) >= 4 && !isHighway) {
        featureSvgs.push(
          `<path d="${pathD}" fill="none" stroke="#e8c840" stroke-width="0.2" stroke-linecap="round" stroke-dasharray="1.2,0.8" opacity="0.5"/>`
        );
      }
      // White lane dashes for highways
      if (isHighway && (feature.width || 0) >= 6) {
        featureSvgs.push(
          `<path d="${pathD}" fill="none" stroke="#ffffff" stroke-width="0.2" stroke-linecap="round" stroke-dasharray="1.5,1" opacity="0.5"/>`
        );
      }

      // Street label
      if (feature.label) {
        const midIdx = Math.floor(feature.centerline.length / 2);
        const mid = feature.centerline[midIdx];
        const prev = feature.centerline[Math.max(0, midIdx - 1)];
        const next = feature.centerline[
          Math.min(feature.centerline.length - 1, midIdx + 1)
        ];
        const angle =
          (Math.atan2(next.y - prev.y, next.x - prev.x) * 180) / Math.PI;
        const adjustedAngle =
          angle > 90 || angle < -90 ? angle + 180 : angle;

        const labelColor = isHighway ? "#3d7a6e" : "#5b5b5b";
        const fontSize = isHighway ? "1.4" : "1.5";

        labelSvgs.push(
          `<text x="${mid.x}" y="${mid.y}" font-size="${fontSize}" fill="${labelColor}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-style="italic" transform="rotate(${adjustedAngle},${mid.x},${mid.y})">${escapeXml(feature.label)}</text>`
        );
      }
      continue;
    }

    // ── Features with traced SVG path ──
    if (feature.svgPath) {
      const scale = 100 / 1000;
      featureSvgs.push(
        `<g transform="scale(${scale})"><path d="${feature.svgPath}" fill="${style.fill}" fill-opacity="${style.opacity}" stroke="${style.stroke}" stroke-width="${style.strokeWidth / scale}"/></g>`
      );

      // Still add label if present
      if (feature.label && feature.type === "building" && feature.points.length > 0) {
        const cx =
          feature.points.reduce((s, p) => s + p.x, 0) / feature.points.length;
        const cy =
          feature.points.reduce((s, p) => s + p.y, 0) / feature.points.length;
        labelSvgs.push(
          `<text x="${cx}" y="${cy}" font-size="1.6" fill="#5b5b5b" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-weight="500">${escapeXml(feature.label)}</text>`
        );
      }
      continue;
    }

    // ── Standard polygon rendering ──
    if (feature.points.length < 3) continue;

    const pathD = roundedPolygonPath(
      feature.points,
      feature.cornerRadius || 0
    );
    featureSvgs.push(
      `<path d="${pathD}" fill="${style.fill}" fill-opacity="${style.opacity}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}"/>`
    );

    // Labels
    if (feature.label) {
      const cx =
        feature.points.reduce((s, p) => s + p.x, 0) / feature.points.length;
      const cy =
        feature.points.reduce((s, p) => s + p.y, 0) / feature.points.length;

      if (feature.type === "building") {
        labelSvgs.push(
          `<text x="${cx}" y="${cy}" font-size="1.6" fill="#5b5b5b" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-weight="500">${escapeXml(feature.label)}</text>`
        );
      } else if (feature.type === "vegetation") {
        labelSvgs.push(
          `<text x="${cx}" y="${cy}" font-size="1.4" fill="#4a8c4a" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-style="italic">${escapeXml(feature.label)}</text>`
        );
      } else if (feature.type === "water") {
        labelSvgs.push(
          `<text x="${cx}" y="${cy}" font-size="1.4" fill="#4a7ab8" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-style="italic">${escapeXml(feature.label)}</text>`
        );
      }
    }
  }

  // Background matches Google Maps land color
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" style="background-color: #f0f0ee; width: 100%; height: 100%;">
  <defs>
    <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
      <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#e5e5e2" stroke-width="0.08"/>
    </pattern>
  </defs>
  <rect width="100" height="100" fill="url(#grid)"/>

  <!-- Features -->
  ${featureSvgs.join("\n  ")}

  <!-- Labels -->
  ${labelSvgs.join("\n  ")}

  <!-- Watermark -->
  <text x="2" y="99" font-size="1.4" fill="#b0ada8" font-family="Arial, sans-serif">Generated by HYLO-SP</text>
</svg>`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function roundedPolygonPath(points: Point[], radius: number): string {
  if (radius <= 0 || points.length < 3) {
    return (
      points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ") +
      " Z"
    );
  }

  const r = Math.min(radius, 2);
  let d = "";
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    const dx1 = prev.x - curr.x;
    const dy1 = prev.y - curr.y;
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    if (len1 === 0 || len2 === 0) continue;

    const clampedR = Math.min(r, len1 / 3, len2 / 3);

    const startX = curr.x + (dx1 / len1) * clampedR;
    const startY = curr.y + (dy1 / len1) * clampedR;
    const endX = curr.x + (dx2 / len2) * clampedR;
    const endY = curr.y + (dy2 / len2) * clampedR;

    if (i === 0) {
      d += `M${startX},${startY} `;
    } else {
      d += `L${startX},${startY} `;
    }
    d += `Q${curr.x},${curr.y} ${endX},${endY} `;
  }
  d += "Z";
  return d;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

// ─── API Route Handler ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image, detailLevel: rawDetailLevel } = body;
    const detailLevel = Math.max(1, Math.min(3, Number(rawDetailLevel) || 2));

    if (!image) {
      return NextResponse.json(
        { error: "Image is required" },
        { status: 400 }
      );
    }

    const isValidFormat =
      image.startsWith("data:image/") ||
      image.startsWith("http://") ||
      image.startsWith("https://");

    if (!isValidFormat) {
      return NextResponse.json(
        { error: "Invalid image format. Must be base64 or URL" },
        { status: 400 }
      );
    }

    const { features, buildings, tracingUsed } =
      await analyzeSiteImage(image, detailLevel);

    const svg = featuresToSvg(features);

    const featureCounts = features.reduce(
      (acc, f) => {
        acc[f.type] = (acc[f.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const summary = Object.entries(featureCounts)
      .map(([type, count]) => `${count} ${type}(s)`)
      .join(", ");

    const tracingNote = tracingUsed ? " (with image tracing)" : "";
    const message =
      features.length > 0
        ? `Site plan generated${tracingNote}: ${summary}`
        : "No features detected. Try uploading a satellite or aerial image for best results.";

    return NextResponse.json({
      svg,
      buildings,
      features,
      message,
      tracingUsed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error processing image:", message, error);
    return NextResponse.json(
      { error: `Failed to process image: ${message}` },
      { status: 500 }
    );
  }
}
