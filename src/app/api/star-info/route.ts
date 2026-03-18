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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const ra = searchParams.get('ra')
  const dec = searchParams.get('dec')
  const name = searchParams.get('name')
  const radius = searchParams.get('radius') || '5'  // arcseconds

  try {
    let simbadData: SimbadResult | null = null

    if (name) {
      // Query by name
      const query = encodeURIComponent(`SELECT main_id, otype_txt, sp_type, plx_value, rvz_radvel FROM basic WHERE main_id = '${name.replace(/'/g, "''")}'`)
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
      // Cone search by coordinates
      const url = `https://simbad.cds.unistra.fr/simbad/sim-coo?Coord=${ra}+${dec}&CooFrame=FK5&CooEpoch=2000&CooEqui=2000&CooDefinedFrames=none&Radius=${radius}&Radius.unit=arcsec&submit=submit+query&output.format=JSON`

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
