# HYLO-SP

Architectural Plan Drawer — Transform satellite imagery into professional site plans using AI and Blender.

## Overview

HYLO-SP takes satellite imagery (Google Earth/Maps, Mapbox, ESRI) and produces clean, professional architectural site plans through an AI processing pipeline + Blender 3D rendering pipeline.

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
# (Backend setup instructions coming soon)
```

## Project Structure

```
hylo-sp/
├── README.md
├── PLAN.md
└── phases/
    ├── phase-1-mvp.md
    ├── phase-2-blender.md
    └── phase-3-polish.md
```

## License

MIT

---

*Built with AI + Blender*