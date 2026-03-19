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

  // Resize image to max dimension and return as base64 data URL + dimensions
  const MAX_DIMENSION = 2000
  const resizeImage = (file: File): Promise<{ dataUrl: string; width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = reject
      reader.onload = () => {
        const img = new Image()
        img.onerror = () => reject(new Error('Failed to load image'))
        img.onload = () => {
          let { width, height } = img

          // Downscale if needed
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            const scale = MAX_DIMENSION / Math.max(width, height)
            width = Math.round(width * scale)
            height = Math.round(height * scale)
          }

          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(img, 0, 0, width, height)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
          resolve({ dataUrl, width, height })
        }
        img.src = reader.result as string
      }
      reader.readAsDataURL(file)
    })
  }

  const analyze = useCallback(async (file: File) => {
    try {
      setStatus('uploading')
      setProgress(10)
      setError(null)
      setResult(null)

      const { dataUrl, width, height } = await resizeImage(file)
      setCurrentImage(dataUrl)

      const dims = { width, height }
      setImageDims(dims)

      setStatus('plate-solving')
      setProgress(30)

      // Submit to analysis API
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: dataUrl,
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
