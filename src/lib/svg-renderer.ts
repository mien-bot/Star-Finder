// ─── SVG Rendering — Google Maps palette ─────────────────────────────────────

import { Feature, Point } from "./geometry";

export function featuresToSvg(
  features: Feature[],
  viewBoxDims?: { width: number; height: number }
): string {
  const vbW = viewBoxDims?.width ?? 100;
  const vbH = viewBoxDims?.height ?? 100;
  const viewBox = `0 0 ${vbW} ${vbH}`;

  const styles: Record<
    string,
    { fill: string; stroke: string; strokeWidth: number; opacity: number }
  > = {
    parcel: {
      fill: "none",
      stroke: "#d5d2cc",
      strokeWidth: 0.25,
      opacity: 0.9,
    },
    street: {
      fill: "#a0aab5",
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
      fill: "#c8c8d0",
      stroke: "#9898a4",
      strokeWidth: 0.4,
      opacity: 0.95,
    },
    vegetation: {
      fill: "#c3e6c3",
      stroke: "#a5d6a5",
      strokeWidth: 0.2,
      opacity: 0.75,
    },
    water: {
      fill: "#aadaff",
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

  const streetColors = {
    local: { fill: "#a0aab5", border: "#8e99a4" },
    highway: { fill: "#8a8e98", border: "#707580" },
  };

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

      const isHighway =
        (feature.width || 0) >= 8 ||
        /highway|expressway|interstate|i-\d|ramp|hwy/i.test(
          feature.label || ""
        );
      const colors = isHighway ? streetColors.highway : streetColors.local;

      featureSvgs.push(
        `<path d="${pathD}" fill="none" stroke="${colors.border}" stroke-width="${(feature.width || 5) + 0.6}" stroke-linecap="butt" stroke-linejoin="round" opacity="0.4"/>`
      );
      featureSvgs.push(
        `<path d="${pathD}" fill="none" stroke="${colors.fill}" stroke-width="${feature.width || 5}" stroke-linecap="butt" stroke-linejoin="round" opacity="0.95"/>`
      );

      if ((feature.width || 0) >= 4 && !isHighway) {
        featureSvgs.push(
          `<path d="${pathD}" fill="none" stroke="#e8c840" stroke-width="0.2" stroke-linecap="butt" stroke-dasharray="1.2,0.8" opacity="0.5"/>`
        );
      }
      if (isHighway && (feature.width || 0) >= 6) {
        featureSvgs.push(
          `<path d="${pathD}" fill="none" stroke="#ffffff" stroke-width="0.2" stroke-linecap="butt" stroke-dasharray="1.5,1" opacity="0.5"/>`
        );
      }

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

export function roundedPolygonPath(points: Point[], radius: number): string {
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

export function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
