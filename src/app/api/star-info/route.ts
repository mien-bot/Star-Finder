import { NextRequest, NextResponse } from 'next/server'

interface SimbadResult {
  mainId: string
  objectType: string
  spectralType?: string
  properMotion?: { ra: number; dec: number }
  parallax?: number
  distance?: number
  magnitude?: { V?: number; B?: number }
  references?: number
}

// Validate and sanitize a star name to prevent ADQL injection
function sanitizeStarName(name: string): string | null {
  // Allow only alphanumeric, spaces, hyphens, plus signs, periods, and Greek letters
  const cleaned = name.trim().slice(0, 100)
  if (!/^[a-zA-Z0-9\s\-+.*αβγδεζηθικλμνξοπρστυφχψω]+$/.test(cleaned)) {
    return null
  }
  return cleaned.replace(/'/g, "''")
}

// Validate a numeric coordinate parameter
function validateNumeric(value: string, min: number, max: number): number | null {
  const num = parseFloat(value)
  if (isNaN(num) || num < min || num > max) return null
  return num
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const ra = searchParams.get('ra')
  const dec = searchParams.get('dec')
  const name = searchParams.get('name')
  const radius = searchParams.get('radius') || '5'  // arcseconds

  try {
    let simbadData: SimbadResult | null = null

    if (name) {
      const safeName = sanitizeStarName(name)
      if (!safeName) {
        return NextResponse.json({ error: 'Invalid star name' }, { status: 400 })
      }
      // Query by name using parameterized-style safe string
      const query = encodeURIComponent(`SELECT main_id, otype_txt, sp_type, plx_value, rvz_radvel FROM basic WHERE main_id = '${safeName}'`)
      const url = `https://simbad.cds.unistra.fr/simbad/sim-tap/sync?request=doQuery&lang=adql&format=json&query=${query}`

      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        if (data.data && data.data.length > 0) {
          const row = data.data[0]
          simbadData = {
            mainId: row[0] || name,
            objectType: row[1] || 'Star',
            spectralType: row[2] || undefined,
            distance: row[3] ? 1000 / row[3] : undefined,
          }
        }
      }
    } else if (ra && dec) {
      // Validate numeric coordinates
      const safeRA = validateNumeric(ra, 0, 360)
      const safeDec = validateNumeric(dec, -90, 90)
      const safeRadius = validateNumeric(radius, 0.1, 60)
      if (safeRA === null || safeDec === null || safeRadius === null) {
        return NextResponse.json({ error: 'Invalid coordinates or radius' }, { status: 400 })
      }
      // Cone search by coordinates
      const url = `https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=${safeRA}+${safeDec}&CooFrame=FK5&CooEpoch=2000&CooEqui=2000&CooDefinedFrames=none&Radius=${safeRadius}&Radius.unit=arcsec&submit=submit+query&output.format=JSON`

      const res = await fetch(url)
      if (res.ok) {
        const text = await res.text()
        try {
          const data = JSON.parse(text)
          if (data.data && data.data.length > 0) {
            const row = data.data[0]
            simbadData = {
              mainId: row.MAIN_ID || `${ra}, ${dec}`,
              objectType: row.OTYPE || 'Star',
              spectralType: row.SP_TYPE || undefined,
            }
          }
        } catch {
          // SIMBAD sometimes returns non-JSON, handle gracefully
        }
      }
    }

    if (!simbadData) {
      return NextResponse.json({ error: 'Object not found in SIMBAD' }, { status: 404 })
    }

    return NextResponse.json(simbadData)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'SIMBAD query failed' },
      { status: 500 }
    )
  }
}
