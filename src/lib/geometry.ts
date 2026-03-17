// ─── Shared geometry types and utilities ─────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface Feature {
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

export function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

// ─── Centerline → Polygon conversion ────────────────────────────────────────

export function centerlineToPolygon(centerline: Point[], width: number): Point[] {
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

// ─── Parcel computation from street grid + buildings ────────────────────────

export function computeParcels(
  streets: { centerline: Point[]; width: number }[],
  buildings: Feature[],
  viewBoxW: number,
  viewBoxH: number
): Feature[] {
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

  const xEdges = [0, ...verticals.map((v) => v.x), viewBoxW];
  const yEdges = [0, ...horizontals.map((h) => h.y), viewBoxH];

  const parcels: Feature[] = [];

  for (let i = 0; i < xEdges.length - 1; i++) {
    for (let j = 0; j < yEdges.length - 1; j++) {
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

      const blockBuildings = buildings.filter((b) => {
        const cx =
          b.points.reduce((s, p) => s + p.x, 0) / b.points.length;
        const cy =
          b.points.reduce((s, p) => s + p.y, 0) / b.points.length;
        return cx > left && cx < right && cy > top && cy < bottom;
      });

      if (blockBuildings.length <= 1) {
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
        const blockWidth = right - left;
        const blockHeight = bottom - top;
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
