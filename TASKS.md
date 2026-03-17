# HYLO-SP — Task List for Subagents

## What's Already Done
- `src/lib/geometry.ts` — shared `Point`, `Feature`, `clamp`, `centerlineToPolygon`, `computeParcels`
- `src/lib/svg-renderer.ts` — shared `featuresToSvg`, `roundedPolygonPath`, `escapeXml`
- `src/lib/overpass.ts` — Nominatim geocoding, Overpass API query, OSM→Feature[] conversion
- `src/app/api/overpass/route.ts` — new API route accepting `{ address }` or `{ lat, lng }` + `radius`
- `src/app/api/process/route.ts` — new imports from shared modules added at the top (but old inline copies NOT yet deleted)
- `src/app/api/export/route.ts` — DXF R12 export, styled SVG export, PNG export
- `src/app/page.tsx` — image upload, detail slider, 2D/3D tabs, export panel, style selector, edit panel

---

## PHASE 1: Finish Overpass Integration (must be done in order)

### Task 1: Remove duplicate functions from process/route.ts

The file `src/app/api/process/route.ts` now imports `Point`, `Feature`, `clamp`, `centerlineToPolygon`, `computeParcels` from `@/lib/geometry` and `featuresToSvg` from `@/lib/svg-renderer`, but still has the OLD inline definitions of these same functions. Delete the following inline definitions from `process/route.ts` (the imports at the top already replace them):

1. Delete the `computeParcels` function (starts with `function computeParcels(`)
2. Delete the `centerlineToPolygon` function (starts with `function centerlineToPolygon(`)
3. Delete the `featuresToSvg` function (starts with `function featuresToSvg(`) and everything it contains
4. Delete the `roundedPolygonPath` function (starts with `function roundedPolygonPath(`)
5. Delete the `escapeXml` function (starts with `function escapeXml(`)
6. Delete the `clamp` function at the bottom (starts with `function clamp(`)

Do NOT delete `analyzeSiteImage`, `labelFeatures`, or the `POST` handler — those are unique to this file.

After deleting, run `npx tsc --noEmit` to verify no type errors. Fix any issues.

### Task 2: Update frontend page.tsx for address input

Modify `src/app/page.tsx` to add an "Address Lookup" input mode alongside the existing "Image Upload" mode.

**New state variables** (add near the top with other useState calls):
```typescript
const [inputMode, setInputMode] = useState<"image" | "address">("image");
const [addressInput, setAddressInput] = useState("");
const [radiusInput, setRadiusInput] = useState(200);
```

**Replace the heading "1. Upload Image"** with a mode toggle:
```tsx
<div className="flex gap-2 mb-4">
  <button onClick={() => setInputMode("image")}
    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
      inputMode === "image" ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
    }`}>Image Upload</button>
  <button onClick={() => setInputMode("address")}
    className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
      inputMode === "address" ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
    }`}>Address Lookup</button>
</div>
```

**When `inputMode === "address"`**, show an address text input + radius slider instead of the file upload area. When `inputMode === "image"`, show the existing file upload UI unchanged.

**Modify `handleProcess`** to call `/api/overpass` when in address mode:
- Detect if input looks like coordinates (`41.8781, -87.6298`) vs an address string
- Send `{ address, radius }` or `{ lat, lng, radius }` to `/api/overpass`
- Keep existing `/api/process` call for image mode

**Update the Generate button** `disabled` condition:
```typescript
disabled={(inputMode === "image" ? !image : !addressInput.trim()) || isProcessing}
```

**Update `clearAll`** to also reset `addressInput` and `radiusInput`.

After all changes, run `npx tsc --noEmit` to verify.

### Task 3: TypeScript check + smoke test

Run `npx tsc --noEmit`. Fix any errors. Verify the dev server starts without crashing.

### Task 4: Commit and push

Stage all new and modified files. Commit with message: "Add OpenStreetMap Overpass API integration for address-based site plans"

---

## PHASE 2: UI/UX Polish (independent tasks, any order)

