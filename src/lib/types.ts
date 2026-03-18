export interface Star {
  id: number
  hip?: number
  name?: string
  bf?: string
  ra: number
  dec: number
  mag: number
  spectralType?: string
  colorIndex?: number
  constellation?: string
  px?: number
  py?: number
}

export interface Constellation {
  name: string
  abbreviation: string
  stars: Star[]
  connections: [number, number][]
  description: string
  mythology?: string
  visibility: {
    season: string
    hemisphere: string
  }
}

export interface FieldEstimate {
  centerRA: number     // hours (0-24)
  centerDec: number    // degrees (-90 to +90)
  horizontalFOV: number // degrees
  orientation: number  // degrees clockwise from north
}

export interface AnalysisResult {
  constellations: Constellation[]
  allStars: Star[]
  calibration?: {
    ra: number
    dec: number
    orientation: number
    pixscale: number
    radius: number
  }
  fieldDescription?: string
  processingTime: number
  source: 'astrometry' | 'gpt4o-fallback'
  fieldEstimate?: FieldEstimate
  identifiedConstellations?: string[]
}
