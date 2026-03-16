# Phase 1: MVP

**Duration:** 2-3 weeks

## Goal
Basic functionality: upload an image → get a simple building outline SVG

## Tasks

### 1. Image Input System
- [x] Single image upload (drag & drop)
- [x] URL input for satellite images
- [x] Basic image validation (format, size)
- [x] Preview before processing

### 2. Building Detection
- [x] Integrate Vision API (Gemini/Claude) - structure ready, needs API key
- [x] Prompt engineering for building outlines - documented in API route
- [x] Convert AI response to coordinate points
- [x] Handle multiple buildings

### 3. SVG Output
- [x] Generate SVG from detected coordinates
- [x] Basic styling (stroke, fill)
- [x] Download button for SVG

### 4. Manual Drawing Cleanup
- [ ] Web-based SVG editor
- [ ] Add/remove/move vertices
- [ ] Undo/redo functionality

## Deliverables
- [x] Working image upload → SVG pipeline
- [x] Basic web UI for viewing results
- [ ] Manual refinement tool (Phase 2)

## Success Criteria
- [x] Can upload image and see detected buildings as SVG
- [x] SVG can be downloaded and opened in vector editors

## Notes
- Vision API integration uses simulation for demo
- To connect real API, add key to .env.local:
  - OPENAI_API_KEY for GPT-4V
  - ANTHROPIC_API_KEY for Claude Vision
  - GOOGLE_GENERATIVE_AI_API_KEY for Gemini Vision
