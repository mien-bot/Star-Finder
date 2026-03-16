import sharp from "sharp";
import potrace from "potrace";

interface Point {
  x: number;
  y: number;
}

export interface TracedFeature {
  type: "building" | "street" | "vegetation" | "water" | "parking";
  svgPath: string;
  points: Point[];
}

export interface DetectedRegion {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  area: number;
  center: Point;
}

// ─── HSL color utilities ─────────────────────────────────────────────────────

function rgbToHsl(
  r: number,
  g: number,
  b: number
): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l * 100];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return [h * 360, s * 100, l * 100];
}

// ─── Google Maps color classifiers ───────────────────────────────────────────
//
// Calibrated from actual Google Maps screenshots (zoomed street-level view):
//
//   STREETS (blue-gray road surface):
//     ~RGB(160,170,185)  HSL(215°, 12%, 68%)
//     Roads have a distinctly cool blue-gray tone, NOT white
//
//   BUILDINGS (light gray footprints):
//     ~RGB(220,220,220) to (235,235,235)  HSL(0°, 0%, 87-92%)
//     Nearly white rectangles, very low saturation, slightly darker than land
//
//   LAND/PARCELS (background):
//     ~RGB(240,240,238)  HSL(30°, 5%, 94%)
//     Very light warm gray, lighter than buildings
//
//   HIGHWAY (dark gray road surface):
//     ~RGB(140,145,155)  HSL(215°, 8%, 58%)
//     Darker version of street color, with white lane dashes
//
//   VEGETATION (green strips/parks):
//     ~RGB(195,225,195)  HSL(120°, 30%, 82%)
//     Light green, often as median strips along highways
//
//   WATER:
//     ~RGB(170,218,255)  HSL(208°, 100%, 83%)
//     Light blue
//
//   YELLOW CENTER LINES:
//     ~RGB(255,213,79)   HSL(45°, 100%, 65%)
//     Thin dashes on major roads — ignore in tracing

interface ColorClassifier {
  type: TracedFeature["type"] | "highway";
  match: (r: number, g: number, b: number) => boolean;
  turdSize: number;
  description: string;
}

function getGoogleMapsClassifiers(): ColorClassifier[] {
  return [
    {
      type: "street",
      description: "Streets (blue-gray road surface)",
      match: (r, g, b) => {
        const [h, s, l] = rgbToHsl(r, g, b);
        // Blue-gray roads: hue 200-230, low-medium saturation, medium lightness
        // Distinguishes from buildings (no blue hue) and highway (darker)
        return h >= 195 && h <= 235 && s >= 5 && s <= 30 && l >= 58 && l <= 75;
      },
      turdSize: 10,
    },
    {
      type: "highway",
      description: "Highway lanes (darker blue-gray)",
      match: (r, g, b) => {
        const [h, s, l] = rgbToHsl(r, g, b);
        // Highways: same hue as streets but darker
        return h >= 195 && h <= 235 && s >= 4 && s <= 25 && l >= 48 && l <= 62;
      },
      turdSize: 15,
    },
    {
      type: "building",
      description: "Building footprints (light gray, possibly blue-tinted)",
      match: (r, g, b) => {
        const [h, s, l] = rgbToHsl(r, g, b);
        // Buildings: near-neutral or slightly blue-tinted gray at high lightness
        // Only exclude blue-gray if dark enough to be actual road surface (L < 85)
        const isBlueGray = h >= 195 && h <= 235 && s >= 5 && l < 85;
        return !isBlueGray && s < 18 && l >= 82 && l <= 93;
      },
      turdSize: 4,
    },
    {
      type: "vegetation",
      description: "Parks and green spaces",
      match: (r, g, b) => {
        const [h, s, l] = rgbToHsl(r, g, b);
        return h >= 80 && h <= 165 && s >= 12 && s <= 60 && l >= 65 && l <= 92;
      },
      turdSize: 12,
    },
    {
      type: "water",
      description: "Water bodies (blue)",
      match: (r, g, b) => {
        const [h, s, l] = rgbToHsl(r, g, b);
        return h >= 190 && h <= 230 && s >= 30 && l >= 60 && l <= 92;
      },
      turdSize: 15,
    },
  ];
}

function getSatelliteClassifiers(): ColorClassifier[] {
  return [
    {
      type: "street",
      description: "Paved roads (gray asphalt)",
      match: (r, g, b) => {
        const [, s, l] = rgbToHsl(r, g, b);
        return s < 15 && l >= 35 && l <= 70;
      },
      turdSize: 12,
    },
    {
      type: "building",
      description: "Rooftops",
      match: (r, g, b) => {
        const [h, s, l] = rgbToHsl(r, g, b);
        return s < 25 && l >= 55 && l <= 85 && (h < 60 || h > 300);
      },
      turdSize: 5,
    },
    {
      type: "vegetation",
      description: "Trees and green areas",
      match: (r, g, b) => {
        const [h, s, l] = rgbToHsl(r, g, b);
        return h >= 60 && h <= 170 && s >= 15 && l >= 15 && l <= 65;
      },
      turdSize: 20,
    },
    {
      type: "water",
      description: "Water bodies",
      match: (r, g, b) => {
        const [h, s, l] = rgbToHsl(r, g, b);
        return h >= 180 && h <= 240 && s >= 15 && l >= 20 && l <= 70;
      },
      turdSize: 20,
    },
  ];
}

