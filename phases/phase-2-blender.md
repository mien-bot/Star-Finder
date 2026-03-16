# Phase 2: Blender Integration

**Duration:** 2-3 weeks

## Goal
Generate 3D site models in Blender using bpy automation

## Tasks

### 1. Coordinate Transformation
- [ ] Convert image coordinates to Blender world space
- [ ] Handle scale and aspect ratio
- [ ] Support geotagged image metadata

### 2. bpy Script Generation
- [ ] Generate Python scripts for Blender
- [ ] Create building geometry from coordinates
- [ ] Add ground plane with textures
- [ ] Place vegetation/trees

### 3. Blender Subprocess
- [ ] Run Blender in headless mode
- [ ] Execute bpy scripts on server
- [ ] Handle render queue
- [ ] Manage Blender instances

### 4. 3D Site Model
- [ ] Basic building footprints
- [ ] Ground/terrain surface
- [ ] Simple vegetation
- [ ] Basic rendering (cycles/eevee)

## Deliverables
- Automated Blender workflow
- 3D site model from satellite image
- Rendered output images

## Success Criteria
- Image → Blender model works end-to-end
- Can render 3D site plan from satellite input