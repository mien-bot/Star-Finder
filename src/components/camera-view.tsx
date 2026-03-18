"use client"

import { useEffect, useRef, useState } from "react"
import { localSiderealTime, raDecToAltAz, projectToCamera } from "@/lib/celestial"
import { constellationLines, constellationNames } from "@/lib/constellation-lines"
import { X, Compass, MapPin, Camera, Play, AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CatalogStar {
  id: number
  hip?: number
  ra: number
  dec: number
  mag: number
  name?: string
  con?: string
}

interface ProjectedStar {
  x: number
  y: number
  mag: number
  hip?: number
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
  const orientationRef = useRef({ alpha: 0, beta: 90, gamma: 0 })
  const animFrameRef = useRef<number>(0)

  const [active, setActive] = useState(false)
  const [catalogOk, setCatalogOk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState("Loading star catalog...")
  const [hasCompass, setHasCompass] = useState(false)
  const [hasCamera, setHasCamera] = useState(false)

  // Load catalog on mount
  useEffect(() => {
    fetch("/data/hyg-bright.json")
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: CatalogStar[]) => {
        starsRef.current = data.filter(s => s.mag < 5.5)
        setCatalogOk(true)
        setStatus("Ready — tap Start")
      })
      .catch(err => {
        setError(`Failed to load star catalog: ${err.message}`)
        setStatus("")
      })
  }, [])

  // Start with GPS
  async function handleStart() {
    setError(null)
    setStatus("Requesting GPS location...")

    try {
      if (!navigator.geolocation) throw new Error("Geolocation not supported by this browser")

      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 10000, maximumAge: 0,
        })
      })
      locationRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setStatus(`Got location: ${pos.coords.latitude.toFixed(1)}°, ${pos.coords.longitude.toFixed(1)}°`)
    } catch (err: any) {
      const msg = err?.code === 1
        ? "Location permission denied. Tap 'Use Approximate Location' instead."
        : `GPS failed: ${err?.message || "unknown error"}`
      setError(msg)
      setStatus("")
      return
    }

    await finishSetup()
  }

  // Start without GPS — use IP geolocation
  async function handleSkipGPS() {
    setError(null)
    setStatus("Getting approximate location...")

    try {
      const r = await fetch("https://ipapi.co/json/")
      if (!r.ok) throw new Error("IP lookup failed")
      const data = await r.json()
      if (data.latitude && data.longitude) {
        locationRef.current = { lat: data.latitude, lng: data.longitude }
        setStatus(`Approximate: ${data.city || "?"}, ${data.country_name || "?"}`)
      } else {
        throw new Error("No coordinates returned")
      }
    } catch {
      // Fallback to a default
      locationRef.current = { lat: 40.7, lng: -74.0 }
      setStatus("Using default location")
    }

    await finishSetup()
  }

  async function finishSetup() {
    // Compass
    setStatus("Checking compass...")
    try {
      const DOE = DeviceOrientationEvent as any
      if (typeof DOE.requestPermission === "function") {
        await DOE.requestPermission()
      }
      let got = false
      const handler = (e: DeviceOrientationEvent) => {
        if (e.alpha !== null) {
          orientationRef.current = { alpha: e.alpha || 0, beta: e.beta || 0, gamma: e.gamma || 0 }
          got = true
        }
      }
      window.addEventListener("deviceorientation", handler, true)
      await new Promise(r => setTimeout(r, 800))
      setHasCompass(got)
    } catch { /* compass optional */ }

    // Camera
    setStatus("Checking camera...")
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        if (videoRef.current) videoRef.current.srcObject = stream
        setHasCamera(true)
      }
    } catch { /* camera optional */ }

    // Retry catalog if needed
    if (!starsRef.current.length) {
      setStatus("Loading star catalog...")
      try {
        const r = await fetch("/data/hyg-bright.json")
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data: CatalogStar[] = await r.json()
        starsRef.current = data.filter(s => s.mag < 5.5)
      } catch (err: any) {
        setError(`Star catalog failed: ${err.message}`)
        return
      }
    }

    setStatus("")
    setActive(true)
  }

  // Cleanup
  useEffect(() => {
    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop())
      }
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [])

  // Render loop
  useEffect(() => {
    if (!active) return

    function render() {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) { animFrameRef.current = requestAnimationFrame(render); return }

      const w = container.clientWidth
      const h = container.clientHeight
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      ctx.clearRect(0, 0, w, h)
      if (!hasCamera) { ctx.fillStyle = "#0a0e1a"; ctx.fillRect(0, 0, w, h) }

      const loc = locationRef.current
      const stars = starsRef.current
      if (!loc || !stars.length) { animFrameRef.current = requestAnimationFrame(render); return }

      const orient = orientationRef.current
      const lst = localSiderealTime(new Date(), loc.lng)
      const camAlt = 90 - orient.beta
      const camAz = orient.alpha
      const camRoll = orient.gamma

      const projected: ProjectedStar[] = []
      for (const star of stars) {
        const { alt, az } = raDecToAltAz(star.ra * 15, star.dec, loc.lat, lst)
        if (alt < -5) continue
        const pos = projectToCamera(alt, az, camAlt, camAz, camRoll, 65, w, h)
        if (pos) projected.push({ x: pos.x, y: pos.y, mag: star.mag, hip: star.hip })
      }

      const hipMap = new Map<number, ProjectedStar>()
      for (const s of projected) { if (s.hip) hipMap.set(s.hip, s) }

      const labels = new Map<string, { cx: number; cy: number; n: number }>()
      const connected = new Set<number>()

      for (const [abbr, lines] of Object.entries(constellationLines)) {
        for (const [h1, h2] of lines) {
          const s1 = hipMap.get(h1), s2 = hipMap.get(h2)
          if (s1 && s2) {
            ctx.strokeStyle = "rgba(150,180,255,0.5)"
            ctx.lineWidth = 1.5
            ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke()
            connected.add(h1); connected.add(h2)
            const e = labels.get(abbr) || { cx: 0, cy: 0, n: 0 }
            e.cx += s1.x + s2.x; e.cy += s1.y + s2.y; e.n += 2
            labels.set(abbr, e)
          }
        }
      }

      for (const star of projected) {
        const isCon = star.hip ? connected.has(star.hip) : false
        if (!isCon && star.mag > 3.5) continue
        const sz = isCon ? Math.max(2, 5 - star.mag * 0.7) : Math.max(0.8, 2.5 - star.mag * 0.4)
        const op = isCon ? 1 : 0.4
        const g = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, sz * 2.5)
        g.addColorStop(0, `rgba(200,220,255,${op * 0.7})`); g.addColorStop(1, "transparent")
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(star.x, star.y, sz * 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = `rgba(255,255,255,${op})`; ctx.beginPath(); ctx.arc(star.x, star.y, sz, 0, Math.PI * 2); ctx.fill()
      }

      ctx.font = "bold 14px Inter,sans-serif"; ctx.textAlign = "center"
      ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 4
      for (const [abbr, e] of labels) {
        ctx.fillStyle = "rgba(200,220,255,0.9)"
        ctx.fillText(constellationNames[abbr] || abbr, e.cx / e.n, e.cy / e.n - 15)
      }
      ctx.shadowBlur = 0
      animFrameRef.current = requestAnimationFrame(render)
    }

    animFrameRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [active, hasCamera])

  if (!active) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-center text-white max-w-sm px-6">
          <Compass className="w-16 h-16 mx-auto mb-6 text-primary opacity-70" />
          <h2 className="text-2xl font-bold mb-3">Live Sky View</h2>
          <p className="text-sm text-white/60 mb-6">
            Point your phone at the sky to see constellations in real time.
          </p>

          {status && (
            <p className="text-blue-300 text-sm mb-4 flex items-center justify-center gap-2">
              {status.includes("Ready") ? null : <Loader2 className="w-3 h-3 animate-spin" />}
              {status}
            </p>
          )}

          {error && (
            <div className="bg-red-900/40 rounded-lg p-3 mb-4 text-left text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} className="flex-1 border-white/20 text-white hover:bg-white/10">
                Cancel
              </Button>
              <Button onClick={handleStart} disabled={!catalogOk} className="flex-1 bg-primary hover:bg-primary/90">
                <Play className="w-4 h-4 mr-2" />
                {catalogOk ? "Start" : "Loading..."}
              </Button>
            </div>
            <Button onClick={handleSkipGPS} variant="outline" className="w-full border-white/20 text-white/70 hover:bg-white/10">
              <MapPin className="w-4 h-4 mr-2" />
              Use Approximate Location
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-black">
      <video ref={videoRef} autoPlay playsInline muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{ display: hasCamera ? "block" : "none" }} />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center gap-3 text-xs text-white/70">
          <span><MapPin className="w-3.5 h-3.5 inline" /> GPS</span>
          <span><Compass className="w-3.5 h-3.5 inline" /> {hasCompass ? "Compass" : "Fixed"}</span>
          {hasCamera && <span><Camera className="w-3.5 h-3.5 inline" /> Cam</span>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/10">
          <X className="w-5 h-5" />
        </Button>
      </div>
    </div>
  )
}
