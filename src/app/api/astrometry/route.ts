import { NextRequest, NextResponse } from 'next/server'
import { login, uploadImage, pollSubmission, getJobResults } from '@/lib/astrometry'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { image } = body

    const apiKey = process.env.ASTROMETRY_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'ASTROMETRY_API_KEY not configured' }, { status: 500 })
    }

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '')
    const imageBuffer = Buffer.from(base64Data, 'base64')

    const session = await login(apiKey)
    const subId = await uploadImage(session, imageBuffer, 'upload.jpg')

    return NextResponse.json({ status: 'submitted', subId })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const subId = searchParams.get('subId')
  const jobId = searchParams.get('jobId')

  try {
    if (subId) {
      const res = await fetch(`http://nova.astrometry.net/api/submissions/${subId}`)
      const data = await res.json()
      const job = data.jobs?.find((j: number | null) => j !== null)

      return NextResponse.json({
        status: job ? 'solved' : 'processing',
        jobId: job || null,
        jobs: data.jobs || [],
      })
    }

    if (jobId) {
      const { calibration, annotations } = await getJobResults(parseInt(jobId))
      return NextResponse.json({ status: 'complete', calibration, annotations })
    }

    return NextResponse.json({ error: 'Provide subId or jobId' }, { status: 400 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Query failed' },
      { status: 500 }
    )
  }
}
