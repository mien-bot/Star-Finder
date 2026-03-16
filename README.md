# HYLO-SP

Architectural Plan Drawer — Transform satellite imagery into professional site plans using AI and Blender.

## Overview

HYLO-SP takes satellite imagery (Google Earth/Maps, Mapbox Satellite, ESRI) and produces clean, professional architectural site plans through an AI processing pipeline + Blender 3D rendering pipeline.

## Features

- **Satellite Image Ingestion** — Upload custom images or integrate with Google Earth/Maps, Mapbox Satellite, or ESRI World Imagery
- **AI Processing** — Building detection, lot boundary detection, vegetation mapping, surface classification
- **Blender Integration** — Automated 3D site model generation with bpy scripting
- **Multiple Drawing Styles** — Blueprint, Black & White, Architectural, Minimal
- **Export Options** — DWG, DXF, PDF, SVG, PNG, Blender (.blend)

## Tech Stack

- **Frontend**: Next.js + Tailwind + shadcn/ui
- **Backend**: Python FastAPI + OpenCV + Gemini/Claude Vision
- **3D Engine**: Blender + bpy
- **Infrastructure**: Vercel, Railway/Fly.io, S3

## Getting Started

```bash
# Clone the repository
git clone https://github.com/mien-bot/HYLO-SP.git
cd hylo-sp

# Install dependencies
npm install

# Run development server
npm run dev
```

## Environment Variables

To connect to a real Vision API, create a `.env.local` file with your API keys:

```bash
# Choose one or more:
OPENAI_API_KEY=sk-...        # For GPT-4V
ANTHROPIC_API_KEY=sk-ant-... # For Claude Vision
GOOGLE_GENERATIVE_AI_API_KEY=... # For Gemini Vision
```

## Project Structure

```
hylo-sp/
├── src/
│   └── app/
│       ├── page.tsx          # Main UI
│       └── api/
│           └── process/      # Image processing endpoint
├── phases/
│   ├── phase-1-mvp.md        # Current: Image → SVG
│   ├── phase-2-blender.md    # Next: SVG → 3D
│   └── phase-3-polish.md    # Final: Polish & export
├── PLAN.md
└── README.md
```

## Development

### Phase 1: MVP (Current)
- [x] Image upload (drag & drop)
- [x] URL input for satellite images
- [x] Basic image validation
- [x] Preview before processing
- [x] Building detection (simulated)
- [x] SVG output with basic styling
- [x] Download button for SVG

### Phase 2: Blender Integration
- [x] SVG to 3D model conversion (Three.js browser preview)
- [x] bpy script generation for Blender
- [x] Automated camera positioning
- [x] Material/texture application

### Phase 3: Polish
- [x] Multiple rendering styles (5 styles)
- [x] Export to SVG, DXF, PDF, PNG, Blender
- [x] Style selector UI
- [x] Building label editor
- [x] Dimensions, north arrow, scale bar overlays
- [x] Lot size configuration

## License

MIT

---

*Built with AI + Blender*
