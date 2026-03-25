import { NextRequest, NextResponse } from 'next/server'
import { platesolve } from '@/lib/astrometry'
import { projectStarsToImage, pixelToCanvas } from '@/lib/coordinates'
import { constellationLines, constellationNames } from '@/lib/constellation-lines'
import { analyzeWithGPT4o } from '@/lib/gpt4o-stars'
import type { Star, Constellation, AnalysisResult } from '@/lib/types'
import * as fs from 'fs'
import * as path from 'path'

// Load star catalog server-side
function loadStarCatalogSync(): Star[] {
  try {
    const dataPath = path.join(process.cwd(), 'public', 'data', 'hyg-bright.json')
    if (!fs.existsSync(dataPath)) return []
    const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
    return raw.map((e: any) => {
      const star: any = {
        id: e.id,
        ra: e.ra * 15,  // hours to degrees
        dec: e.dec,
        mag: e.mag,
      }
      if (e.hip) star.hip = e.hip
      if (e.name) star.name = e.name
      if (e.bf) star.bf = e.bf
      if (e.ci !== undefined) star.colorIndex = e.ci
      if (e.con) star.constellation = e.con
      if (e.sp) star.spectralType = e.sp
      return star as Star
    })
  } catch {
    return []
  }
}

// Build constellations from projected stars — only include stick-figure stars
function buildConstellations(projectedStars: Star[]): Constellation[] {
  const constellationMap = new Map<string, Star[]>()
  for (const star of projectedStars) {
    if (star.constellation) {
      const existing = constellationMap.get(star.constellation) || []
      existing.push(star)
      constellationMap.set(star.constellation, existing)
    }
  }

  const constellations: Constellation[] = []

  for (const [abbr, allStars] of constellationMap.entries()) {
    if (allStars.length < 2) continue

    const lines = constellationLines[abbr] || []
    const hipToStar = new Map<number, Star>()
    for (const s of allStars) {
      if (s.hip) hipToStar.set(s.hip, s)
    }

    // Collect only stars that participate in at least one connection
    const usedHips = new Set<number>()
    for (const [hip1, hip2] of lines) {
      if (hipToStar.has(hip1) && hipToStar.has(hip2)) {
        usedHips.add(hip1)
        usedHips.add(hip2)
      }
    }

    if (usedHips.size < 2) continue

    // Build the filtered star list and index mapping
    const stars: Star[] = []
    const hipToIdx = new Map<number, number>()
    for (const hip of usedHips) {
      const star = hipToStar.get(hip)!
      hipToIdx.set(hip, stars.length)
      stars.push(star)
    }

    // Build connections using new indices
    const connections: [number, number][] = []
    for (const [hip1, hip2] of lines) {
      const i1 = hipToIdx.get(hip1)
      const i2 = hipToIdx.get(hip2)
      if (i1 !== undefined && i2 !== undefined) {
        connections.push([i1, i2])
      }
    }

    if (connections.length === 0) continue

    const name = constellationNames[abbr] || abbr
    const brightest = stars.reduce((a, b) => a.mag < b.mag ? a : b)
    const brightestName = brightest.name ? ` featuring ${brightest.name}` : ''

    constellations.push({
      name,
      abbreviation: abbr,
      stars,
      connections,
      description: `${connections.length} line segments connecting ${stars.length} stars in ${name}${brightestName}`,
      visibility: { season: 'Variable', hemisphere: 'Both' },
    })
  }

  return constellations
}

// Convert star positions to canvas coordinates
function toCanvasCoords(constellations: Constellation[], allStars: Star[], imgWidth: number, imgHeight: number) {
  for (const constellation of constellations) {
    for (const star of constellation.stars) {
      if (star.px !== undefined && star.py !== undefined) {
        const [cx, cy] = pixelToCanvas(star.px, star.py, imgWidth, imgHeight)
        star.px = cx
        star.py = cy
      }
    }
  }

  return allStars.map(s => {
    if (s.px !== undefined && s.py !== undefined) {
      const [cx, cy] = pixelToCanvas(s.px, s.py, imgWidth, imgHeight)
      return { ...s, px: cx, py: cy }
    }
    return s
  })
}

