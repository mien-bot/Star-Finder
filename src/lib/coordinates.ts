import type { Star } from './types'
import type { AstrometryCalibration } from './astrometry'

/**
 * Convert RA/Dec to pixel coordinates using gnomonic (tangent plane) projection
 */
export function radecToPixel(
  ra: number,
  dec: number,
  cal: AstrometryCalibration,
  imgWidth: number,
  imgHeight: number
): { x: number; y: number } | null {
  const toRad = Math.PI / 180
  const ra0 = cal.ra * toRad
  const dec0 = cal.dec * toRad
  const raRad = ra * toRad
  const decRad = dec * toRad
  const orient = cal.orientation * toRad

  // Gnomonic projection
  const cosDec = Math.cos(decRad)
  const sinDec = Math.sin(decRad)
  const cosDec0 = Math.cos(dec0)
  const sinDec0 = Math.sin(dec0)
  const cosDRa = Math.cos(raRad - ra0)

  const denom = sinDec0 * sinDec + cosDec0 * cosDec * cosDRa
  if (denom <= 0) return null // Behind the projection center

  const xi = (cosDec * Math.sin(raRad - ra0)) / denom
  const eta = (cosDec0 * sinDec - sinDec0 * cosDec * cosDRa) / denom

  // Convert from radians to pixels using plate scale
  const pixscaleRad = (cal.pixscale / 3600) * toRad

  // Apply rotation for camera orientation
  const cosO = Math.cos(orient)
  const sinO = Math.sin(orient)
  const dx = (xi * cosO + eta * sinO) / pixscaleRad
  const dy = (-xi * sinO + eta * cosO) / pixscaleRad

  // Center of image
  const px = imgWidth / 2 + dx
  const py = imgHeight / 2 - dy

  // Check bounds with margin
  const margin = 50
  if (px < -margin || px > imgWidth + margin || py < -margin || py > imgHeight + margin) {
    return null
  }

  return { x: px, y: py }
}

/**
 * Calculate angular separation between two sky coordinates (in degrees)
 */
export function angularSeparation(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const toRad = Math.PI / 180
  const dRa = (ra2 - ra1) * toRad
  const dec1r = dec1 * toRad
  const dec2r = dec2 * toRad

  const a = Math.sin(dRa / 2) ** 2 +
    Math.cos(dec1r) * Math.cos(dec2r) * Math.sin((dec2r - dec1r) / 2) ** 2

  return 2 * Math.asin(Math.min(1, Math.sqrt(Math.abs(a)))) * (180 / Math.PI)
}

/**
 * Map raw pixel coordinates to a normalized canvas coordinate system (0-1000)
 */
export function pixelToCanvas(
  px: number,
  py: number,
  imgWidth: number,
  imgHeight: number,
  canvasSize = 1000
): [number, number] {
  return [
    (px / imgWidth) * canvasSize,
    (py / imgHeight) * canvasSize,
  ]
}

/**
 * Project all stars in a catalog onto image pixel coordinates
 */
export function projectStarsToImage(
  stars: Star[],
  cal: AstrometryCalibration,
  imgWidth: number,
  imgHeight: number
): Star[] {
  const result: Star[] = []
  for (const star of stars) {
    const pos = radecToPixel(star.ra, star.dec, cal, imgWidth, imgHeight)
    if (pos) {
      result.push({ ...star, px: pos.x, py: pos.y })
    }
  }
  return result
}

/**
 * Match a star name to a catalog entry. Handles common names like "Vega", "Deneb",
 * Bayer designations like "Alpha Lyrae", and catalog IDs.
 */
export function findStarByName(name: string, catalog: Star[]): Star | null {
  const normalized = name.toLowerCase().trim()

  // Try exact proper name match first
  for (const star of catalog) {
    if (star.name && star.name.toLowerCase() === normalized) return star
  }

  // Try partial match (e.g. "Alpha Lyr" matches "Alpha Lyrae")
  for (const star of catalog) {
    if (star.name && star.name.toLowerCase().startsWith(normalized)) return star
  }

  // Try matching Bayer/Flamsteed designation in bf field
  for (const star of catalog) {
    if (star.bf && star.bf.toLowerCase().includes(normalized)) return star
  }

  return null
}

export interface MatchedPair {
  px: number  // pixel x (normalized 0-1)
  py: number  // pixel y (normalized 0-1)
  ra: number  // degrees
  dec: number // degrees
}