### Task 5: SVG zoom and pan

The SVG preview in `page.tsx` is inside a fixed `aspect-video` div. Add mouse-wheel zoom and click-drag pan so users can inspect details.

Implementation approach in `src/app/page.tsx`:
- Add state: `svgTransform` with `{ scale: 1, x: 0, y: 0 }`
- Wrap the SVG `dangerouslySetInnerHTML` div in a container with `overflow: hidden`
- Apply CSS `transform: scale(${scale}) translate(${x}px, ${y}px)` to the inner div
- `onWheel`: adjust scale (clamp between 0.5 and 5)
- `onMouseDown/Move/Up`: drag to pan (only when scale > 1)
- Add a "Reset zoom" button that appears when zoomed
- Add `cursor: grab` / `cursor: grabbing` styles

### Task 6: Layer visibility toggles

Add a small panel below the SVG preview (or as a floating overlay) that lets users toggle visibility of feature layers: Buildings, Streets, Parcels, Vegetation, Water.

Implementation approach:
- Add state: `visibleLayers` as `Set<string>` initialized to all types
- Before passing `features` to `featuresToSvg`, filter by `visibleLayers`
- But since SVG is returned from the API as a string, a better approach is:
  - After receiving the result, re-render the SVG client-side by calling `/api/export` with filtered features when layers change
  - OR: simpler — add CSS classes to the SVG groups and toggle visibility with CSS. This requires modifying `featuresToSvg` in `src/lib/svg-renderer.ts` to wrap each feature type in a `<g class="layer-{type}">` group, then use CSS to hide/show them.
- Show toggle buttons/checkboxes for each layer type

### Task 7: SVG legend

Add a legend to the SVG output showing what each color represents. Modify `featuresToSvg` in `src/lib/svg-renderer.ts`.

Add a small legend box in the bottom-right corner of the SVG:
```svg
<g transform="translate(${vbW - 18}, ${vbH - 20})">
  <rect width="16" height="18" fill="white" fill-opacity="0.85" stroke="#ccc" stroke-width="0.1" rx="0.5"/>
  <text x="8" y="2" font-size="1.2" fill="#333" text-anchor="middle" font-weight="600">Legend</text>
  <!-- Building swatch + label -->
  <rect x="1" y="3.5" width="2.5" height="1.5" fill="#c8c8d0" stroke="#9898a4" stroke-width="0.15"/>
  <text x="4.5" y="5" font-size="0.9" fill="#555">Building</text>
  <!-- Street swatch + label -->
  <!-- Parcel, Vegetation, Water swatches similarly -->
</g>
```

Only include swatches for feature types that actually exist in the current plan.

### Task 8: OSM attribution

OpenStreetMap requires attribution when using their data. Add:

1. In `src/lib/svg-renderer.ts` — add a small "Data: OpenStreetMap" text next to the "Generated by HYLO-SP" watermark (only when data source is OSM, pass a flag)
2. In `src/app/page.tsx` — add a small footer link: "Map data from OpenStreetMap contributors" below the SVG preview when the result came from the Overpass API (check `result.tracingUsed === false`)

### Task 9: North arrow and scale bar in SVG preview

The export route already has north arrow and scale bar options, but the main SVG preview from `featuresToSvg` doesn't show them. Add optional north arrow (small compass icon top-right) and scale bar (bottom-left) to the SVG output.

Modify `featuresToSvg` in `src/lib/svg-renderer.ts` to accept optional params:
```typescript
function featuresToSvg(features, viewBoxDims?, options?: { showNorthArrow?: boolean; showScaleBar?: boolean; scaleMeters?: number })
```

North arrow: a simple triangle pointing up with "N" label at `(vbW - 4, 4)`.
Scale bar: a line with ticks and a meter label at `(4, vbH - 3)`.

### Task 10: Loading skeleton and progress feedback

Replace the generic "Processing..." spinner with a multi-step progress indicator.

