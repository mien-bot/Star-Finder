"use client"

import { useEffect, useRef, useState } from "react"
import type { Constellation } from "@/lib/constellation-data"

interface CanvasOverlayProps {
  imageUrl: string
  constellations: Constellation[]
  showLines: boolean
  showLabels: boolean
  highlightedConstellation: string | null
  onImageLoad?: (dimensions: { width: number; height: number }) => void
}

export function CanvasOverlay({
  imageUrl,
  constellations,
  showLines,
  showLabels,
  highlightedConstellation,
  onImageLoad,
}: CanvasOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 })
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.src = imageUrl
    img.onload = () => {
      const container = containerRef.current
      if (!container) return

      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight
      const imgAspect = img.width / img.height
      const containerAspect = containerWidth / containerHeight

      let displayWidth: number
      let displayHeight: number

      if (imgAspect > containerAspect) {
        displayWidth = containerWidth
        displayHeight = containerWidth / imgAspect
      } else {
        displayHeight = containerHeight
        displayWidth = containerHeight * imgAspect
      }

      setImageDimensions({ width: displayWidth, height: displayHeight })
      setScale(displayWidth / img.width)
      onImageLoad?.({ width: img.width, height: img.height })
    }
  }, [imageUrl, onImageLoad])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || imageDimensions.width === 0) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = imageDimensions.width
    canvas.height = imageDimensions.height
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    constellations.forEach((constellation) => {
      const isHighlighted =
        highlightedConstellation === constellation.name || !highlightedConstellation
      const opacity = isHighlighted ? 1 : 0.2
      const lineWidth = isHighlighted ? 2 : 1

      // Draw constellation lines
      if (showLines) {
        ctx.strokeStyle = `rgba(150, 180, 255, ${opacity * 0.7})`
        ctx.lineWidth = lineWidth
        ctx.lineCap = "round"
        ctx.shadowColor = "rgba(150, 180, 255, 0.5)"
        ctx.shadowBlur = isHighlighted ? 8 : 0

        constellation.connections.forEach(([startIdx, endIdx]) => {
          const start = constellation.stars[startIdx]
          const end = constellation.stars[endIdx]
          if (start && end) {
            ctx.beginPath()
            ctx.moveTo(start[0] * scale, start[1] * scale)
            ctx.lineTo(end[0] * scale, end[1] * scale)
            ctx.stroke()
          }
        })

        ctx.shadowBlur = 0
      }

      // Draw stars — size based on magnitude (brighter = lower mag = bigger)
      constellation.stars.forEach((star) => {
        const x = star[0] * scale
        const y = star[1] * scale
        const mag = star[2] ?? 3
        // Map magnitude to size: mag 0 → 5px, mag 3 → 3px, mag 5 → 1.5px
        const baseSize = Math.max(1.5, 5 - mag * 0.7)
        const starSize = isHighlighted ? baseSize : baseSize * 0.7

        // Outer glow
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, starSize * 2.5)
        gradient.addColorStop(0, `rgba(200, 220, 255, ${opacity * 0.8})`)
        gradient.addColorStop(0.5, `rgba(150, 180, 255, ${opacity * 0.3})`)
        gradient.addColorStop(1, "transparent")
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(x, y, starSize * 2.5, 0, Math.PI * 2)
        ctx.fill()

        // Inner star
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`
        ctx.beginPath()
        ctx.arc(x, y, starSize, 0, Math.PI * 2)
        ctx.fill()
      })

      // Draw labels
      if (showLabels && isHighlighted) {
        const centerX =
          (constellation.stars.reduce((sum, s) => sum + s[0], 0) / constellation.stars.length) *
          scale
        const centerY =
          (constellation.stars.reduce((sum, s) => sum + s[1], 0) / constellation.stars.length) *
          scale

        ctx.font = "bold 14px Inter, sans-serif"
        ctx.textAlign = "center"
        ctx.fillStyle = `rgba(200, 220, 255, ${opacity})`
        ctx.shadowColor = "rgba(0, 0, 0, 0.8)"
        ctx.shadowBlur = 4
        ctx.fillText(constellation.name, centerX, centerY - 20)
        ctx.shadowBlur = 0
      }
    })
  }, [constellations, showLines, showLabels, highlightedConstellation, imageDimensions, scale])

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center">
      <div className="relative" style={{ width: imageDimensions.width, height: imageDimensions.height }}>
        <img
          src={imageUrl}
          alt="Uploaded night sky"
          className="rounded-lg"
          style={{ width: imageDimensions.width, height: imageDimensions.height }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
        />
      </div>
    </div>
  )
}
