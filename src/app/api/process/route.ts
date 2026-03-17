import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  imageToBuffer,
  analyzeImagePixels,
  DetectedRegion,
  DetectedStreet,
  ImageAnalysisResult,
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

interface SitePlanData {
  features: Feature[];
  buildings: { id: number; points: Point[] }[];
  tracingUsed: boolean;
  viewBox: { width: number; height: number };
}

// ─── Lightweight GPT-4o labeling ─────────────────────────────────────────────
// Instead of asking GPT-4o to extract coordinates (expensive, inaccurate),
// we detect all geometry from pixels and only ask GPT-4o to label things.

async function labelFeatures(
  openai: OpenAI,
  imageContent: OpenAI.Chat.Completions.ChatCompletionContentPartImage,
  analysis: ImageAnalysisResult
): Promise<{ streetLabels: string[]; buildingLabels: Map<number, string> }> {
  // Build a compact description of detected features for GPT-4o
  const streetDesc = analysis.streets
    .map((s, i) => {
      const isVert = Math.abs(s.centerline[0].x - s.centerline[1].x) < 5;
      const pos = isVert
        ? `vertical at x≈${s.centerline[0].x.toFixed(0)}`
        : `horizontal at y≈${s.centerline[0].y.toFixed(0)}`;
      return `Street ${i}: ${pos}, width ${s.width.toFixed(0)}`;
    })
    .join("\n");

  const bldgDesc = analysis.buildings
    .slice(0, 30)
    .map((b, i) => {
      const w = (b.bounds.maxX - b.bounds.minX).toFixed(0);
      const h = (b.bounds.maxY - b.bounds.minY).toFixed(0);
      return `Bldg ${i}: center (${b.center.x.toFixed(0)},${b.center.y.toFixed(0)}) size ${w}x${h}`;
    })
    .join("\n");

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 2048,
    messages: [
      {
        role: "system",
        content: `You label features on a Google Maps screenshot. You will be given a list of streets and buildings detected by pixel analysis with their approximate positions. Look at the image and provide the correct name/address for each.

Respond with valid JSON only, no markdown:
{
  "streets": [{"index": 0, "name": "Street Name"}, ...],
  "buildings": [{"index": 0, "label": "2825"}, ...]
}

Rules:
- For streets: provide the actual street name visible in the image
- For buildings: provide the address number or business name visible
- If you can't identify a feature, omit it from the list
- Match features by their approximate position in the image`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Label these detected features:\n\n${streetDesc}\n\n${bldgDesc}`,
          },
          imageContent,
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  const streetLabels: string[] = new Array(analysis.streets.length).fill("");
  const buildingLabels = new Map<number, string>();

  if (content) {
    try {
      const cleaned = content
        .replace(/```(?:json)?\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();
      const parsed = JSON.parse(cleaned);

      if (parsed.streets) {
        for (const s of parsed.streets) {
          if (typeof s.index === "number" && s.index < streetLabels.length) {
            streetLabels[s.index] = s.name || "";
          }
        }
      }
      if (parsed.buildings) {
        for (const b of parsed.buildings) {
          if (typeof b.index === "number") {
            buildingLabels.set(b.index, b.label || "");
          }
        }
      }
    } catch (e) {
      console.warn("Failed to parse GPT-4o labels:", e);
    }
  }

  console.log(
    `GPT-4o labeling: ${streetLabels.filter((s) => s).length} streets, ${buildingLabels.size} buildings labeled`
  );
  return { streetLabels, buildingLabels };
}

// ─── Main analysis pipeline (pixel-first, GPT-4o for labels only) ───────────