In `src/app/page.tsx`:
- Add state: `processingStep` as string
- For image mode, show steps: "Analyzing pixels..." → "Detecting buildings..." → "Labeling features..." → "Rendering SVG..."
- For address mode, show steps: "Geocoding address..." → "Fetching OpenStreetMap data..." → "Converting features..." → "Rendering SVG..."
- Use a simple text label under the spinner that updates

To get real progress, modify the API routes to use streaming (Server-Sent Events) or just use timed fake steps on the client for now:
```typescript
useEffect(() => {
  if (!isProcessing) return;
  const steps = inputMode === "address"
    ? ["Geocoding address...", "Fetching map data...", "Building site plan..."]
    : ["Analyzing image...", "Detecting buildings...", "Rendering plan..."];
  let i = 0;
  setProcessingStep(steps[0]);
  const interval = setInterval(() => {
    i = Math.min(i + 1, steps.length - 1);
    setProcessingStep(steps[i]);
  }, 2000);
  return () => clearInterval(interval);
}, [isProcessing, inputMode]);
```

---

## PHASE 3: Features (independent tasks, any order)

### Task 11: Interactive map picker for address mode

When the user selects "Address Lookup" mode, show an interactive map (using Leaflet via CDN, no npm install needed) where they can click to select a location instead of typing an address.

Implementation:
- Add a `<div id="map-picker">` inside the address mode panel
- Load Leaflet CSS/JS from CDN in a `useEffect` (create `<link>` and `<script>` elements dynamically)
- Initialize a Leaflet map centered on a default location (e.g., Chicago)
- On map click, update `lat/lng` state and reverse-geocode via Nominatim to show the address
- Show a marker at the selected location
- Show a circle overlay visualizing the radius
- The radius slider should update the circle in real-time

Alternative simpler approach (no Leaflet): just show a static map image from OpenStreetMap tile URL based on the geocoded coordinates after the user types an address, as a confirmation step.

### Task 12: Building info panel (click-to-inspect)

When the user clicks on a building in the SVG preview, show a small info panel with details:
- Address / name (from OSM tags or GPT-4o label)
- Approximate dimensions (width x height in the viewBox, converted to estimated meters)
- Number of vertices in the polygon
- Feature type

Implementation:
- Modify `featuresToSvg` to add `data-feature-id` attributes to each building path
- In `page.tsx`, add an `onClick` handler on the SVG container that reads `data-feature-id` from the clicked element
- Look up the feature in `result.features` and show a small popover/panel

### Task 13: Export route improvements — use shared renderer

The export route (`src/app/api/export/route.ts`) has its own `generateStyledSvg` function that's separate from the shared `featuresToSvg` in `svg-renderer.ts`. Unify them:

1. Import `featuresToSvg` from `@/lib/svg-renderer` in the export route
2. For SVG export, use `featuresToSvg` with the full features array (not just buildings) so the exported SVG matches the preview
3. Keep `generateStyledSvg` only for the alternative render styles (blueprint, bw, architectural, minimal) where the styling is different
4. Make sure the DXF export also works correctly with the full Feature[] from Overpass

### Task 14: Recent searches / history

Save the last 5 address searches in `localStorage` and show them as clickable chips below the address input.

In `src/app/page.tsx`:
- On successful address lookup, save `{ address, lat, lng, timestamp }` to localStorage key `"hylo-sp-recent"`
- Show recent searches as small clickable chips below the address input
- Clicking a chip fills in the address and triggers the lookup
- Add a small "x" to clear individual items or "Clear all" link

### Task 15: Building heights from OSM for 3D

The Overpass query in `src/lib/overpass.ts` already fetches building tags. OSM buildings often have `building:levels` or `height` tags. Use these for 3D rendering:

1. In `overpass.ts`, when creating building features, extract `building:levels` and `height` tags and store them (add an optional `height` field to the Feature type in `geometry.ts`)
2. In the 3D rendering code in `page.tsx` (the Three.js section), use the height data to set building extrusion heights instead of a default value
3. Default to 3m per level if only `building:levels` is available, or 9m if no height data

