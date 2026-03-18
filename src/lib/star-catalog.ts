import type { Star } from './types'

// Compact star entry from the pre-processed HYG JSON
interface HYGEntry {
  id: number
  hip?: number
  name?: string
  ra: number    // hours
  dec: number   // degrees
  mag: number
  ci?: number   // color index
  con?: string  // constellation abbreviation
  sp?: string   // spectral type
}

let starCache: Star[] | null = null

export async function loadStarCatalog(): Promise<Star[]> {
  if (starCache) return starCache

  try {
    const res = await fetch('/data/hyg-bright.json')
    const entries: HYGEntry[] = await res.json()
    starCache = entries.map(e => ({
      id: e.id,
      hip: e.hip,
      name: e.name,
      ra: e.ra * 15, // convert hours to degrees
      dec: e.dec,
      mag: e.mag,
      colorIndex: e.ci,
      constellation: e.con,
      spectralType: e.sp,
    }))
    return starCache
  } catch {
    console.error('Failed to load star catalog')
    return []
  }
}

export function findStarsInField(
  stars: Star[],
  centerRa: number,
  centerDec: number,
  radiusDeg: number
): Star[] {
  return stars.filter(star => {
    const sep = angularSeparation(centerRa, centerDec, star.ra, star.dec)
    return sep <= radiusDeg
  })
}

function angularSeparation(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const toRad = Math.PI / 180
  const dRa = (ra2 - ra1) * toRad
  const dec1r = dec1 * toRad
  const dec2r = dec2 * toRad
  const a = Math.sin(dRa / 2) ** 2 + Math.cos(dec1r) * Math.cos(dec2r) * Math.sin((dec2r - dec1r) / 2) ** 2
  return 2 * Math.asin(Math.sqrt(Math.abs(a))) * (180 / Math.PI)
}

export function colorFromColorIndex(ci: number): string {
  // Map B-V color index to RGB
  // B-V < 0: blue-white (O/B stars)
  // B-V 0-0.3: white (A stars)
  // B-V 0.3-0.6: yellow-white (F stars)
  // B-V 0.6-0.8: yellow (G stars like Sun)
  // B-V 0.8-1.4: orange (K stars)
  // B-V > 1.4: red (M stars)
  if (ci < -0.2) return '#9bb0ff'  // O blue
  if (ci < 0.0)  return '#aabfff'  // B blue-white
  if (ci < 0.3)  return '#cad7ff'  // A white
  if (ci < 0.6)  return '#f8f7ff'  // F yellow-white
  if (ci < 0.8)  return '#fff4ea'  // G yellow
  if (ci < 1.4)  return '#ffd2a1'  // K orange
  return '#ffcc6f'                  // M red-orange
}

export function magnitudeToRadius(mag: number, minMag = -1.5, maxMag = 6.5): number {
  // Brighter stars (lower mag) get larger radius
  const normalized = 1 - (mag - minMag) / (maxMag - minMag)
  return Math.max(1, normalized * 5 + 1)
}
