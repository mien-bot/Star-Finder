# Phase 1: MVP

**Duration:** 2-3 weeks

## Goal
Basic functionality: upload an image → get a simple building outline SVG

## Tasks

### 1. Image Input System
- [ ] Single image upload (drag & drop)
- [ ] URL input for satellite images
- [ ] Basic image validation (format, size)
- [ ] Preview before processing

### 2. Building Detection
- [ ] Integrate Vision API (Gemini/Claude)
- [ ] Prompt engineering for building outlines
- [ ] Convert AI response to coordinate points
- [ ] Handle multiple buildings

### 3. SVG Output
- [ ] Generate SVG from detected coordinates
- [ ] Basic styling (stroke, fill)
- [ ] Download button for SVG

### 4. Manual Drawing Cleanup
- [ ] Web-based SVG editor
- [ ] Add/remove/move vertices
- [ ] Undo/redo functionality

## Deliverables
- Working image upload → SVG pipeline
- Basic web UI for viewing results
- Manual refinement tool

## Success Criteria
- Can upload image and see detected buildings as SVG
- SVG can be downloaded and opened in vector editors