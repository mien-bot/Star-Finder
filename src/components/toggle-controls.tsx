"use client"

import { Spline, Tag, RotateCcw } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

interface ToggleControlsProps {
  showLines: boolean
  showLabels: boolean
  onToggleLines: (value: boolean) => void
  onToggleLabels: (value: boolean) => void
  onReset: () => void
}

export function ToggleControls({
  showLines,
  showLabels,
  onToggleLines,
  onToggleLabels,
  onReset,
}: ToggleControlsProps) {
  return (
    <div className="glass rounded-xl p-4 flex flex-wrap items-center gap-6">
      <div className="flex items-center gap-3">
        <Switch
          id="show-lines"
          checked={showLines}
          onCheckedChange={onToggleLines}
          className="data-[state=checked]:bg-primary"
        />
        <Label
          htmlFor="show-lines"
          className="flex items-center gap-2 text-sm cursor-pointer text-foreground"
        >
          <Spline className="w-4 h-4 text-primary" />
          Constellation Lines
        </Label>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="show-labels"
          checked={showLabels}
          onCheckedChange={onToggleLabels}
          className="data-[state=checked]:bg-primary"
        />
        <Label
          htmlFor="show-labels"
          className="flex items-center gap-2 text-sm cursor-pointer text-foreground"
        >
          <Tag className="w-4 h-4 text-primary" />
          Labels
        </Label>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onReset}
        className="ml-auto text-muted-foreground hover:text-foreground hover:bg-primary/10"
      >
        <RotateCcw className="w-4 h-4 mr-2" />
        New Image
      </Button>
    </div>
  )
}