async function analyzeSiteImage(imageData: string, detailLevel: number = 2): Promise<SitePlanData> {
  const buffer = await imageToBuffer(imageData);
  if (!buffer) throw new Error("Could not decode image data");

  // Step 1: Full pixel analysis (buildings + streets + correct aspect ratio)
  console.log(`Step 1: Pixel analysis (detail level: ${detailLevel})...`);
  const analysis = await analyzeImagePixels(buffer);
  console.log(
    `Step 1 done: ${analysis.buildings.length} buildings, ${analysis.streets.length} streets, viewBox ${analysis.viewBox.width}x${analysis.viewBox.height}`
  );

  // Step 2: Convert pixel detections to Feature objects
  const minBuildingWidth = detailLevel === 3 ? 2 : 3;
  const minBuildingHeight = detailLevel === 3 ? 1.5 : 2;
  const minUnlabeledArea = detailLevel === 3 ? 10 : 20;

  // Streets from pixel detection
  const streetFeatures: Feature[] = analysis.streets.map((s, idx) => {
    const polyPoints = centerlineToPolygon(s.centerline, s.width);
    return {
      id: idx + 1,
      type: "street" as const,
      points: polyPoints,
      centerline: s.centerline,
      width: s.width,
      cornerRadius: 1,
    };
  });

  // Buildings from pixel detection (with polygon outlines)
  const buildingFeatures: Feature[] = analysis.buildings
    .filter((r) => {
      const bw = r.bounds.maxX - r.bounds.minX;
      const bh = r.bounds.maxY - r.bounds.minY;
      // Skip extremely large merged regions (likely a whole block, not a building)
      if (bw > 40 && bh > 40) return false;
      if (bw < minBuildingWidth || bh < minBuildingHeight) return false;
      return true;
    })
    .map((r, idx) => ({
      id: idx + 1,
      type: "building" as const,
      points: r.polygon.length >= 3
        ? r.polygon
        : [
            { x: r.bounds.minX, y: r.bounds.minY },
            { x: r.bounds.maxX, y: r.bounds.minY },
            { x: r.bounds.maxX, y: r.bounds.maxY },
            { x: r.bounds.minX, y: r.bounds.maxY },
          ],
      cornerRadius: 0,
    }));

  // Step 3: GPT-4o labeling (lightweight — only at detail level 2+)
  let streetLabels: string[] = [];
  let buildingLabels = new Map<number, string>();

  if (detailLevel >= 2) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      const openai = new OpenAI({ apiKey });
      const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPartImage = {
        type: "image_url",
        image_url: { url: imageData, detail: "low" },
      };
      console.log("Step 3: GPT-4o labeling (lightweight)...");
      const labels = await labelFeatures(openai, imageContent, analysis);
      streetLabels = labels.streetLabels;
      buildingLabels = labels.buildingLabels;
    }
  }

  // Apply labels
  for (let i = 0; i < streetFeatures.length; i++) {
    if (streetLabels[i]) streetFeatures[i].label = streetLabels[i];
  }
  for (const [idx, label] of buildingLabels) {
    if (idx < buildingFeatures.length && label) {
      buildingFeatures[idx].label = label;
    }
  }

  // Filter small unlabeled buildings
  const filteredBuildings = buildingFeatures.filter((f) => {
    const xs = f.points.map((p) => p.x);
    const ys = f.points.map((p) => p.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    if (!f.label && w * h < minUnlabeledArea) return false;
    return true;
  });

  // Step 4: Compute parcels from street grid + building positions
  const parcelFeatures = computeParcels(
    analysis.streets,
    filteredBuildings,
    analysis.viewBox.width,
    analysis.viewBox.height
  );

  // Combine all features: parcels first (background), then streets, then buildings (top)
  let allFeatures: Feature[] = [
    ...parcelFeatures,
    ...streetFeatures,
    ...filteredBuildings,
  ].map((f, idx) => ({ ...f, id: idx + 1 }));

  // Extract buildings for backward compatibility
  const buildings = allFeatures
    .filter((f) => f.type === "building")
    .map((f, idx) => ({ id: idx + 1, points: f.points }));

  console.log(
    `Done: ${allFeatures.length} features (${parcelFeatures.length} parcels), ${buildings.length} buildings`
  );

  return {
    features: allFeatures,
    buildings,
    tracingUsed: true,
    viewBox: analysis.viewBox,
  };
}

