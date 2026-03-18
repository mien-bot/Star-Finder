'use client'

import { useState, useCallback } from 'react'
import type { AnalysisResult } from '@/lib/types'

type AnalysisStatus = 'idle' | 'uploading' | 'plate-solving' | 'cross-referencing' | 'complete' | 'error'

interface UseAnalysisReturn {
  analyze: (file: File) => Promise<void>
  status: AnalysisStatus
  progress: number
  result: AnalysisResult | null
  error: string | null
  reset: () => void
  useFallback: () => Promise<void>
}

export function useAnalysis(): UseAnalysisReturn {
  const [status, setStatus] = useState<AnalysisStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentImage, setCurrentImage] = useState<string | null>(null)
  const [imageDims, setImageDims] = useState({ width: 1000, height: 1000 })

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const getImageDimensions = (dataUrl: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.width, height: img.height })
      img.onerror = () => resolve({ width: 1000, height: 1000 })
      img.src = dataUrl
    })
  }

  const analyze = useCallback(async (file: File) => {
    try {
      setStatus('uploading')
      setProgress(10)
      setError(null)
      setResult(null)

      const base64 = await fileToBase64(file)
      setCurrentImage(base64)

      const dims = await getImageDimensions(base64)
      setImageDims(dims)

      setStatus('plate-solving')
      setProgress(30)

      // Submit to analysis API
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          width: dims.width,
          height: dims.height,
        }),
      })

      setProgress(70)
      setStatus('cross-referencing')

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Analysis failed (${response.status})`)
      }

      const analysisResult: AnalysisResult = await response.json()

      setProgress(100)
      setStatus('complete')
      setResult(analysisResult)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Analysis failed')
    }
  }, [])

  const useFallback = useCallback(async () => {
    if (!currentImage) {
      setError('No image to analyze')
      return
    }

    try {
      setStatus('plate-solving')
      setProgress(30)
      setError(null)

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: currentImage,
          width: imageDims.width,
          height: imageDims.height,
          useFallback: true,
        }),
      })

      setProgress(80)
      setStatus('cross-referencing')

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || 'Fallback analysis failed')
      }

      const analysisResult: AnalysisResult = await response.json()

      setProgress(100)
      setStatus('complete')
      setResult(analysisResult)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Fallback analysis failed')
    }
  }, [currentImage, imageDims])

  const reset = useCallback(() => {
    setStatus('idle')
    setProgress(0)
    setResult(null)
    setError(null)
    setCurrentImage(null)
  }, [])

  return { analyze, status, progress, result, error, reset, useFallback }
}