/**
 * Enhance GPT-4o results by using its field estimate to project
 * all catalog stars with proper gnomonic projection.
 * GPT-4o tells us WHERE the camera is pointing, then we use
 * the star catalog + math for accurate star placement.
 */
function enhanceWithCatalog(
  gptResult: AnalysisResult,
  catalog: Star[],
  imgWidth: number,
  imgHeight: number
): AnalysisResult {
  const field = gptResult.fieldEstimate
  if (!field) {
    console.log('No field estimate from GPT-4o, returning raw results')
    return gptResult
  }

  // Build a synthetic calibration from GPT-4o's field estimate
  const cal = {
    ra: field.centerRA * 15,           // hours → degrees
    dec: field.centerDec,               // degrees
    orientation: field.orientation,     // degrees
    pixscale: (field.horizontalFOV * 3600) / imgWidth, // arcsec/pixel
    radius: field.horizontalFOV / 2,   // field radius in degrees
    parity: 1,
    width_arcsec: field.horizontalFOV * 3600,
    height_arcsec: (field.horizontalFOV * imgHeight / imgWidth) * 3600,
  }

  console.log(`GPT-4o field estimate: RA=${field.centerRA.toFixed(1)}h Dec=${field.centerDec > 0 ? '+' : ''}${field.centerDec.toFixed(0)}° FOV=${field.horizontalFOV}° orient=${field.orientation}°`)
  console.log(`Synthetic calibration: RA=${cal.ra.toFixed(1)}° pixscale=${cal.pixscale.toFixed(1)}"/px radius=${cal.radius.toFixed(1)}°`)

  // Project all bright catalog stars using gnomonic projection
  const brightCatalog = catalog.filter(s => s.mag < 5.5)
  const projectedStars = projectStarsToImage(brightCatalog, cal, imgWidth, imgHeight)

  console.log(`Projected ${projectedStars.length} catalog stars onto image (from ${brightCatalog.length} bright stars)`)

  if (projectedStars.length < 5) {
    console.log('Too few projected stars, returning GPT-4o results as-is')
    return gptResult
  }

  // Build constellations from projected catalog stars
  const constellations = buildConstellations(projectedStars)
  console.log(`Built ${constellations.length} constellations from catalog`)

  // Convert pixel coordinates to canvas coordinates (0-1000)
  const canvasStars = toCanvasCoords(constellations, projectedStars, imgWidth, imgHeight)

  const identifiedAbbrs = gptResult.identifiedConstellations || []
  const desc = identifiedAbbrs.length > 0
    ? `Identified constellations: ${identifiedAbbrs.join(', ')}`
    : ''

  return {
    constellations,
    allStars: canvasStars,
    fieldDescription: `Sky region centered at RA ${field.centerRA.toFixed(1)}h, Dec ${field.centerDec > 0 ? '+' : ''}${field.centerDec.toFixed(0)}° (${field.horizontalFOV}° FOV) — ${projectedStars.length} stars, ${constellations.length} constellations. ${desc}`,
    processingTime: gptResult.processingTime,
    source: 'gpt4o-fallback',
    fieldEstimate: field,
    identifiedConstellations: identifiedAbbrs,
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const { image, width, height, useFallback } = body

    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    // Decode base64 image with size limit (20MB max)
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '')
    if (base64Data.length > 20 * 1024 * 1024 * 1.37) { // ~20MB after base64 encoding overhead
      return NextResponse.json({ error: 'Image too large (max 20MB)' }, { status: 413 })
    }
    const imageBuffer = Buffer.from(base64Data, 'base64')
    const imgWidth = width || 1000
    const imgHeight = height || 1000

    const allCatalogStars = loadStarCatalogSync()

    // Try Astrometry.net and GPT-4o in parallel for speed.
    // Astrometry.net is more accurate but slow; GPT-4o is fast but approximate.
    // Use whichever finishes successfully first, preferring astrometry if both succeed.
    const apiKey = process.env.ASTROMETRY_API_KEY
    const openaiKey = process.env.OPENAI_API_KEY

    if (apiKey && !useFallback && openaiKey) {
      // Race both: fast GPT-4o result with slow-but-accurate astrometry
      const gpt4oPromise = analyzeWithGPT4o(base64Data, imgWidth, imgHeight)
        .then(result => ({ type: 'gpt4o' as const, result }))
        .catch(err => { console.error('GPT-4o failed:', err); return null })

      const astrometryPromise = platesolve(apiKey, imageBuffer)
        .then(result => ({ type: 'astrometry' as const, result }))
        .catch(err => { console.error('Astrometry.net failed:', err); return null })

      // Wait for GPT-4o first (fast), then check if astrometry finishes quickly too
      const gpt4oResult = await gpt4oPromise

      // Give astrometry a short window to finish if it's close
      const astrometryResult = await Promise.race([
        astrometryPromise,
        new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
      ])

      // Prefer astrometry if it resolved in time
      if (astrometryResult?.type === 'astrometry') {
        const result = astrometryResult.result
        const projectedStars = projectStarsToImage(allCatalogStars, result.calibration, imgWidth, imgHeight)
        const constellations = buildConstellations(projectedStars)
        const canvasStars = toCanvasCoords(constellations, projectedStars, imgWidth, imgHeight)

        const analysisResult: AnalysisResult = {
          constellations,
          allStars: canvasStars,
          calibration: result.calibration,
          fieldDescription: `Field centered at RA ${result.calibration.ra.toFixed(2)}°, Dec ${result.calibration.dec.toFixed(2)}° with ${result.calibration.radius.toFixed(1)}° field of view`,
          processingTime: Date.now() - startTime,
          source: 'astrometry',
        }

        return NextResponse.json(analysisResult)
      }

      // Use GPT-4o result
      if (gpt4oResult) {
        const fallbackResult = gpt4oResult.result
        fallbackResult.processingTime = Date.now() - startTime
        const enhanced = enhanceWithCatalog(fallbackResult, allCatalogStars, imgWidth, imgHeight)
        enhanced.processingTime = Date.now() - startTime
        return NextResponse.json(enhanced)
      }

      // Both failed — fall through to sequential GPT-4o attempt below
    } else if (apiKey && !useFallback) {
      // No OpenAI key — try astrometry only
      try {
        const result = await platesolve(apiKey, imageBuffer)

        const projectedStars = projectStarsToImage(allCatalogStars, result.calibration, imgWidth, imgHeight)
        const constellations = buildConstellations(projectedStars)
        const canvasStars = toCanvasCoords(constellations, projectedStars, imgWidth, imgHeight)

        const analysisResult: AnalysisResult = {
          constellations,
          allStars: canvasStars,
          calibration: result.calibration,
          fieldDescription: `Field centered at RA ${result.calibration.ra.toFixed(2)}°, Dec ${result.calibration.dec.toFixed(2)}° with ${result.calibration.radius.toFixed(1)}° field of view`,
          processingTime: Date.now() - startTime,
          source: 'astrometry',
        }

        return NextResponse.json(analysisResult)
      } catch (err) {
        console.error('Astrometry.net failed:', err)
      }
    }

    // GPT-4o fallback (sequential — either no astrometry key, or parallel both failed)
    const fallbackResult = await analyzeWithGPT4o(base64Data, imgWidth, imgHeight)
    fallbackResult.processingTime = Date.now() - startTime

    // Enhance GPT-4o results with full catalog cross-referencing
    const enhanced = enhanceWithCatalog(fallbackResult, allCatalogStars, imgWidth, imgHeight)
    enhanced.processingTime = Date.now() - startTime

    return NextResponse.json(enhanced)
  } catch (err) {
    console.error('Analysis error:', err)
    return NextResponse.json(
      { error: 'Analysis failed', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