// ─── Parcel computation from street grid + buildings ────────────────────────
// Computes city block parcels from the detected street grid, then subdivides
// each block into individual lot parcels based on building positions.

function computeParcels(
  streets: { centerline: Point[]; width: number }[],
  buildings: Feature[],
  viewBoxW: number,
  viewBoxH: number
): Feature[] {
  // Separate vertical and horizontal streets
  const verticals: { x: number; w: number }[] = [];
  const horizontals: { y: number; w: number }[] = [];

  for (const s of streets) {
    if (s.centerline.length < 2) continue;
    const dx = Math.abs(s.centerline[0].x - s.centerline[1].x);
    const dy = Math.abs(s.centerline[0].y - s.centerline[1].y);
    if (dx < 2 && dy > 5) {
      verticals.push({ x: s.centerline[0].x, w: s.width });
    } else if (dy < 2 && dx > 5) {
      horizontals.push({ y: s.centerline[0].y, w: s.width });
    }
  }

  verticals.sort((a, b) => a.x - b.x);
  horizontals.sort((a, b) => a.y - b.y);

  // X and Y edges: viewport boundaries + street centerlines
  const xEdges = [0, ...verticals.map((v) => v.x), viewBoxW];
  const yEdges = [0, ...horizontals.map((h) => h.y), viewBoxH];

  const parcels: Feature[] = [];

  for (let i = 0; i < xEdges.length - 1; i++) {
    for (let j = 0; j < yEdges.length - 1; j++) {
      // Inset block boundaries by half street width
      const left =
        i === 0 ? xEdges[i] : xEdges[i] + (verticals[i - 1]?.w || 0) / 2;
      const right =
        i === xEdges.length - 2
          ? xEdges[i + 1]
          : xEdges[i + 1] - (verticals[i]?.w || 0) / 2;
      const top =
        j === 0 ? yEdges[j] : yEdges[j] + (horizontals[j - 1]?.w || 0) / 2;
      const bottom =
        j === yEdges.length - 2
          ? yEdges[j + 1]
          : yEdges[j + 1] - (horizontals[j]?.w || 0) / 2;

      if (right - left < 4 || bottom - top < 4) continue;

      // Find buildings inside this block
      const blockBuildings = buildings.filter((b) => {
        const cx =
          b.points.reduce((s, p) => s + p.x, 0) / b.points.length;
        const cy =
          b.points.reduce((s, p) => s + p.y, 0) / b.points.length;
        return cx > left && cx < right && cy > top && cy < bottom;
      });

      if (blockBuildings.length <= 1) {
        // Single building or empty block — one parcel for the whole block
        parcels.push({
          id: 0,
          type: "parcel",
          points: [
            { x: left, y: top },
            { x: right, y: top },
            { x: right, y: bottom },
            { x: left, y: bottom },
          ],
        });
      } else {
        // Multiple buildings — subdivide into individual lot parcels
        // Determine if buildings are arranged vertically or horizontally
        const blockWidth = right - left;
        const blockHeight = bottom - top;

        // Sort buildings by their center position along the block's long axis
        const isVerticalBlock = blockHeight > blockWidth;
        const sorted = [...blockBuildings].sort((a, b) => {
          const aCtr = isVerticalBlock
            ? a.points.reduce((s, p) => s + p.y, 0) / a.points.length
            : a.points.reduce((s, p) => s + p.x, 0) / a.points.length;
          const bCtr = isVerticalBlock
            ? b.points.reduce((s, p) => s + p.y, 0) / b.points.length
            : b.points.reduce((s, p) => s + p.x, 0) / b.points.length;
          return aCtr - bCtr;
        });

        // Create lot boundaries between adjacent buildings
        const boundaries: number[] = [isVerticalBlock ? top : left];
        for (let k = 0; k < sorted.length - 1; k++) {
          const curr = sorted[k];
          const next = sorted[k + 1];
          if (isVerticalBlock) {
            const currBottom = Math.max(...curr.points.map((p) => p.y));
            const nextTop = Math.min(...next.points.map((p) => p.y));
            boundaries.push((currBottom + nextTop) / 2);
          } else {
            const currRight = Math.max(...curr.points.map((p) => p.x));
            const nextLeft = Math.min(...next.points.map((p) => p.x));
            boundaries.push((currRight + nextLeft) / 2);
          }
        }
        boundaries.push(isVerticalBlock ? bottom : right);

        // Create a parcel for each lot
        for (let k = 0; k < boundaries.length - 1; k++) {
          if (isVerticalBlock) {
            parcels.push({
              id: 0,
              type: "parcel",
              points: [
                { x: left, y: boundaries[k] },
                { x: right, y: boundaries[k] },
                { x: right, y: boundaries[k + 1] },
                { x: left, y: boundaries[k + 1] },
              ],
            });
          } else {
            parcels.push({
              id: 0,
              type: "parcel",
              points: [
                { x: boundaries[k], y: top },
                { x: boundaries[k + 1], y: top },
                { x: boundaries[k + 1], y: bottom },
                { x: boundaries[k], y: bottom },
              ],
            });
          }
        }
      }
    }
  }

  console.log(
    `Parcel computation: ${parcels.length} lots from ${xEdges.length - 1}x${yEdges.length - 1} blocks`
  );
  return parcels;
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

function featuresToSvg(
  features: Feature[],
  viewBoxDims?: { width: number; height: number }
): string {
  const vbW = viewBoxDims?.width ?? 100;
  const vbH = viewBoxDims?.height ?? 100;
  const viewBox = `0 0 ${vbW} ${vbH}`;

  // Google Maps actual color palette (calibrated from real screenshots)
  const styles: Record<
    string,
    { fill: string; stroke: string; strokeWidth: number; opacity: number }
  > = {
    parcel: {
      fill: "none", // parcels are outlines only (lot boundaries)
      stroke: "#d5d2cc", // visible gray lot lines matching Google Maps
      strokeWidth: 0.25,
      opacity: 0.9,
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

      // Outer border (shadow) — butt linecap so streets have flat ends at viewport edges
      featureSvgs.push(
        `<path d="${pathD}" fill="none" stroke="${colors.border}" stroke-width="${(feature.width || 5) + 0.6}" stroke-linecap="butt" stroke-linejoin="round" opacity="0.4"/>`
      );
      // Main road surface
      featureSvgs.push(
        `<path d="${pathD}" fill="none" stroke="${colors.fill}" stroke-width="${feature.width || 5}" stroke-linecap="butt" stroke-linejoin="round" opacity="0.95"/>`
      );

      // Yellow center line dashes for local roads (like Google Maps)
      if ((feature.width || 0) >= 4 && !isHighway) {
        featureSvgs.push(
          `<path d="${pathD}" fill="none" stroke="#e8c840" stroke-width="0.2" stroke-linecap="butt" stroke-dasharray="1.2,0.8" opacity="0.5"/>`
        );
      }
      // White lane dashes for highways
      if (isHighway && (feature.width || 0) >= 6) {
        featureSvgs.push(
          `<path d="${pathD}" fill="none" stroke="#ffffff" stroke-width="0.2" stroke-linecap="butt" stroke-dasharray="1.5,1" opacity="0.5"/>`
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
  <rect width="${vbW}" height="${vbH}" fill="url(#grid)"/>

  <!-- Features -->
  ${featureSvgs.join("\n  ")}

  <!-- Labels -->
  ${labelSvgs.join("\n  ")}

  <!-- Watermark -->
  <text x="2" y="${vbH - 1}" font-size="1.4" fill="#b0ada8" font-family="Arial, sans-serif">Generated by HYLO-SP</text>
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

    const { features, buildings, tracingUsed, viewBox } =
      await analyzeSiteImage(image, detailLevel);

    const svg = featuresToSvg(features, viewBox);

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
