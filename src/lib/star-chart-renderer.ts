import type { Star, Constellation } from './types'
import { colorFromColorIndex, magnitudeToRadius } from './star-catalog'

interface StarChartOptions {
  width?: number
  height?: number
  backgroundColor?: string
  showGrid?: boolean
  showLabels?: boolean
  title?: string
}

export function renderStarChartSVG(
  constellations: Constellation[],
  allStars: Star[],
  options: StarChartOptions = {}
): string {
  const {
    width = 1000,
    height = 1000,
    backgroundColor = '#0a0a1a',
    showGrid = false,
    showLabels = true,
    title,
  } = options

  const lines: string[] = []

  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`)
  lines.push(`<rect width="${width}" height="${height}" fill="${backgroundColor}"/>`)

  if (showGrid) {
    lines.push('<g stroke="rgba(255,255,255,0.05)" stroke-width="0.5">')
    for (let x = 0; x <= width; x += 100) {
      lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}"/>`)
    }
    for (let y = 0; y <= height; y += 100) {
      lines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}"/>`)
    }
    lines.push('</g>')
  }

  // Draw constellation lines
  lines.push('<g stroke="rgba(150,180,255,0.4)" stroke-width="1" stroke-linecap="round">')
  for (const constellation of constellations) {
    for (const [i, j] of constellation.connections) {
      const s1 = constellation.stars[i]
      const s2 = constellation.stars[j]
      if (s1?.px !== undefined && s1?.py !== undefined && s2?.px !== undefined && s2?.py !== undefined) {
        lines.push(`<line x1="${s1.px}" y1="${s1.py}" x2="${s2.px}" y2="${s2.py}"/>`)
      }
    }
  }
  lines.push('</g>')

  // Draw all stars
  lines.push('<g>')
  for (const star of allStars) {
    if (star.px === undefined || star.py === undefined) continue
    const r = magnitudeToRadius(star.mag)
    const color = star.colorIndex !== undefined ? colorFromColorIndex(star.colorIndex) : '#ffffff'

    // Glow
    if (r > 2) {
      lines.push(`<circle cx="${star.px}" cy="${star.py}" r="${r * 3}" fill="${color}" opacity="0.15"/>`)
    }
    // Star dot
    lines.push(`<circle cx="${star.px}" cy="${star.py}" r="${r}" fill="${color}"/>`)
  }
  lines.push('</g>')

  // Draw constellation labels
  if (showLabels) {
    lines.push('<g fill="rgba(200,220,255,0.8)" font-family="Inter, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">')
    for (const constellation of constellations) {
      const starsWithPos = constellation.stars.filter(s => s.px !== undefined && s.py !== undefined)
      if (starsWithPos.length === 0) continue
      const cx = starsWithPos.reduce((sum, s) => sum + (s.px || 0), 0) / starsWithPos.length
      const cy = starsWithPos.reduce((sum, s) => sum + (s.py || 0), 0) / starsWithPos.length
      lines.push(`<text x="${cx}" y="${cy - 15}">${escapeXml(constellation.name)}</text>`)
    }
    lines.push('</g>')
  }

  // Title
  if (title) {
    lines.push(`<text x="${width / 2}" y="30" fill="rgba(200,220,255,0.9)" font-family="Inter, sans-serif" font-size="18" font-weight="bold" text-anchor="middle">${escapeXml(title)}</text>`)
  }

  lines.push('</svg>')
  return lines.join('\n')
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
