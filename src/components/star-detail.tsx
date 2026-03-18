"use client"

import { useState, useEffect } from "react"
import { X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Star } from "@/lib/types"

interface StarDetailProps {
  star: Star | null
  onClose: () => void
}

interface SimbadInfo {
  mainId: string
  objectType: string
  spectralType?: string
  distance?: number
}

export function StarDetail({ star, onClose }: StarDetailProps) {
  const [simbadInfo, setSimbadInfo] = useState<SimbadInfo | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!star) {
      setSimbadInfo(null)
      return
    }

    setLoading(true)
    setSimbadInfo(null)

    const query = star.name
      ? `name=${encodeURIComponent(star.name)}`
      : `ra=${star.ra}&dec=${star.dec}`

    fetch(`/api/star-info?${query}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setSimbadInfo(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [star])

  if (!star) return null

  const spectralClass = star.spectralType || simbadInfo?.spectralType
  const starColor = spectralClass
    ? getStarColorFromSpectral(spectralClass)
    : '#ffffff'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="glass rounded-2xl p-6 max-w-sm w-full relative z-10"
        onClick={e => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-3 right-3 text-muted-foreground"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
        </Button>

        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-8 h-8 rounded-full"
            style={{
              background: `radial-gradient(circle, ${starColor}, transparent)`,
              boxShadow: `0 0 12px ${starColor}`,
            }}
          />
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              {star.name || simbadInfo?.mainId || `HIP ${star.hip || star.id}`}
            </h3>
            {star.constellation && (
              <p className="text-sm text-muted-foreground">{star.constellation}</p>
            )}
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <InfoRow label="Magnitude" value={star.mag.toFixed(2)} />
          <InfoRow label="Right Ascension" value={`${(star.ra / 15).toFixed(4)}h`} />
          <InfoRow label="Declination" value={`${star.dec.toFixed(4)}°`} />
          {star.hip && <InfoRow label="Hipparcos ID" value={`HIP ${star.hip}`} />}
          {spectralClass && <InfoRow label="Spectral Type" value={spectralClass} />}

          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground pt-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading SIMBAD data...</span>
            </div>
          )}

          {simbadInfo && (
            <>
              <InfoRow label="Object Type" value={simbadInfo.objectType} />
              {simbadInfo.distance && (
                <InfoRow label="Distance" value={`${simbadInfo.distance.toFixed(1)} pc`} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-mono">{value}</span>
    </div>
  )
}

function getStarColorFromSpectral(sp: string): string {
  const type = sp.charAt(0).toUpperCase()
  switch (type) {
    case 'O': return '#9bb0ff'
    case 'B': return '#aabfff'
    case 'A': return '#cad7ff'
    case 'F': return '#f8f7ff'
    case 'G': return '#fff4ea'
    case 'K': return '#ffd2a1'
    case 'M': return '#ffcc6f'
    default: return '#ffffff'
  }
}
