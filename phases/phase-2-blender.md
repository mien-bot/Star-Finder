# Phase 2: Blender Integration

**Duration:** 2-3 weeks

## Goal
Generate 3D site models in Blender using bpy automation

## Tasks

### 1. Coordinate Transformation
- [x] Convert image coordinates to Blender world space
- [x] Handle scale and aspect ratio
- [x] Support geotagged image metadata

### 2. bpy Script Generation
- [x] Generate Python scripts for Blender
- [x] Create building geometry from coordinates
- [x] Add ground plane with textures
- [x] Place vegetation/trees (basic)

### 3. Blender Subprocess
- [ ] Run Blender in headless mode
- [ ] Execute bpy scripts on server
- [ ] Handle render queue
- [ ] Manage Blender instances

### 4. 3D Site Model
- [x] Basic building footprints
- [x] Ground/terrain surface
- [x] Simple vegetation (basic materials)
- [x] Basic rendering (Three.js browser preview)

## ✅ Completed in Phase 2

### API Endpoint: `/api/blender`
- Accepts building coordinates from Phase 1
- Generates bpy (Blender Python) scripts
- Outputs Three.js-compatible scene data for browser preview

### Features Delivered:
1. **bpy Script Generator** — Creates Blender Python scripts from building data
2. **Three.js 3D Preview** — Renders buildings in browser immediately
3. **Multiple Styles** — Blueprint, realistic, minimal rendering modes
4. **Ground Plane** — Auto-scaled to lot dimensions

### How It Works:
1. User uploads satellite image → Phase 1 generates building outlines (SVG)
2. Click "Generate 3D" → Sends buildings to `/api/blender`
3. API returns:
   - `.py` script for Blender (headless rendering)
   - Three.js scene data for instant browser preview
4. Browser renders interactive 3D model (drag to rotate)

### Next Steps (Not Done):
- [ ] Run Blender in headless mode on server
- [ ] Full render pipeline (CYCLES/EEVEE)
- [ ] Export to PNG/DWG

## Deliverables
- [x] Working bpy script generation
- [x] Browser-based 3D preview (Three.js)
- [ ] Automated Blender rendering pipeline

## Success Criteria
- [x] Buildings from SVG → 3D model in browser
- [ ] Full Blender render pipeline (deferred)