### Task 16: Responsive mobile layout

The current layout uses `lg:grid-cols-3` which stacks on mobile but doesn't look great. Improve:

1. On mobile, make the input panel full-width at the top
2. Stack the SVG preview below it, also full-width
3. Make the export modal responsive (full-screen on mobile)
4. Ensure touch events work for SVG zoom/pan (if Task 5 is done)
5. Test that the password gate looks good on mobile
6. Add `<meta name="viewport" content="width=device-width, initial-scale=1">` if not already present

### Task 17: Dark mode polish

Go through all UI elements and ensure dark mode works well:

1. The SVG preview background should match dark mode (currently hardcoded to `#f0f0ee`)
2. Export modal should have proper dark borders and backgrounds
3. Input fields should have visible borders in dark mode
4. Error messages should be visible in dark mode
5. The password gate should look good in dark mode
6. Add a dark mode toggle button in the header (or use system preference)

### Task 18: Favicon and meta tags

1. Create a simple favicon (can be an SVG favicon): a small architectural plan icon or the letters "H-SP"
2. Add proper `<title>` and `<meta>` tags in `src/app/layout.tsx`:
   - Title: "HYLO-SP — Site Plan Generator"
   - Description: "Generate architectural site plans from satellite images or addresses"
   - Open Graph tags for social sharing
3. Add the favicon to `public/` directory

---

## PHASE 4: Advanced (independent tasks, any order)

### Task 19: PDF export (real PDF, not SVG fallback)

The current PDF export just returns SVG. Implement real PDF generation:

1. Install `jspdf` package: `npm install jspdf`
2. In `src/app/api/export/route.ts`, add a `generatePdf` function that:
   - Creates an A3 landscape PDF
   - Renders building polygons as PDF paths
   - Adds street labels as PDF text
   - Includes title block with project info, north arrow, scale bar
   - Adds a border and drawing number

### Task 20: Measurement tool

Add a measurement mode to the SVG preview where the user can click two points and see the distance between them.

1. Add a "Measure" button in the toolbar above the SVG
2. When active, change cursor to crosshair
3. First click sets point A (show a small dot)
4. Second click sets point B (show a line between A and B with the distance label)
5. Convert the viewBox distance to real meters (using lotSize or a configurable scale)
6. Click again to start a new measurement
7. Show distance in meters and feet

### Task 21: Multi-format download (zip bundle)

Add a "Download All" option in the export panel that generates SVG + DXF + PNG in one zip file.

1. Install `jszip` package or use the existing sharp for PNG
2. Generate all three formats
3. Bundle into a zip file
4. Download as `site-plan-bundle.zip`

### Task 22: Comparison view

Add a side-by-side view that shows the original input (image or map) next to the generated site plan.

1. For image mode: show the uploaded image on the left, SVG on the right
2. For address mode: show a static OpenStreetMap tile image on the left (fetch from `https://tile.openstreetmap.org/{z}/{x}/{y}.png`), SVG on the right
3. Add a slider/divider that the user can drag to compare
4. Or use a simple toggle: "Input | Output | Split"

### Task 23: Save/load projects

Let users save their site plan projects and load them later.

1. Add a "Save Project" button that serializes the current state (features, viewBox, settings) to JSON
2. Save to localStorage with a user-chosen name
3. Add a "Load Project" dropdown showing saved projects
4. Each project saves: features array, viewBox, input mode, address/coordinates, settings
5. Add "Delete project" and "Export project JSON" options

### Task 24: Collaborative annotations

Let users add text annotations, arrows, and dimension lines on top of the SVG.

1. Add an "Annotate" mode toggle
2. Tools: Text label, Arrow, Dimension line, Rectangle highlight
3. Store annotations as an overlay array in state
4. Render annotations as SVG elements on top of the site plan
5. Include annotations in exports (SVG and DXF)
6. Annotations should be draggable/editable