const CLASSIFIER_PRESETS: Record<string, () => ColorClassifier[]> = {
  googleMaps: getGoogleMapsClassifiers,
  satellite: getSatelliteClassifiers,
  osm: getGoogleMapsClassifiers, // OSM similar enough to Google Maps
};

const TRACE_SIZE = 1000;

// ─── Main tracing pipeline ──────────────────────────────────────────────────

export async function traceImage(
  imageBuffer: Buffer,
  preset: string = "googleMaps"
): Promise<TracedFeature[]> {
  const getClassifiers =
    CLASSIFIER_PRESETS[preset] || CLASSIFIER_PRESETS.googleMaps;
  const classifiers = getClassifiers();
  const features: TracedFeature[] = [];

  const { data, info } = await sharp(imageBuffer)
    .resize(TRACE_SIZE, TRACE_SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (const classifier of classifiers) {
    try {
      const mask = createClassifierMask(
        data,
        info.width,
        info.height,
        3,
        classifier.match
      );

      let filledPixels = 0;
      for (let i = 0; i < mask.length; i++) {
        if (mask[i] === 255) filledPixels++;
      }
      const fillRatio = filledPixels / mask.length;
      if (fillRatio < 0.001 || fillRatio > 0.95) continue;

      console.log(
        `  Tracing ${classifier.type} (${classifier.description}): ${(fillRatio * 100).toFixed(1)}% coverage`
      );

      const pngBuffer = await sharp(mask, {
        raw: { width: info.width, height: info.height, channels: 1 },
      })
        .png()
        .toBuffer();

      const traced = await traceBitmap(pngBuffer, classifier.turdSize);
      if (traced) {
        const scale = 100 / TRACE_SIZE;
        // Map highway → street (same feature type, just wider)
        const featureType: TracedFeature["type"] =
          classifier.type === "highway" ? "street" : classifier.type;
        features.push({
          type: featureType,
          svgPath: traced.rawPath,
          points: traced.points.map((p) => ({
            x: clamp(p.x * scale),
            y: clamp(p.y * scale),
          })),
        });
      }
    } catch (e) {
      console.warn(`Image tracing failed for ${classifier.type}:`, e);
    }
  }

  return features;
}

// ─── Preset auto-detection ──────────────────────────────────────────────────

export async function detectPreset(imageBuffer: Buffer): Promise<string> {
  try {
    const { data } = await sharp(imageBuffer)
      .resize(100, 100, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const total = 100 * 100;
    let blueGrayPixels = 0; // blue-gray roads (Google Maps)
    let darkGreenPixels = 0; // dark green (satellite vegetation)
    let neutralGrayPixels = 0; // neutral gray buildings
    let lightGreenPixels = 0; // light green (map parks)

    for (let i = 0; i < total; i++) {
      const r = data[i * 3];
      const g = data[i * 3 + 1];
      const b = data[i * 3 + 2];
      const [h, s, l] = rgbToHsl(r, g, b);

      if (h >= 195 && h <= 235 && s >= 5 && s <= 30 && l >= 48 && l <= 75)
        blueGrayPixels++;
      if (h >= 60 && h <= 170 && s >= 15 && l < 50) darkGreenPixels++;
      if (s < 10 && l >= 82 && l <= 93) neutralGrayPixels++;
      if (h >= 80 && h <= 165 && s >= 12 && l >= 65) lightGreenPixels++;
    }

    const blueGrayRatio = blueGrayPixels / total;
    const darkGreenRatio = darkGreenPixels / total;
    const neutralGrayRatio = neutralGrayPixels / total;

    console.log(
      `Preset detection: blueGray=${(blueGrayRatio * 100).toFixed(1)}% darkGreen=${(darkGreenRatio * 100).toFixed(1)}% neutralGray=${(neutralGrayRatio * 100).toFixed(1)}%`
    );

    // Google Maps: blue-gray roads + neutral gray buildings
    if (blueGrayRatio > 0.03 || (neutralGrayRatio > 0.1 && blueGrayRatio > 0.01)) {
      return "googleMaps";
    }

    // Satellite: dark green vegetation
    if (darkGreenRatio > 0.1) {
      return "satellite";
    }

    return "googleMaps";
  } catch {
    return "googleMaps";
  }
}

// ─── Color analysis report ──────────────────────────────────────────────────

export async function analyzeColors(
  imageBuffer: Buffer
): Promise<
  Array<{ color: string; hsl: string; percentage: number; likelyType: string }>
> {
  const { data } = await sharp(imageBuffer)
    .resize(200, 200, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const total = 200 * 200;

  const buckets = new Map<
    string,
    { r: number; g: number; b: number; count: number }
  >();

  for (let i = 0; i < total; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];

    const qr = Math.round(r / 32) * 32;
    const qg = Math.round(g / 32) * 32;
    const qb = Math.round(b / 32) * 32;
    const key = `${qr},${qg},${qb}`;

    const existing = buckets.get(key);
    if (existing) {
      existing.r += r;
      existing.g += g;
      existing.b += b;
      existing.count++;
    } else {
      buckets.set(key, { r, g, b, count: 1 });
    }
  }

  const sorted = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return sorted.map((bucket) => {
    const r = Math.round(bucket.r / bucket.count);
    const g = Math.round(bucket.g / bucket.count);
    const b = Math.round(bucket.b / bucket.count);
    const [h, s, l] = rgbToHsl(r, g, b);
    const percentage = (bucket.count / total) * 100;

    let likelyType = "unknown";

    // Blue-gray roads
    if (h >= 195 && h <= 235 && s >= 5 && s <= 30 && l >= 58 && l <= 75)
      likelyType = "street (blue-gray road)";
    else if (h >= 195 && h <= 235 && s >= 4 && s <= 25 && l >= 48 && l < 58)
      likelyType = "highway (dark gray road)";
    // Building footprints (neutral or slightly blue-tinted gray at high lightness)
    else if (s < 18 && l >= 82 && l <= 93)
      likelyType = "building (light gray footprint)";
    // Very light land background
    else if (s < 8 && l > 93)
      likelyType = "background (land)";
    // Vegetation
    else if (h >= 80 && h <= 165 && s >= 12 && l >= 65)
      likelyType = "vegetation (green)";
    // Water
    else if (h >= 190 && h <= 230 && s >= 30 && l >= 60)
      likelyType = "water (blue)";
    // Yellow center lines
    else if (h >= 35 && h <= 55 && s >= 60 && l >= 55)
      likelyType = "road marking (yellow center line)";
    // Dark text
    else if (s < 15 && l < 45)
      likelyType = "text/label (dark)";
    else
      likelyType = `unclassified (H:${h.toFixed(0)} S:${s.toFixed(0)} L:${l.toFixed(0)})`;

    const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;

    return {
      color: hex,
      hsl: `H:${h.toFixed(0)} S:${s.toFixed(0)}% L:${l.toFixed(0)}%`,
      percentage: Math.round(percentage * 10) / 10,
      likelyType,
    };
  });
}

// ─── Utilities ──────────────────────────────────────────────────────────────

export async function imageToBuffer(
  imageData: string
): Promise<Buffer | null> {
  try {
    if (imageData.startsWith("data:image/")) {
      const base64 = imageData.split(",")[1];
      if (!base64) return null;
      return Buffer.from(base64, "base64");
    }
    return null;
  } catch {
    return null;
  }
}

function createClassifierMask(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  matchFn: (r: number, g: number, b: number) => boolean
): Buffer {
  const mask = Buffer.alloc(width * height);

  for (let i = 0; i < width * height; i++) {
    const offset = i * channels;
    if (matchFn(data[offset], data[offset + 1], data[offset + 2])) {
      mask[i] = 255;
    }
  }

  return mask;
}

function traceBitmap(
  pngBuffer: Buffer,
  turdSize: number
): Promise<{ rawPath: string; points: Point[] } | null> {
  return new Promise((resolve, reject) => {
    potrace.trace(
      pngBuffer,
      { turdSize, optTolerance: 0.4, threshold: 128 },
      (err: Error | null, svg: string) => {
        if (err) return reject(err);

        const pathMatches = svg.match(/d="([^"]+)"/g);
        if (!pathMatches || pathMatches.length === 0) return resolve(null);

        const allPaths = pathMatches.map((m) => m.slice(3, -1)).join(" ");
        if (!allPaths.trim()) return resolve(null);

        const points = extractPointsFromPath(allPaths);
        if (points.length === 0) return resolve(null);

        resolve({ rawPath: allPaths, points });
      }
    );
  });
}

function extractPointsFromPath(pathD: string): Point[] {
  const points: Point[] = [];
  const regex = /(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)/g;
  let match;

  while ((match = regex.exec(pathD)) !== null) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    if (!isNaN(x) && !isNaN(y)) {
      points.push({ x, y });
    }
  }

  const deduped: Point[] = [];
  for (const p of points) {
    if (
      !deduped.some(
        (d) => Math.abs(d.x - p.x) < 5 && Math.abs(d.y - p.y) < 5
      )
    ) {
      deduped.push(p);
    }
  }

  return deduped;
}

