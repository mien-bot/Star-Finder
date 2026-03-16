# Architectural Plan Drawer - Project Plan

## Vision
A tool that takes satellite imagery (Google Earth/Maps) and produces clean, professional architectural site plans using AI + Blender.

---

## Core Features

### 1. Image Ingestion
- **Google Earth/Maps integration**: Static API or web scraping
- **Mapbox Satellite**: Cleaner imagery, better API
- **ESRI World Imagery**: Free alternative
- **Upload custom**: User-provided screenshots

### 2. AI Processing Pipeline
- **Building detection**: Identify structures from satellite
- **Lot boundary detection**: Roads, fences, property lines
- **Vegetation mapping**: Trees, lawns, gardens
- **Surface classification**: Paved, gravel, water, etc.
- **Dimension estimation**: Scale based on known references

### 3. Blender Integration (Game Changer!)
Instead of just 2D drawings, use Blender for beautiful 3D site plans:

#### How it works:
1. **AI Analysis**: Vision API detects buildings, lot lines, vegetation
2. **bpy Script Generation**: Create Python script for Blender
3. **Automated 3D Model**: Blender builds site model automatically
4. **Render**: Beautiful output in any style

#### Blender Benefits:
- **Python API (bpy)**: Full automation
- **Rendering**: Cycles/Eevee for photorealistic or clean CAD style
- **Export**: DWG via addons, DXF, PDF, PNG, etc.
- **Best of both**: 2D plans + 3D visualizations

### 4. Drawing Styles (2D fallback)
- **Blueprint**: Classic blue-white line work
- **Black & White**: Clean presentation
- **Architectural**: Shaded with materials
- **Minimal**: Modern line art

### 5. Editing Tools
- Manual refinement after AI generation
- Add/edit walls, doors, windows
- Dimension lines with auto-measure
- North arrow, scale bar
- Labeling

### 6. Export
- **DWG** (AutoCAD) ← Priority
- **DXF** (AutoCAD compatible)
- PDF (print-ready)
- SVG (vector)
- PNG (high-res)
- **Blender (.blend)** (editable 3D model)

---

## Tech Stack

### Frontend
- Next.js (React)
- Tailwind + shadcn/ui

### Backend
- Python FastAPI
- OpenCV for image processing
- Gemini/Claude Vision for analysis
- **Blender + bpy** for 3D generation

### Infrastructure
- Vercel (frontend)
- Railway/Fly.io (backend with Blender)
- S3 for image storage

---

## Implementation Phases

### Phase 1: MVP (2-3 weeks)
- [ ] Single image input (upload or URL)
- [ ] Basic building detection (using Vision API)
- [ ] Simple SVG output
- [ ] Manual drawing cleanup

### Phase 2: Blender Integration (2-3 weeks)
- [ ] Vision API → building coordinates
- [ ] bpy script generation
- [ ] Blender subprocess on server
- [ ] Basic 3D site model

### Phase 3: Polish (2 weeks)
- [ ] Multiple rendering styles
- [ ] Export formats (DWG, DXF, PDF)
- [ ] Editing tools
- [ ] Auto-scale from geotagged images

---

## Blender Export Options

### DWG (Priority)
- **BlenderCAD** addon: Direct DWG export
- **GDMC** addon: Minecraft-style but exports DWG
- Alternative: Convert via DXF (AutoCAD opens DXF fine)

### DXF (Easier)
- Native Blender DXF export
- AutoCAD, Revit, SketchUp all accept DXF

### PDF
- Blender render to PDF directly

### Best Approach:
1. Generate in Blender
2. Export as DXF (native, reliable)
3. For DWG: tell users "DXF - open in AutoCAD/convert to DWG"

---

## Similar Tools & References
- **Planner 5D**: Interior plans, not site
- **RoomSketcher**: Floor plans, subscription-based
- **Floorplaner**: Simple 2D
- **AutoCAD**: Too complex, expensive
- **Skygraphics**: Satellite to vector (similar idea)

---

## Next Steps
1. Create prototype with Vision API → SVG
2. Add Blender bpy script generation
3. Test with 5-10 sample images
4. Add export pipeline (DXF, DWG)
5. Build editing UI

---

*Created: 2026-03-16*