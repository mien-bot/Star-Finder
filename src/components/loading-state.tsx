"use client"

import { Sparkles } from "lucide-react"

interface LoadingStateProps {
  status?: string
  progress?: number
}

export function LoadingState({ status, progress }: LoadingStateProps) {
  const message = status || "Analyzing stars and mapping constellations..."
  const subtitle = progress !== undefined
    ? `${Math.round(progress)}% complete`
    : "Our AI is scanning your image to identify celestial patterns"

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="glass rounded-2xl p-12 text-center max-w-md">
        <div className="relative mb-8">
          <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto animate-pulse">
            <Sparkles className="w-12 h-12 text-primary animate-pulse-glow" />
          </div>
          <div className="absolute inset-0 w-24 h-24 mx-auto rounded-full border-2 border-primary/30 animate-ping" />
        </div>
        <h2 className="text-2xl font-semibold text-foreground mb-3">
          {message}
        </h2>
        <p className="text-muted-foreground">
          {subtitle}
        </p>
        <div className="mt-8 flex justify-center gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-primary animate-bounce"
              style={{ animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