function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

// ─── Building region detection via connected components ─────────────────────
// Instead of relying on GPT-4o to guess building positions, analyze actual
// pixel colors to find light-gray building footprints in Google Maps screenshots.

export async function findBuildingRegions(
  imageBuffer: Buffer
): Promise<DetectedRegion[]> {
  const size = 800; // Higher resolution for better building separation
  const { data, info } = await sharp(imageBuffer)
    .resize(size, size, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;

  // Create building mask — same classifier as tracing
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    const [hue, s, l] = rgbToHsl(r, g, b);
    // Building pixels: neutral or slightly blue-tinted gray, NOT actual road surfaces
    // Only exclude as blue-gray if dark enough to be a road (L < 85)
    // Buildings often have a slight blue tint at high lightness (L ≈ 88-93)
    const isBlueGray = hue >= 195 && hue <= 235 && s >= 5 && l < 85;
    if (!isBlueGray && s < 18 && l >= 78 && l <= 93) {
      mask[i] = 1;
    }
  }

  // Morphological erosion: 3 passes to separate touching buildings at higher res
  for (let pass = 0; pass < 3; pass++) {
    const eroded = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        if (
          mask[idx] === 1 &&
          mask[idx - 1] === 1 &&
          mask[idx + 1] === 1 &&
          mask[idx - w] === 1 &&
          mask[idx + w] === 1
        ) {
          eroded[idx] = 1;
        }
      }
    }
    for (let i = 0; i < w * h; i++) mask[i] = eroded[i];
  }

  // Connected component labeling (4-connectivity, two-pass with union-find)
  const labels = new Int32Array(w * h);
  let nextLabel = 1;
  const parentArr: number[] = [0];

  function find(x: number): number {
    while (parentArr[x] !== x) {
      parentArr[x] = parentArr[parentArr[x]];
      x = parentArr[x];
    }
    return x;
  }

  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parentArr[rb] = ra;
  }

  // First pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx] === 0) continue;

      const neighbors: number[] = [];
      if (x > 0 && labels[idx - 1] > 0) neighbors.push(labels[idx - 1]);
      if (y > 0 && labels[idx - w] > 0) neighbors.push(labels[idx - w]);

      if (neighbors.length === 0) {
        labels[idx] = nextLabel;
        parentArr.push(nextLabel);
        nextLabel++;
      } else {
        const minLabel = Math.min(...neighbors);
        labels[idx] = minLabel;
        for (const n of neighbors) union(minLabel, n);
      }
    }
  }

  // Collect region stats
  const regionMap = new Map<
    number,
    { minX: number; minY: number; maxX: number; maxY: number; count: number }
  >();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (labels[idx] === 0) continue;

      const root = find(labels[idx]);
      const r = regionMap.get(root);
      if (r) {
        r.minX = Math.min(r.minX, x);
        r.minY = Math.min(r.minY, y);
        r.maxX = Math.max(r.maxX, x);
        r.maxY = Math.max(r.maxY, y);
        r.count++;
      } else {
        regionMap.set(root, {
          minX: x,
          minY: y,
          maxX: x,
          maxY: y,
          count: 1,
        });
      }
    }
  }

  // Filter and convert to 0-100 coordinate space
  const scale = 100 / size;
  const minPixels = 120; // ~11x11 pixel area minimum at 800px (catch smaller buildings)
  const maxPixels = size * size * 0.04; // max 4% of image (single building)

  const result: DetectedRegion[] = [];
  for (const [, r] of regionMap) {
    if (r.count < minPixels || r.count > maxPixels) continue;

    const rw = r.maxX - r.minX;
    const rh = r.maxY - r.minY;
    if (rw < 5 || rh < 5) continue;

    // Skip elongated shapes (likely roads or sidewalks, not buildings)
    const aspect = Math.max(rw, rh) / Math.min(rw, rh);
    if (aspect > 5) continue;

    // Compactness: how much of the bounding box is filled (buildings are solid)
    const boxArea = rw * rh;
    const fill = r.count / boxArea;
    if (fill < 0.35) continue;

    result.push({
      bounds: {
        minX: clamp(r.minX * scale),
        minY: clamp(r.minY * scale),
        maxX: clamp(r.maxX * scale),
        maxY: clamp(r.maxY * scale),
      },
      area: r.count,
      center: {
        x: clamp(((r.minX + r.maxX) / 2) * scale),
        y: clamp(((r.minY + r.maxY) / 2) * scale),
      },
    });
  }

  result.sort((a, b) => b.area - a.area);
  console.log(
    `Building region detection: ${result.length} regions found from ${regionMap.size} components`
  );
  return result.slice(0, 80);
}
