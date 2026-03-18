"use client"

import { Star, Calendar, Globe } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import type { Constellation } from "@/lib/constellation-data"

interface ConstellationPanelProps {
  constellations: Constellation[]
  highlightedConstellation: string | null
  onHover: (name: string | null) => void
}

export function ConstellationPanel({
  constellations,
  highlightedConstellation,
  onHover,
}: ConstellationPanelProps) {
  return (
    <div className="glass rounded-2xl p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <Star className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Detected Constellations</h2>
        <Badge variant="secondary" className="ml-auto bg-primary/20 text-primary">
          {constellations.length}
        </Badge>
      </div>

      <ScrollArea className="flex-1 -mx-4 px-4">
        <div className="space-y-3">
          {constellations.map((constellation) => (
            <Card
              key={constellation.name}
              className={`cursor-pointer transition-all duration-300 bg-card/50 border-border/50 hover:border-primary/50 ${
                highlightedConstellation === constellation.name
                  ? "border-primary bg-primary/10"
                  : ""
              }`}
              onMouseEnter={() => onHover(constellation.name)}
              onMouseLeave={() => onHover(null)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-card-foreground">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  {constellation.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {constellation.description}
                </p>
                {constellation.mythology && (
                  <p className="text-xs text-muted-foreground/80 italic border-l-2 border-primary/30 pl-3">
                    {constellation.mythology}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge
                    variant="outline"
                    className="text-xs gap-1 border-border/50 text-muted-foreground"
                  >
                    <Calendar className="w-3 h-3" />
                    {constellation.visibility.season}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-xs gap-1 border-border/50 text-muted-foreground"
                  >
                    <Globe className="w-3 h-3" />
                    {constellation.visibility.hemisphere}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
