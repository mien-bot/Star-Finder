// scripts/process-hyg.ts
// Usage: npx tsx scripts/process-hyg.ts [path-to-hyg-csv]
// Downloads or reads HYG v3.8 catalog, filters to naked-eye stars, outputs JSON

import * as fs from 'fs'
import * as path from 'path'
import * as zlib from 'zlib'

interface HYGEntry {
  id: number
  hip?: number
  name?: string
  bf?: string
  ra: number
  dec: number
  mag: number
  ci?: number
  con?: string
  sp?: string
}

async function main() {
  const csvPath = process.argv[2]
  let csvData: string

  if (csvPath && fs.existsSync(csvPath)) {
    console.log(`Reading HYG catalog from ${csvPath}`)
    if (csvPath.endsWith('.gz')) {
      const compressed = fs.readFileSync(csvPath)
      csvData = zlib.gunzipSync(compressed).toString('utf-8')
    } else {
      csvData = fs.readFileSync(csvPath, 'utf-8')
    }
  } else {
    console.log('Downloading HYG v3.8 catalog (gzipped)...')
    const url = 'https://raw.githubusercontent.com/astronexus/HYG-Database/master/hyg/v3/hyg_v38.csv.gz'
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to download: ${res.status}`)
    const arrayBuffer = await res.arrayBuffer()
    const compressed = Buffer.from(arrayBuffer)
    csvData = zlib.gunzipSync(compressed).toString('utf-8')
    console.log('Download and decompress complete')
  }

  const lines = csvData.split('\n')
  // Headers may be quoted with double quotes
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim())

  // Find column indices
  const idx = (name: string) => headers.indexOf(name)
  const idIdx = idx('id')
  const hipIdx = idx('hip')
  const properIdx = idx('proper')
  const bfIdx = idx('bf')
  const raIdx = idx('ra')
  const decIdx = idx('dec')
  const magIdx = idx('mag')
  const ciIdx = idx('ci')
  const conIdx = idx('con')
  const spIdx = idx('spect')

  console.log(`Headers found: id=${idIdx}, hip=${hipIdx}, proper=${properIdx}, ra=${raIdx}, dec=${decIdx}, mag=${magIdx}, ci=${ciIdx}, con=${conIdx}, spect=${spIdx}`)
  console.log(`Parsing ${lines.length - 1} rows...`)

  const stars: HYGEntry[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const cols = line.split(',').map(c => c.replace(/^"|"$/g, ''))
    const mag = parseFloat(cols[magIdx])

    // Filter: naked-eye visible (mag < 6.5)
    if (isNaN(mag) || mag >= 6.5) continue

    const ra = parseFloat(cols[raIdx])
    const dec = parseFloat(cols[decIdx])
    if (isNaN(ra) || isNaN(dec)) continue

    const entry: HYGEntry = {
      id: parseInt(cols[idIdx]) || i,
      ra: Math.round(ra * 100000) / 100000,
      dec: Math.round(dec * 100000) / 100000,
      mag: Math.round(mag * 100) / 100,
    }

    const hip = parseInt(cols[hipIdx])
    if (!isNaN(hip) && hip > 0) entry.hip = hip

    const name = cols[properIdx]?.trim()
    if (name && name.length > 0) entry.name = name

    const bf = cols[bfIdx]?.trim()
    if (bf && bf.length > 0) entry.bf = bf

    const ci = parseFloat(cols[ciIdx])
    if (!isNaN(ci)) entry.ci = Math.round(ci * 1000) / 1000

    const con = cols[conIdx]?.trim()
    if (con && con.length > 0) entry.con = con

    const sp = cols[spIdx]?.trim()
    if (sp && sp.length > 0) entry.sp = sp

    stars.push(entry)
  }

  // Sort by magnitude (brightest first)
  stars.sort((a, b) => a.mag - b.mag)

  console.log(`Filtered to ${stars.length} naked-eye stars (mag < 6.5)`)

  // Ensure output directory exists
  const outDir = path.join(process.cwd(), 'public', 'data')
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  // Write compact JSON
  const outPath = path.join(outDir, 'hyg-bright.json')
  fs.writeFileSync(outPath, JSON.stringify(stars))
  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2)
  console.log(`Written to ${outPath} (${sizeMB} MB)`)

  // Generate constellation index
  const conIndex: Record<string, number[]> = {}
  for (const star of stars) {
    if (star.con) {
      if (!conIndex[star.con]) conIndex[star.con] = []
      conIndex[star.con].push(star.id)
    }
  }
  const indexPath = path.join(outDir, 'constellation-index.json')
  fs.writeFileSync(indexPath, JSON.stringify(conIndex))
  console.log(`Constellation index written to ${indexPath} (${Object.keys(conIndex).length} constellations)`)
}

main().catch(console.error)
