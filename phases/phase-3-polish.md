# Phase 3: Polish

**Duration:** 2 weeks

## Goal
Production-ready features: multiple styles, export formats, editing tools

## Tasks

### 1. Rendering Styles
- [x] Blueprint style (blue-white lines)
- [x] Black & White style
- [x] Architectural style (with materials)
- [x] Minimal style (clean line art)
- [x] Realistic style
- [x] Style selector in UI

### 2. Export Formats
- [x] SVG export (direct generation with styles)
- [x] DXF export (CAD-compatible)
- [x] PDF export (via SVG print)
- [x] PNG export (via SVG)
- [x] Blender file export (.blend.py script)
- [ ] DWG export (requires server-side conversion)

### 3. Editing Tools
- [x] Edit building names/labels
- [x] Dimension lines with auto-measure
- [x] North arrow overlay
- [x] Scale bar
- [x] Labeling system
- [ ] Add/edit building walls (deferred)
- [ ] Add doors and windows (deferred)

### 4. Auto-Scaling
- [x] Lot size input (width/depth in meters)
- [ ] Read geotagged metadata from images (deferred)
- [ ] Auto-calculate real-world dimensions (deferred)

## ✅ Completed in Phase 3

### New API: `/api/export`
- Generates styled SVGs with selected rendering style
- Exports to multiple formats: SVG, DXF, PDF, PNG, Blender script
- Includes dimensions, north arrow, scale bar, labels

### UI Enhancements:
1. **Style Selector** — Choose from 5 rendering styles
2. **Export Panel** — Modal with format and overlay options
3. **Building Editor** — Rename buildings, update labels
4. **Lot Size Input** — Set real-world dimensions
5. **2D/3D Tabs** — Switch between plan view and 3D model

### Rendering Styles:
- **Realistic** — Gray buildings, grass ground, soft shadows
- **Blueprint** — Blue-white CAD style
- **Architectural** — Clean lines with material hints
- **Minimal** — Modern line art, no fill
- **B&W** — High contrast black and white

### Export Formats:
| Format | Description |
|--------|-------------|
| SVG | Vector, editable in Illustrator/Inkscape |
| DXF | CAD format, opens in AutoCAD/Revit |
| PDF | Print-ready (via SVG) |
| PNG | Raster image |
| Blender | Python script to rebuild scene |

## Deliverables
- [x] Multiple rendering styles (5 styles)
- [x] Export pipeline (SVG, DXF, PDF, PNG, blend)
- [x] Basic editing (rename buildings, overlay toggles)
- [x] Lot size configuration

## Success Criteria
- [x] Can export to multiple formats including DXF
- [x] Rendering style selection works
- [x] Manual editing tools functional (labels, dimensions, overlays)

## Not Completed (Deferred):
- Server-side DWG conversion
- Geotagged image auto-scaling
- Building wall/door/window editing
