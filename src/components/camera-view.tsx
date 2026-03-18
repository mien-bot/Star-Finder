"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { localSiderealTime, raDecToAltAz, projectToCamera } from "@/lib/celestial"
import { constellationLines, constellationNames } from "@/lib/constellation-lines"
import { X, Compass, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CatalogStar {
  id: number
  hip?: number
  ra: number   // hours in catalog
  dec: number
  mag: number
  name?: string
  con?: string
}

interface ProjectedStar {
  x: number
  y: number
  mag: number
  name?: string
  hip?: number
  con?: string
}

interface CameraViewProps {
  onClose: () => void
}

export function CameraView({ onClose }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const starsRef = useRef<CatalogStar[]>([])
  const locationRef = useRef<{ lat: number; lng: number } | null>(null)
  const orientationRef = useRef<{ alpha: number; beta: number; gamma: number }>({ alpha: 0, beta: 90, gamma: 0 })
  const animFrameRef = useRef<number>(0)

  const [hasLocation, setHasLocation] = useState(false)
  const [hasOrientation, setHasOrientation] = useState(false)
  const [hasCamera, setHasCamera] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState("")

  // Load star catalog
  useEffect(() => {
    fetch("/data/hyg-bright.json")
      .then(r => r.json())
      .then((data: CatalogStar[]) => {
        // Filter to bright stars for performance (mag < 5.5)
        starsRef.current = data.filter(s => s.mag < 5.5)
      })
      .catch(() => setError("Failed to load star catalog"))
  }, [])

  // Get GPS location
  useEffect(() => {
    if (!navigator.geolocation) {
      setError("Geolocation not available")
      return
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        locationRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setHasLocation(true)
      },
      err => setError(`Location error: ${err.message}`),
      { enableHighAccuracy: true }
    )
  }, [])

  // Get device orientation
  useEffect(() => {
    const requestPermission = async () => {
      // iOS requires explicit permission request
      const DOE = DeviceOrientationEvent as any
      if (typeof DOE.requestPermission === "function") {
        try {
          const perm = await DOE.requestPermission()
          if (perm !== "granted") {
            setError("Orientation permission denied")
            return
          }
        } catch {
          setError("Could not request orientation permission")
          return
        }
      }

      const handler = (e: DeviceOrientationEvent) => {
        if (e.alpha !== null) {
          orientationRef.current = {
            alpha: e.alpha || 0,
            beta: e.beta || 0,
            gamma: e.gamma || 0,
          }
          setHasOrientation(true)
        }
      }
      window.addEventListener("deviceorientation", handler, true)
      return () => window.removeEventListener("deviceorientation", handler, true)
    }

    requestPermission()
  }, [])

  // Start camera
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          setHasCamera(true)
        }
      } catch {
        // Camera not available — still useful without it as a star map
        setHasCamera(false)
      }
    }
    startCamera()

    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach(t => t.stop())
      }
    }
  }, [])

  // Render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) {
      animFrameRef.current = requestAnimationFrame(render)
      return
    }

    const w = container.clientWidth
    const h = container.clientHeight
    canvas.width = w
    canvas.height = h

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    ctx.clearRect(0, 0, w, h)

    // If no camera, draw dark sky background
    if (!hasCamera) {
      ctx.fillStyle = "#0a0e1a"
      ctx.fillRect(0, 0, w, h)
    }

    const loc = locationRef.current
    const orient = orientationRef.current
    const stars = starsRef.current

    if (!loc || !stars.length) {
      animFrameRef.current = requestAnimationFrame(render)
      return
    }

    const now = new Date()
    const lst = localSiderealTime(now, loc.lng)

    // Camera pointing direction from device orientation
    // In portrait mode: beta=90 → horizon, beta=0 → zenith
    const camAlt = 90 - orient.beta
    const camAz = orient.alpha
    const camRoll = orient.gamma

    const hFov = 65 // typical smartphone camera FOV

    // Project stars
    const projected: ProjectedStar[] = []
    for (const star of stars) {
      const raDeg = star.ra * 15 // hours to degrees
      const { alt, az } = raDecToAltAz(raDeg, star.dec, loc.lat, lst)

      if (alt < -5) continue // below horizon

      const pos = projectToCamera(alt, az, camAlt, camAz, camRoll, hFov, w, h)
      if (pos) {
        projected.push({
          x: pos.x,
          y: pos.y,
          mag: star.mag,
          name: star.name,
          hip: star.hip,
          con: star.con,
        })
      }
    }

    // Build constellation connections for visible stars
    const hipToProjected = new Map<number, ProjectedStar>()
    for (const s of projected) {
      if (s.hip) hipToProjected.set(s.hip, s)
    }

    // Draw constellation lines
    const drawnConstellations = new Map<string, { cx: number; cy: number; count: number }>()

    for (const [abbr, lines] of Object.entries(constellationLines)) {
      let drawn = false
      for (const [hip1, hip2] of lines) {
        const s1 = hipToProjected.get(hip1)
        const s2 = hipToProjected.get(hip2)
        if (s1 && s2) {
          ctx.strokeStyle = "rgba(150, 180, 255, 0.5)"
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(s1.x, s1.y)
          ctx.lineTo(s2.x, s2.y)
          ctx.stroke()
          drawn = true

          // Track constellation center for labels
          const entry = drawnConstellations.get(abbr) || { cx: 0, cy: 0, count: 0 }
          entry.cx += s1.x + s2.x
          entry.cy += s1.y + s2.y
          entry.count += 2
          drawnConstellations.set(abbr, entry)
        }
      }
    }

    // Determine which stars are in constellations (connected)
    const connectedHips = new Set<number>()
    for (const [abbr, lines] of Object.entries(constellationLines)) {
      for (const [hip1, hip2] of lines) {
        if (hipToProjected.has(hip1) && hipToProjected.has(hip2)) {
          connectedHips.add(hip1)
          connectedHips.add(hip2)
        }
      }
    }

    // Draw stars — constellation stars bigger, others very subtle
    for (const star of projected) {
      const isConstStar = star.hip ? connectedHips.has(star.hip) : false
      if (!isConstStar && star.mag > 3.5) continue // skip faint non-constellation stars

      const baseSize = isConstStar
        ? Math.max(2, 5 - star.mag * 0.7)
        : Math.max(0.8, 2.5 - star.mag * 0.4)
      const opacity = isConstStar ? 1 : 0.4

      // Glow
      const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, baseSize * 2.5)
      gradient.addColorStop(0, `rgba(200, 220, 255, ${opacity * 0.7})`)
      gradient.addColorStop(0.5, `rgba(150, 180, 255, ${opacity * 0.2})`)
      gradient.addColorStop(1, "transparent")
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(star.x, star.y, baseSize * 2.5, 0, Math.PI * 2)
      ctx.fill()

      // Core
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`
      ctx.beginPath()
      ctx.arc(star.x, star.y, baseSize, 0, Math.PI * 2)
      ctx.fill()
    }

    // Draw constellation labels
    ctx.font = "bold 14px Inter, sans-serif"
    ctx.textAlign = "center"
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)"
    ctx.shadowBlur = 4
    for (const [abbr, entry] of drawnConstellations) {
      const name = constellationNames[abbr] || abbr
      const cx = entry.cx / entry.count
      const cy = entry.cy / entry.count
      ctx.fillStyle = "rgba(200, 220, 255, 0.9)"
      ctx.fillText(name, cx, cy - 15)
    }
    ctx.shadowBlur = 0

    // Update info display
    const constellationCount = drawnConstellations.size
    const altStr = camAlt.toFixed(0)
    const azStr = camAz.toFixed(0)
    setInfo(`Alt ${altStr}° Az ${azStr}° · ${projected.length} stars · ${constellationCount} constellations`)

    animFrameRef.current = requestAnimationFrame(render)
  }, [hasCamera])

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [render])

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-black">
      {/* Camera video feed */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{ display: hasCamera ? "block" : "none" }}
      />

      {/* Star overlay canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-white/70">
            <MapPin className="w-3.5 h-3.5" />
            <span>{hasLocation ? "GPS locked" : "Waiting for GPS..."}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/70">
            <Compass className="w-3.5 h-3.5" />
            <span>{hasOrientation ? "Compass active" : "No compass data"}</span>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/10">
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Bottom info bar */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4">
        <div className="text-center text-xs text-white/60">{info}</div>
      </div>

      {/* Error display */}
      {error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 bg-red-900/80 text-white text-sm px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      {/* No compass fallback message */}
      {!hasOrientation && hasLocation && (
        <div className="absolute inset-0 flex items-center justify-center z-5">
          <div className="text-center text-white/80 max-w-sm px-6">
            <Compass className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">Point your phone at the sky</p>
            <p className="text-sm text-white/60">
              Device orientation sensors are needed for live sky tracking.
              This feature works best on mobile devices.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
