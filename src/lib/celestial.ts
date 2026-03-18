/**
 * Celestial coordinate computations for live sky view.
 * Converts between RA/Dec (sky) and Alt/Az (observer) coordinates
 * using GPS location and current time.
 */

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

/**
 * Julian Date from a JavaScript Date
 */
export function julianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5
}

/**
 * Greenwich Mean Sidereal Time in degrees
 */
export function gmst(jd: number): number {
  const T = (jd - 2451545.0) / 36525.0
  let theta = 280.46061837 + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * T * T - T * T * T / 38710000.0
  return ((theta % 360) + 360) % 360
}

/**
 * Local Sidereal Time in degrees
 */
export function localSiderealTime(date: Date, longitudeDeg: number): number {
  const jd = julianDate(date)
  const gst = gmst(jd)
  return ((gst + longitudeDeg) % 360 + 360) % 360
}

/**
 * Convert RA/Dec to Altitude/Azimuth for an observer
 * @param ra - Right Ascension in degrees
 * @param dec - Declination in degrees
 * @param lat - Observer latitude in degrees
 * @param lst - Local Sidereal Time in degrees
 * @returns { alt, az } in degrees. Az: 0=North, 90=East, 180=South, 270=West
 */
export function raDecToAltAz(
  ra: number, dec: number, lat: number, lst: number
): { alt: number; az: number } {
  const ha = (lst - ra) * DEG
  const decR = dec * DEG
  const latR = lat * DEG

  const sinAlt = Math.sin(decR) * Math.sin(latR) + Math.cos(decR) * Math.cos(latR) * Math.cos(ha)
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)))

  const cosAlt = Math.cos(alt)
  if (cosAlt < 1e-10) {
    return { alt: alt * RAD, az: 0 }
  }

  let cosAz = (Math.sin(decR) - Math.sin(alt) * Math.sin(latR)) / (cosAlt * Math.cos(latR))
  cosAz = Math.max(-1, Math.min(1, cosAz))
  const sinAz = -Math.cos(decR) * Math.sin(ha) / cosAlt

  let az = Math.atan2(sinAz, cosAz) * RAD
  az = ((az % 360) + 360) % 360

  return { alt: alt * RAD, az }
}

/**
 * Project a star's Alt/Az position onto a camera view.
 * Uses gnomonic (tangent plane) projection centered on the camera's pointing direction.
 *
 * @param starAlt - Star altitude in degrees
 * @param starAz - Star azimuth in degrees
 * @param camAlt - Camera center altitude in degrees
 * @param camAz - Camera center azimuth in degrees
 * @param camRoll - Camera roll in degrees (0 = landscape level)
 * @param hFov - Horizontal field of view in degrees
 * @param viewWidth - View width in pixels
 * @param viewHeight - View height in pixels
 * @returns { x, y } pixel coordinates, or null if behind camera
 */
export function projectToCamera(
  starAlt: number, starAz: number,
  camAlt: number, camAz: number, camRoll: number,
  hFov: number, viewWidth: number, viewHeight: number
): { x: number; y: number } | null {
  // Convert to radians
  const alt = starAlt * DEG
  const az = starAz * DEG
  const cAlt = camAlt * DEG
  const cAz = camAz * DEG
  const roll = camRoll * DEG

  // Convert Alt/Az to unit vector (x=East, y=North, z=Up)
  const sx = Math.cos(alt) * Math.sin(az)
  const sy = Math.cos(alt) * Math.cos(az)
  const sz = Math.sin(alt)

  // Camera center unit vector
  const cx = Math.cos(cAlt) * Math.sin(cAz)
  const cy = Math.cos(cAlt) * Math.cos(cAz)
  const cz = Math.sin(cAlt)

  // Dot product (cos of angular distance)
  const dot = sx * cx + sy * cy + sz * cz
  if (dot <= 0.01) return null  // Behind camera or too far off-axis

  // Gnomonic projection onto tangent plane
  // Right vector (perpendicular to camera direction, in horizontal plane)
  const rx = Math.cos(cAz)
  const ry = -Math.sin(cAz)
  const rz = 0

  // Up vector (perpendicular to both camera direction and right vector)
  const ux = -Math.sin(cAlt) * Math.sin(cAz)
  const uy = -Math.sin(cAlt) * Math.cos(cAz)
  const uz = Math.cos(cAlt)

  // Project star onto tangent plane
  let xi = (sx * rx + sy * ry + sz * rz) / dot
  let eta = (sx * ux + sy * uy + sz * uz) / dot

  // Apply camera roll
  if (Math.abs(roll) > 0.001) {
    const cosR = Math.cos(roll)
    const sinR = Math.sin(roll)
    const xi2 = xi * cosR - eta * sinR
    const eta2 = xi * sinR + eta * cosR
    xi = xi2
    eta = eta2
  }

  // Convert from tangent plane to pixel coordinates
  const scale = viewWidth / (2 * Math.tan(hFov * DEG / 2))
  const x = viewWidth / 2 + xi * scale
  const y = viewHeight / 2 - eta * scale

  // Check bounds with margin
  const margin = 20
  if (x < -margin || x > viewWidth + margin || y < -margin || y > viewHeight + margin) {
    return null
  }

  return { x, y }
}
