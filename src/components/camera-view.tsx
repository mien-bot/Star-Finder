"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { localSiderealTime, raDecToAltAz, projectToCamera } from "@/lib/celestial"
import { constellationLines, constellationNames } from "@/lib/constellation-lines"
import { X, Compass, MapPin, Camera, Play, AlertTriangle, CheckCircle, Loader2 } from "lucide-react"
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
  name?: string
  hip?: number
  con?: string
}

interface CameraViewProps {
  onClose: () => void
}

type PermStatus = "pending" | "requesting" | "granted" | "denied" | "unavailable"

export function CameraView({ onClose }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const starsRef = useRef<CatalogStar[]>([])
  const locationRef = useRef<{ lat: number; lng: number } | null>(null)
  const orientationRef = useRef<{ alpha: number; beta: number; gamma: number }>({ alpha: 0, beta: 90, gamma: 0 })
  const animFrameRef = useRef<number>(0)

  const [active, setActive] = useState(false)
  const [catalogStatus, setCatalogStatus] = useState<PermStatus>("pending")
  const [locationStatus, setLocationStatus] = useState<PermStatus>("pending")
  const [orientationStatus, setOrientationStatus] = useState<PermStatus>("pending")
  const [cameraStatus, setCameraStatus] = useState<PermStatus>("pending")
  const [statusMsg, setStatusMsg] = useState("")
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const [info, setInfo] = useState("")
  const [isSecure, setIsSecure] = useState(true)

  // Check secure context on mount
  useEffect(() => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setIsSecure(false)
    }
  }, [])

  // Load star catalog on mount
  useEffect(() => {
    setCatalogStatus("requesting")
    fetch("/data/hyg-bright.json")
      .then(r => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`)
        return r.json()
      })
      .then((data: CatalogStar[]) => {
        starsRef.current = data.filter(s => s.mag < 5.5)
        setCatalogStatus("granted")
      })
      .catch(err => {
        console.error("Catalog load failed:", err)
        setCatalogStatus("denied")
        setErrorDetail(`Star catalog: ${err.message}`)
      })
  }, [])

  // Step-by-step permission requests — triggered by user tap
  const handleStart = useCallback(async () => {
    setErrorDetail(null)

    // If catalog didn't load, try again
    if (catalogStatus !== "granted") {
      setCatalogStatus("requesting")
      try {
        const r = await fetch("/data/hyg-bright.json")
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data: CatalogStar[] = await r.json()
        starsRef.current = data.filter(s => s.mag < 5.5)
        setCatalogStatus("granted")
      } catch (err: any) {
        setCatalogStatus("denied")
        setErrorDetail(`Could not load star catalog: ${err.message}`)
        return
      }
    }

    try {
    // 1. GPS Location
    setLocationStatus("requesting")
    setStatusMsg("Requesting location access — please tap Allow when prompted...")

    if (!navigator.geolocation) {
      setLocationStatus("unavailable")
      setErrorDetail("Your browser does not support geolocation")
      return
    }

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        })
      })
      locationRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setLocationStatus("granted")
      setStatusMsg(`Location: ${pos.coords.latitude.toFixed(2)}°, ${pos.coords.longitude.toFixed(2)}°`)
    } catch (err: any) {
      setLocationStatus("denied")
      const reasons: Record<number, string> = {
        1: "Permission denied — please allow location access in your browser settings",
        2: "Position unavailable — could not determine your location",
        3: "Request timed out — try again in an open area",
      }
      setErrorDetail(reasons[err.code] || `Location error: ${err.message}`)
      return
    }

    // 2. Device Orientation (compass/gyroscope)
    setOrientationStatus("requesting")
    setStatusMsg("Requesting compass access...")

    try {
      const DOE = DeviceOrientationEvent as any
      if (typeof DOE.requestPermission === "function") {
        const perm = await DOE.requestPermission()
        if (perm !== "granted") {
          setOrientationStatus("denied")
          setErrorDetail("Compass permission denied — please allow motion & orientation access")
          return
        }
      }

      // Listen for orientation events
      let gotData = false
      const handler = (e: DeviceOrientationEvent) => {
        if (e.alpha !== null) {
          orientationRef.current = {
            alpha: e.alpha || 0,
            beta: e.beta || 0,
            gamma: e.gamma || 0,
          }
          gotData = true
        }
      }
      window.addEventListener("deviceorientation", handler, true)

      // Wait briefly to see if we get orientation data
      await new Promise(resolve => setTimeout(resolve, 1000))

      if (gotData) {
        setOrientationStatus("granted")
      } else {
        // No data — might be desktop or sensor unavailable
        setOrientationStatus("unavailable")
        setStatusMsg("No compass detected — using fixed north view")
      }
    } catch {
      setOrientationStatus("unavailable")
    }

    // 3. Camera
    setCameraStatus("requesting")
    setStatusMsg("Requesting camera access...")

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera API not available")
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraStatus("granted")
    } catch {
      setCameraStatus("unavailable")
      // Camera is optional — continue without it
    }

    setStatusMsg("")
    setActive(true)
  } catch (err: any) {
    setStatusMsg("")
    setErrorDetail(`Unexpected error: ${err.message}`)
  }
  }, [catalogStatus])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks()
        tracks.forEach(t => t.stop())
      }
      cancelAnimationFrame(animFrameRef.current)
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

    if (cameraStatus !== "granted") {
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

    const camAlt = 90 - orient.beta
    const camAz = orient.alpha
    const camRoll = orient.gamma
    const hFov = 65

    const projected: ProjectedStar[] = []
    for (const star of stars) {
      const raDeg = star.ra * 15
      const { alt, az } = raDecToAltAz(raDeg, star.dec, loc.lat, lst)
      if (alt < -5) continue
      const pos = projectToCamera(alt, az, camAlt, camAz, camRoll, hFov, w, h)
      if (pos) {
        projected.push({ x: pos.x, y: pos.y, mag: star.mag, name: star.name, hip: star.hip, con: star.con })
      }
    }

    const hipToProjected = new Map<number, ProjectedStar>()
    for (const s of projected) {
      if (s.hip) hipToProjected.set(s.hip, s)
    }

    const drawnConstellations = new Map<string, { cx: number; cy: number; count: number }>()

    for (const [abbr, lines] of Object.entries(constellationLines)) {
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
          const entry = drawnConstellations.get(abbr) || { cx: 0, cy: 0, count: 0 }
          entry.cx += s1.x + s2.x
          entry.cy += s1.y + s2.y
          entry.count += 2
          drawnConstellations.set(abbr, entry)
        }
      }
    }

    const connectedHips = new Set<number>()
    for (const [, lines] of Object.entries(constellationLines)) {
      for (const [hip1, hip2] of lines) {
        if (hipToProjected.has(hip1) && hipToProjected.has(hip2)) {
          connectedHips.add(hip1)
          connectedHips.add(hip2)
        }
      }
    }

    for (const star of projected) {
      const isConstStar = star.hip ? connectedHips.has(star.hip) : false
      if (!isConstStar && star.mag > 3.5) continue
      const baseSize = isConstStar ? Math.max(2, 5 - star.mag * 0.7) : Math.max(0.8, 2.5 - star.mag * 0.4)
      const opacity = isConstStar ? 1 : 0.4

      const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, baseSize * 2.5)
      gradient.addColorStop(0, `rgba(200, 220, 255, ${opacity * 0.7})`)
      gradient.addColorStop(0.5, `rgba(150, 180, 255, ${opacity * 0.2})`)
      gradient.addColorStop(1, "transparent")
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(star.x, star.y, baseSize * 2.5, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`
      ctx.beginPath()
      ctx.arc(star.x, star.y, baseSize, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.font = "bold 14px Inter, sans-serif"
    ctx.textAlign = "center"
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)"
    ctx.shadowBlur = 4
    for (const [abbr, entry] of drawnConstellations) {
      const name = constellationNames[abbr] || abbr
      ctx.fillStyle = "rgba(200, 220, 255, 0.9)"
      ctx.fillText(name, entry.cx / entry.count, entry.cy / entry.count - 15)
    }
    ctx.shadowBlur = 0

    setInfo(`Alt ${camAlt.toFixed(0)}° Az ${camAz.toFixed(0)}° · ${projected.length} stars · ${drawnConstellations.size} constellations`)
    animFrameRef.current = requestAnimationFrame(render)
  }, [cameraStatus])

  useEffect(() => {
    if (active) {
      animFrameRef.current = requestAnimationFrame(render)
      return () => cancelAnimationFrame(animFrameRef.current)
    }
  }, [active, render])

  const StatusIcon = ({ status }: { status: PermStatus }) => {
    if (status === "granted") return <CheckCircle className="w-4 h-4 text-green-400" />
    if (status === "denied") return <X className="w-4 h-4 text-red-400" />
    if (status === "requesting") return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
    if (status === "unavailable") return <AlertTriangle className="w-4 h-4 text-yellow-400" />
    return <div className="w-4 h-4 rounded-full border border-white/30" />
  }

  // Setup screen
  if (!active) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-center text-white max-w-sm px-6">
          <Compass className="w-16 h-16 mx-auto mb-6 text-primary opacity-70" />
          <h2 className="text-2xl font-bold mb-3">Live Sky View</h2>
          <p className="text-sm text-white/60 mb-6">
            Point your phone at the sky to see constellations in real time.
          </p>

          {!isSecure && (
            <div className="bg-red-900/50 rounded-lg p-3 mb-6 text-left text-sm text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>HTTPS is required for GPS and camera access. Please use a secure (https://) connection.</span>
            </div>
          )}

          {/* Permission status list */}
          <div className="space-y-3 text-left text-sm mb-6">
            <div className="flex items-center gap-3 text-white/70">
              <StatusIcon status={catalogStatus} />
              <span>{catalogStatus === "granted" ? `Star catalog loaded (${starsRef.current.length} stars)` : catalogStatus === "denied" ? "Star catalog failed to load" : "Loading star catalog..."}</span>
            </div>
            <div className="flex items-center gap-3 text-white/70">
              <StatusIcon status={locationStatus} />
              <div>
                <span>GPS Location</span>
                {locationStatus === "pending" && <span className="text-white/40 text-xs block">Tap Start to request</span>}
              </div>
            </div>
            <div className="flex items-center gap-3 text-white/70">
              <StatusIcon status={orientationStatus} />
              <div>
                <span>Compass / Gyroscope</span>
                {orientationStatus === "pending" && <span className="text-white/40 text-xs block">Tap Start to request</span>}
                {orientationStatus === "unavailable" && <span className="text-yellow-400/70 text-xs block">Not available — will use fixed view</span>}
              </div>
            </div>
            <div className="flex items-center gap-3 text-white/70">
              <StatusIcon status={cameraStatus} />
              <div>
                <span>Camera</span>
                {cameraStatus === "pending" && <span className="text-white/40 text-xs block">Optional — works without camera too</span>}
              </div>
            </div>
          </div>

          {statusMsg && (
            <p className="text-blue-300 text-sm mb-4 flex items-center justify-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              {statusMsg}
            </p>
          )}

          {errorDetail && (
            <div className="bg-red-900/40 rounded-lg p-3 mb-4 text-left text-sm text-red-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorDetail}</span>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1 border-white/20 text-white hover:bg-white/10">
              Cancel
            </Button>
            <Button
              onClick={handleStart}
              disabled={locationStatus === "requesting" || orientationStatus === "requesting" || cameraStatus === "requesting"}
              className="flex-1 bg-primary hover:bg-primary/90"
            >
              {locationStatus === "requesting" || orientationStatus === "requesting" ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Requesting...</>
              ) : (
                <><Play className="w-4 h-4 mr-2" /> Start</>
              )}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Active view
  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{ display: cameraStatus === "granted" ? "block" : "none" }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-white/70">
            <MapPin className="w-3.5 h-3.5" />
            <span>GPS</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-white/70">
            <Compass className="w-3.5 h-3.5" />
            <span>{orientationStatus === "granted" ? "Compass" : "Fixed"}</span>
          </div>
          {cameraStatus === "granted" && (
            <div className="flex items-center gap-1.5 text-xs text-white/70">
              <Camera className="w-3.5 h-3.5" />
              <span>Camera</span>
            </div>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-white hover:bg-white/10">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-10 p-4 bg-gradient-to-t from-black/50 to-transparent">
        <div className="text-center text-xs text-white/60">{info}</div>
      </div>
    </div>
  )
}
