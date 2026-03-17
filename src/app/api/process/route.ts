import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  imageToBuffer,
  analyzeImagePixels,
  ImageAnalysisResult,
} from "@/lib/image-tracer";
import { Point, Feature, clamp, centerlineToPolygon, computeParcels } from "@/lib/geometry";
import { featuresToSvg } from "@/lib/svg-renderer";

// ─── Types ───────────────────────────────────────────────────────────────────

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
      // Only filter if BOTH dimensions are very large (>55 units in 100-unit space)
      if (bw > 55 && bh > 55) return false;
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
