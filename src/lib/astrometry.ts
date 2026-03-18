export interface AstrometryCalibration {
  ra: number
  dec: number
  orientation: number
  pixscale: number  // arcsec/pixel
  radius: number    // field radius in degrees
  parity: number
  width_arcsec: number
  height_arcsec: number
}

export interface AstrometryAnnotation {
  type: string
  names: string[]
  pixelx: number
  pixely: number
  radius?: number
}

export interface AstrometryResult {
  calibration: AstrometryCalibration
  annotations: AstrometryAnnotation[]
  jobId: number
}

export async function login(apiKey: string): Promise<string> {
  const res = await fetch('http://nova.astrometry.net/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `request-json=${encodeURIComponent(JSON.stringify({ apikey: apiKey }))}`,
  })
  const data = await res.json()
  if (data.status !== 'success') throw new Error(`Login failed: ${data.errormessage || 'unknown error'}`)
  return data.session
}

export async function uploadImage(session: string, imageBuffer: Uint8Array, filename: string): Promise<number> {
  const formData = new FormData()
  formData.append('request-json', JSON.stringify({
    session,
    publicly_visible: 'n',
    allow_modifications: 'n',
    allow_commercial_use: 'n',
    // Scale hints: tell Astrometry.net the approximate field of view
    // This dramatically improves solve rate and speed for wide-field photos
    scale_units: 'degwidth',
    scale_type: 'ul',
    scale_lower: 10,    // minimum 10° wide
    scale_upper: 180,   // maximum 180° wide
    // Downsample large images for faster solving
    downsample_factor: 2,
  }))
  formData.append('file', new Blob([imageBuffer as BlobPart]), filename)

  const res = await fetch('http://nova.astrometry.net/api/upload', {
    method: 'POST',
    body: formData,
  })
  const data = await res.json()
  if (data.status !== 'success') throw new Error(`Upload failed: ${data.errormessage || 'unknown error'}`)
  return data.subid
}

export async function pollSubmission(subId: number, maxWaitMs = 120000): Promise<number> {
  const startTime = Date.now()
  const pollInterval = 3000

  while (Date.now() - startTime < maxWaitMs) {
    const res = await fetch(`http://nova.astrometry.net/api/submissions/${subId}`)
    const data = await res.json()

    if (data.jobs && data.jobs.length > 0) {
      const jobId = data.jobs.find((j: number | null) => j !== null)
      if (jobId) return jobId
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval))
  }

  throw new Error(`Plate solving timed out after ${maxWaitMs / 1000}s`)
}

/**
 * Poll a job until it finishes (success or failure).
 * The submission poll only tells us a job was created — we need to
 * wait for the job itself to complete before fetching calibration data.
 */
export async function pollJob(jobId: number, maxWaitMs = 180000): Promise<void> {
  const startTime = Date.now()
  const pollInterval = 3000

  while (Date.now() - startTime < maxWaitMs) {
    const res = await fetch(`http://nova.astrometry.net/api/jobs/${jobId}`)
    const data = await res.json()

    if (data.status === 'success') return
    if (data.status === 'failure') throw new Error('Plate solving failed — image could not be solved')

    await new Promise(resolve => setTimeout(resolve, pollInterval))
  }

  throw new Error(`Job timed out after ${maxWaitMs / 1000}s`)
}

export async function getJobResults(jobId: number): Promise<{ calibration: AstrometryCalibration; annotations: AstrometryAnnotation[] }> {
  const [infoRes, annotRes] = await Promise.all([
    fetch(`http://nova.astrometry.net/api/jobs/${jobId}/info`),
    fetch(`http://nova.astrometry.net/api/jobs/${jobId}/annotations/`),
  ])

  const info = await infoRes.json()
  const annotations = await annotRes.json()

  if (info.status !== 'success') throw new Error(`Job failed: ${info.status}`)

  const cal = info.calibration
  const calibration: AstrometryCalibration = {
    ra: cal.ra,
    dec: cal.dec,
    orientation: cal.orientation,
    pixscale: cal.pixscale,
    radius: cal.radius,
    parity: cal.parity,
    width_arcsec: cal.width_arcsec,
    height_arcsec: cal.height_arcsec,
  }

  return { calibration, annotations: annotations.annotations || [] }
}

export async function platesolve(apiKey: string, imageBuffer: Uint8Array, filename = 'image.jpg'): Promise<AstrometryResult> {
  console.log('Astrometry.net: logging in...')
  const session = await login(apiKey)

  console.log('Astrometry.net: uploading image...')
  const subId = await uploadImage(session, imageBuffer, filename)

  console.log(`Astrometry.net: polling submission ${subId} for job ID...`)
  const jobId = await pollSubmission(subId)

  console.log(`Astrometry.net: waiting for job ${jobId} to complete...`)
  await pollJob(jobId)

  console.log(`Astrometry.net: fetching results for job ${jobId}...`)
  const { calibration, annotations } = await getJobResults(jobId)

  console.log(`Astrometry.net: solved! RA=${calibration.ra.toFixed(2)}° Dec=${calibration.dec.toFixed(2)}° FOV=${(calibration.width_arcsec / 3600).toFixed(1)}°`)
  return { calibration, annotations, jobId }
}
