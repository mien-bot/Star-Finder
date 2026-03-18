import OpenAI from 'openai'
import type { AnalysisResult, Constellation, Star } from './types'

const openai = new OpenAI()

export async function analyzeWithGPT4o(
  base64Image: string,
  imgWidth: number,
  imgHeight: number
): Promise<AnalysisResult> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a world-class astronomer. Analyze the night sky photograph and identify the sky region shown.

Your PRIMARY task is to determine the field parameters — what part of the sky the camera is pointing at. This is critical for accurate star mapping.

Return a JSON object:
{
  "field": {
    "centerRA": 20.5,
    "centerDec": 35.0,
    "horizontalFOV": 90,
    "orientation": 0
  },
  "constellations": ["Cyg", "Lyr", "Aql", "Sgr", "Sct"],
  "fieldDescription": "Summer Milky Way showing the Summer Triangle region"
}

Field parameters:
- "centerRA": Right Ascension of image center in HOURS (0-24). This is the most important parameter.
- "centerDec": Declination of image center in DEGREES (-90 to +90). Positive = north.
- "horizontalFOV": Horizontal field of view in DEGREES. Wide-angle photos are typically 70-120°, normal lens 40-60°, telephoto 10-30°. Estimate from the angular extent of visible constellations.
- "orientation": Angle from celestial north to image "up" direction, in degrees clockwise. 0 = north is up. Most handheld photos have north roughly up (0-30°).

Constellation list:
- List IAU three-letter abbreviation codes for ALL constellations visible in the image
- Be thorough — a wide-field Milky Way photo typically shows 8-15+ constellations
- Include partial constellations at the edges

Tips for identifying the field:
- The Milky Way band helps orient: in summer it runs through Cyg/Aql/Sgr, in winter near Ori/CMa/Gem
- Identify the brightest stars first (Vega, Deneb, Altair, Sirius, etc.) to anchor the field
- The horizon line tells you which way is "down" (low Dec or south)
- Star density increases toward the Milky Way center (Sagittarius/Scorpius direction)`
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Analyze this night sky photograph. Determine the exact sky coordinates the camera is pointing at, the field of view, and list all visible constellations. Return valid JSON only.'
          },
          { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}`, detail: 'high' } },
        ],
      },
    ],
    max_tokens: 2048,
    temperature: 0.2,
    response_format: { type: 'json_object' },
  })

  const content = response.choices[0]?.message?.content || '{}'
  const parsed = JSON.parse(content)

  const field = parsed.field || {}
  const constellationList: string[] = parsed.constellations || []

  return {
    constellations: [],
    allStars: [],
    fieldDescription: parsed.fieldDescription || 'AI-analyzed night sky field',
    processingTime: 0,
    source: 'gpt4o-fallback',
    fieldEstimate: {
      centerRA: field.centerRA ?? 0,     // hours
      centerDec: field.centerDec ?? 0,   // degrees
      horizontalFOV: field.horizontalFOV ?? 60, // degrees
      orientation: field.orientation ?? 0, // degrees
    },
    identifiedConstellations: constellationList,
  }
}