/**
 * Gnomonic projection: convert RA/Dec to tangent-plane standard coordinates
 * relative to a field center. Returns (xi, eta) in radians.
 */
function toStandardCoords(ra: number, dec: number, ra0: number, dec0: number): { xi: number; eta: number } {
  const toRad = Math.PI / 180
  const raR = ra * toRad
  const decR = dec * toRad
  const ra0R = ra0 * toRad
  const dec0R = dec0 * toRad

  const cosDec = Math.cos(decR)
  const sinDec = Math.sin(decR)
  const cosDec0 = Math.cos(dec0R)
  const sinDec0 = Math.sin(dec0R)
  const cosDRa = Math.cos(raR - ra0R)

  const denom = sinDec0 * sinDec + cosDec0 * cosDec * cosDRa

  return {
    xi: (cosDec * Math.sin(raR - ra0R)) / denom,
    eta: (cosDec0 * sinDec - sinDec0 * cosDec * cosDRa) / denom,
  }
}

/**
 * Affine transform coefficients: px = a*xi + b*eta + c, py = d*xi + e*eta + f
 */
export interface AffineTransform {
  a: number; b: number; c: number  // for px
  d: number; e: number; f: number  // for py
  centerRa: number
  centerDec: number
}

/**
 * Fit an affine transform from sky standard coordinates to pixel coordinates
 * using least-squares. This is robust to approximate GPT-4o positions.
 *
 * With N matched stars, we solve the overdetermined system:
 *   [xi_i, eta_i, 1] * [a, b, c]^T = px_i
 *   [xi_i, eta_i, 1] * [d, e, f]^T = py_i
 */
export function fitAffineTransform(
  matches: MatchedPair[],
): AffineTransform | null {
  if (matches.length < 3) {
    // With only 2 matches, fall back to a simpler fit
    if (matches.length < 2) return null
    return fitAffineFrom2(matches)
  }

  // Field center
  const centerRa = matches.reduce((s, m) => s + m.ra, 0) / matches.length
  const centerDec = matches.reduce((s, m) => s + m.dec, 0) / matches.length

  // Convert to standard coordinates
  const pts = matches.map(m => ({
    ...toStandardCoords(m.ra, m.dec, centerRa, centerDec),
    px: m.px,
    py: m.py,
  }))

  // Solve least squares: A * x = b for px and py separately
  // A = [xi, eta, 1; ...], b_x = [px; ...], b_y = [py; ...]
  // Normal equations: (A^T A) x = A^T b
  const n = pts.length
  let s_xi2 = 0, s_eta2 = 0, s_xieta = 0, s_xi = 0, s_eta = 0
  let s_xi_px = 0, s_eta_px = 0, s_px = 0
  let s_xi_py = 0, s_eta_py = 0, s_py = 0

  for (const p of pts) {
    s_xi2 += p.xi * p.xi
    s_eta2 += p.eta * p.eta
    s_xieta += p.xi * p.eta
    s_xi += p.xi
    s_eta += p.eta
    s_xi_px += p.xi * p.px
    s_eta_px += p.eta * p.px
    s_px += p.px
    s_xi_py += p.xi * p.py
    s_eta_py += p.eta * p.py
    s_py += p.py
  }

  // A^T A = [[s_xi2, s_xieta, s_xi], [s_xieta, s_eta2, s_eta], [s_xi, s_eta, n]]
  // Solve using Cramer's rule for 3x3
  const det = s_xi2 * (s_eta2 * n - s_eta * s_eta)
            - s_xieta * (s_xieta * n - s_eta * s_xi)
            + s_xi * (s_xieta * s_eta - s_eta2 * s_xi)

  if (Math.abs(det) < 1e-20) return null

  // Solve for [a, b, c] (px coefficients)
  const a = (s_xi_px * (s_eta2 * n - s_eta * s_eta)
           - s_xieta * (s_eta_px * n - s_eta * s_px)
           + s_xi * (s_eta_px * s_eta - s_eta2 * s_px)) / det

  const b = (s_xi2 * (s_eta_px * n - s_eta * s_px)
           - s_xi_px * (s_xieta * n - s_eta * s_xi)
           + s_xi * (s_xieta * s_px - s_eta_px * s_xi)) / det

  const c = (s_xi2 * (s_eta2 * s_px - s_eta * s_eta_px)
           - s_xieta * (s_xieta * s_px - s_eta * s_xi_px)
           + s_xi_px * (s_xieta * s_eta - s_eta2 * s_xi)) / det

  // Solve for [d, e, f] (py coefficients)
  const d = (s_xi_py * (s_eta2 * n - s_eta * s_eta)
           - s_xieta * (s_eta_py * n - s_eta * s_py)
           + s_xi * (s_eta_py * s_eta - s_eta2 * s_py)) / det

  const e = (s_xi2 * (s_eta_py * n - s_eta * s_py)
           - s_xi_py * (s_xieta * n - s_eta * s_xi)
           + s_xi * (s_xieta * s_py - s_eta_py * s_xi)) / det

  const f = (s_xi2 * (s_eta2 * s_py - s_eta * s_eta_py)
           - s_xieta * (s_xieta * s_py - s_eta * s_xi_py)
           + s_xi_py * (s_xieta * s_eta - s_eta2 * s_xi)) / det

  return { a, b, c, d, e, f, centerRa, centerDec }
}

