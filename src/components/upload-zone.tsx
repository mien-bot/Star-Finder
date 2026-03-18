"use client"

import { useCallback, useRef } from "react"
import { Upload, Camera, Telescope, Stars } from "lucide-react"
import { Button } from "@/components/ui/button"

interface UploadZoneProps {
  onImageUpload: (file: File) => void
  onLiveSky?: () => void
}

export function UploadZone({ onImageUpload, onLiveSky }: UploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file && file.type.startsWith("image/")) {
        onImageUpload(file)
      }
    },
    [onImageUpload]
  )

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }, [])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        onImageUpload(file)
      }
    },
    [onImageUpload]
  )

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <div className="text-center mb-8 animate-float">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/20 mb-6 animate-pulse-glow">
          <Stars className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold mb-4 text-balance bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
          Star Finder
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto text-pretty">
          Upload an image of the night sky and discover the constellations hidden among the stars
        </p>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="glass rounded-2xl p-12 w-full max-w-lg cursor-pointer transition-all duration-300 hover:border-primary/50 group"
      >
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Upload className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-foreground font-medium mb-1">
              Drag and drop your night sky image
            </p>
            <p className="text-sm text-muted-foreground">or click to browse</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full">
            <Button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Image
            </Button>
            <Button
              onClick={() => cameraInputRef.current?.click()}
              variant="outline"
              className="flex-1 border-primary/50 hover:bg-primary/10 text-foreground"
            >
              <Camera className="w-4 h-4 mr-2" />
              Take Photo
            </Button>
          </div>
          {onLiveSky && (
            <Button
              onClick={onLiveSky}
              variant="outline"
              className="w-full border-primary/50 hover:bg-primary/10 text-foreground"
            >
              <Telescope className="w-4 h-4 mr-2" />
              Live Sky View
            </Button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  )
}
