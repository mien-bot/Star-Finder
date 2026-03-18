"use client"

import { useState, useCallback } from "react"
import { StarBackground } from "@/components/star-background"
import { UploadZone } from "@/components/upload-zone"
import { CanvasOverlay } from "@/components/canvas-overlay"
import { ConstellationPanel } from "@/components/constellation-panel"
import { ToggleControls } from "@/components/toggle-controls"
import { LoadingState } from "@/components/loading-state"
import { StarDetail } from "@/components/star-detail"
import { CameraView } from "@/components/camera-view"
import { useAnalysis } from "@/hooks/use-analysis"
import { analyzeNightSkyImage } from "@/lib/constellation-data"
import type { Constellation } from "@/lib/constellation-data"
import type { Star } from "@/lib/types"
import { Stars, AlertCircle, Wand2, Download } from "lucide-react"
import { Button } from "@/components/ui/button"

type AppState = "upload" | "loading" | "results"

const statusMessages: Record<string, string> = {
  'uploading': 'Uploading your image...',
  'plate-solving': 'Analyzing star patterns...',
  'cross-referencing': 'Cross-referencing star catalogs...',
  'complete': 'Analysis complete!',
  'error': 'Analysis failed',
}

export default function StarFinderApp() {
  const [appState, setAppState] = useState<AppState>("upload")
  const [imageUrl, setImageUrl] = useState<string>("")
  const [constellations, setConstellations] = useState<Constellation[]>([])
  const [showLines, setShowLines] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [highlightedConstellation, setHighlightedConstellation] = useState<string | null>(null)
  const [selectedStar, setSelectedStar] = useState<Star | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showLiveSky, setShowLiveSky] = useState(false)

  const analysis = useAnalysis()

  const handleImageUpload = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setAppState("loading")
    setErrorMessage(null)

    try {
      // Try real API first
      await analysis.analyze(file)
    } catch {
      // Silently handled by the hook
    }
  }, [analysis])

  // Watch for analysis completion
  const prevStatus = analysis.status
  if (prevStatus === 'complete' && analysis.result && appState === 'loading') {
    // Convert analysis result constellations to the UI format
    const uiConstellations: Constellation[] = analysis.result.constellations.map(c => ({
      name: c.name,
      stars: c.stars.map(s => [s.px || 0, s.py || 0, s.mag] as [number, number, number]),
      connections: c.connections,
      description: c.description,
      mythology: c.mythology,
      visibility: c.visibility,
    }))
    setConstellations(uiConstellations)
    setAppState("results")
  } else if (prevStatus === 'error' && appState === 'loading') {
    // Fall back to mock data on error
    setErrorMessage(analysis.error || 'Analysis failed')
    analyzeNightSkyImage().then(result => {
      setConstellations(result.constellations)
      setAppState("results")
    })
  }

  const handleReset = useCallback(() => {
    setAppState("upload")
    setImageUrl("")
    setConstellations([])
    setShowLines(true)
    setShowLabels(true)
    setHighlightedConstellation(null)
    setSelectedStar(null)
    setErrorMessage(null)
    analysis.reset()
  }, [analysis])

  const handleExportSVG = useCallback(async () => {
    if (!analysis.result) return
    try {
      const { renderStarChartSVG } = await import('@/lib/star-chart-renderer')
      const svg = renderStarChartSVG(
        analysis.result.constellations,
        analysis.result.allStars,
        { title: 'Star Finder Chart', showLabels: true }
      )
      const blob = new Blob([svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'star-chart.svg'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Export not available without analysis result
    }
  }, [analysis.result])

  return (
    <div className="min-h-screen relative">
      <StarBackground />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <button onClick={handleReset} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Stars className="w-6 h-6 text-primary" />
            <span className="font-semibold text-lg text-foreground">Star Finder</span>
          </button>
          {appState === "results" && (
            <div className="flex items-center gap-3">
              {analysis.result && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleExportSVG}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export SVG
                </Button>
              )}
              <ToggleControls
                showLines={showLines}
                showLabels={showLabels}
                onToggleLines={setShowLines}
                onToggleLabels={setShowLabels}
                onReset={handleReset}
              />
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-16 min-h-screen">
        {appState === "upload" && (
          <UploadZone
            onImageUpload={handleImageUpload}
            onLiveSky={() => setShowLiveSky(true)}
          />
        )}

        {appState === "loading" && (
          <div>
            <LoadingState
              status={statusMessages[analysis.status] || 'Analyzing...'}
              progress={analysis.progress}
            />
            {analysis.status === 'error' && (
              <div className="flex flex-col items-center gap-3 -mt-8">
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>{analysis.error}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => analysis.useFallback()}
                  className="border-primary/50"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  Try AI Fallback
                </Button>
              </div>
            )}
          </div>
        )}

        {appState === "results" && (
          <div className="h-[calc(100vh-4rem)] flex flex-col lg:flex-row">
            {/* Error banner */}
            {errorMessage && (
              <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 glass rounded-lg px-4 py-2 text-sm text-muted-foreground flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-yellow-500" />
                Using demo data: {errorMessage}
              </div>
            )}

            {/* Image Preview with Canvas Overlay */}
            <div className="flex-1 p-4 lg:p-6">
              <div className="glass rounded-2xl h-full p-4 flex items-center justify-center overflow-hidden">
                <CanvasOverlay
                  imageUrl={imageUrl}
                  constellations={constellations}
                  showLines={showLines}
                  showLabels={showLabels}
                  highlightedConstellation={highlightedConstellation}
                />
              </div>
            </div>

            {/* Constellation Info Panel */}
            <div className="lg:w-96 p-4 lg:p-6 lg:pl-0">
              <ConstellationPanel
                constellations={constellations}
                highlightedConstellation={highlightedConstellation}
                onHover={setHighlightedConstellation}
              />
              {analysis.result && (
                <div className="mt-3 glass rounded-xl p-3 text-xs text-muted-foreground">
                  <p>Source: {analysis.result.source === 'astrometry' ? 'Astrometry.net' : 'GPT-4o Vision'}</p>
                  {analysis.result.fieldDescription && <p>{analysis.result.fieldDescription}</p>}
                  <p>Processing time: {(analysis.result.processingTime / 1000).toFixed(1)}s</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Star Detail Modal */}
      <StarDetail star={selectedStar} onClose={() => setSelectedStar(null)} />

      {/* Live Sky Camera View */}
      {showLiveSky && <CameraView onClose={() => setShowLiveSky(false)} />}
    </div>
  )
}