/**
 * Fallback for exactly 2 matched stars: fit scale + rotation + translation
 */
function fitAffineFrom2(matches: MatchedPair[]): AffineTransform | null {
  const centerRa = (matches[0].ra + matches[1].ra) / 2
  const centerDec = (matches[0].dec + matches[1].dec) / 2

  const p0 = toStandardCoords(matches[0].ra, matches[0].dec, centerRa, centerDec)
  const p1 = toStandardCoords(matches[1].ra, matches[1].dec, centerRa, centerDec)

  const dxi = p1.xi - p0.xi
  const deta = p1.eta - p0.eta
  const dpx = matches[1].px - matches[0].px
  const dpy = matches[1].py - matches[0].py

  const skyDist2 = dxi * dxi + deta * deta
  if (skyDist2 < 1e-20) return null

  // Solve for rotation + scale: [dpx] = [a b] [dxi]
  //                              [dpy]   [d e] [deta]
  // With constraint: a=e, b=-d (rotation+scale, no shear)
  const a = (dpx * dxi + dpy * deta) / skyDist2
  const b = (dpx * deta - dpy * dxi) / skyDist2

  const cx = (matches[0].px + matches[1].px) / 2
  const cy = (matches[0].py + matches[1].py) / 2

  return { a, b, c: cx, d: -b, e: a, f: cy, centerRa, centerDec }
}

/**
 * Estimate the angular field radius (degrees) that the image covers,
 * by inverting the affine transform at the image corners.
 */
export function estimateFieldRadius(transform: AffineTransform): number {
  const { a, b, c, d, e, f } = transform
  const det = a * e - b * d
  if (Math.abs(det) < 1e-20) return 30 // fallback

  // Invert affine to find standard coords (xi, eta) at image corners
  // px = a*xi + b*eta + c, py = d*xi + e*eta + f
  // xi = (e*(px-c) - b*(py-f)) / det
  // eta = (-d*(px-c) + a*(py-f)) / det
  let maxR = 0
  for (const [px, py] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const xi = (e * (px - c) - b * (py - f)) / det
    const eta = (-d * (px - c) + a * (py - f)) / det
    const r = Math.sqrt(xi * xi + eta * eta) * (180 / Math.PI)
    if (r > maxR) maxR = r
  }

  return Math.min(maxR, 90) // cap at hemisphere
}

/**
 * Project a star's RA/Dec to pixel coordinates using an affine transform.
 * Returns normalized 0-1 coordinates, or null if outside bounds.
 */
export function projectWithAffine(
  ra: number,
  dec: number,
  transform: AffineTransform,
  margin = 0.05  // allow 5% margin outside image
): { x: number; y: number } | null {
  const { xi, eta } = toStandardCoords(ra, dec, transform.centerRa, transform.centerDec)

  const px = transform.a * xi + transform.b * eta + transform.c
  const py = transform.d * xi + transform.e * eta + transform.f

  if (px < -margin || px > 1 + margin || py < -margin || py > 1 + margin) {
    return null
  }

  return { x: px, y: py }
}

/**
 * Project all catalog stars using an affine transform.
 * Returns stars with px/py in actual pixel coordinates.
 */
export function projectStarsWithAffine(
  stars: Star[],
  transform: AffineTransform,
  imgWidth: number,
  imgHeight: number,
): Star[] {
  const result: Star[] = []
  for (const star of stars) {
    const pos = projectWithAffine(star.ra, star.dec, transform)
    if (pos) {
      result.push({ ...star, px: pos.x * imgWidth, py: pos.y * imgHeight })
    }
  }
  return result
}
