# Star Finder — Technical Documentation

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture Overview](#3-architecture-overview)
4. [End-to-End Workflow: Image Upload to Star Identification](#4-end-to-end-workflow-image-upload-to-star-identification)
5. [Star Databases and Data Sources](#5-star-databases-and-data-sources)
6. [API Integrations](#6-api-integrations)
7. [Coordinate Systems and Projections](#7-coordinate-systems-and-projections)
8. [Live Sky View: Real-Time Constellation Overlay](#8-live-sky-view-real-time-constellation-overlay)
9. [Frontend Architecture](#9-frontend-architecture)
10. [Backend / Serverless Functions](#10-backend--serverless-functions)
11. [Data Flow Diagrams](#11-data-flow-diagrams)
12. [Configuration and Deployment](#12-configuration-and-deployment)

---

## 1. Project Overview

Star Finder is a web application that identifies stars and constellations in photographs of the night sky. Users can either upload an image of the night sky or use their phone's camera for a live augmented-reality overlay showing constellations in real time.

The app combines multiple approaches to achieve accurate star identification:
- **AI Vision Analysis** (GPT-4o) — quickly estimates what part of the sky a photo shows
- **Astrometric Plate Solving** (Astrometry.net) — precisely calibrates the photo's sky coordinates using pattern-matching against known star fields
- **Local Star Catalog** (HYG Database) — a comprehensive star database used to project and render stars onto the image once the sky region is known

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 16.1.6 with React 19.2.3 |
| **Language** | TypeScript (strict mode) |
| **Styling** | Tailwind CSS 4 + shadcn/ui component library |
| **UI Primitives** | Radix UI (Toast, Switch, Label, Scroll Area, Slot) |
| **Icons** | Lucide React |
| **Image Processing** | Sharp (server-side resizing/conversion) |
| **AI Vision** | OpenAI GPT-4o Vision API |
| **Plate Solving** | Astrometry.net REST API |
| **Astronomical Data** | SIMBAD (Strasbourg Astronomical Data Center) |
| **Star Catalog** | HYG (Hipparcos-Yale-Gliese) bright star dataset |
| **Rendering** | HTML5 Canvas (both image overlay and live camera view) |
| **Deployment** | Vercel (serverless functions, 60-second timeout) |

---

## 3. Architecture Overview

The application follows a Next.js App Router structure:

```
src/
├── app/
│   ├── page.tsx                    # Main page (state machine: upload → loading → results)
│   ├── layout.tsx                  # Root layout
│   ├── api/
│   │   ├── analyze/route.ts        # Core analysis endpoint (POST)
│   │   ├── astrometry/route.ts     # Astrometry.net proxy endpoints
│   │   └── star-info/route.ts      # SIMBAD star info proxy (GET)
├── components/
│   ├── upload-zone.tsx             # Drag-drop upload + camera input
│   ├── canvas-overlay.tsx          # Constellation canvas overlay on uploaded image
│   ├── constellation-panel.tsx     # Sidebar listing identified constellations
│   ├── camera-view.tsx             # Live camera with real-time constellation overlay
│   ├── star-detail.tsx             # Modal with detailed star properties
│   ├── loading-state.tsx           # Progress bar during analysis
│   ├── toggle-controls.tsx         # UI toggles for lines/labels
│   └── star-background.tsx         # Decorative animated star background
├── hooks/
│   ├── use-analysis.ts             # Image resize, API calls, status tracking
│   └── use-mobile.tsx              # Mobile device detection
├── lib/
│   ├── astrometry.ts               # Astrometry.net API client
│   ├── gpt4o-stars.ts              # GPT-4o vision analysis
│   ├── coordinates.ts              # Gnomonic projection & affine transforms
│   ├── celestial.ts                # RA/Dec ↔ Alt/Az conversions for live view
│   ├── constellation-lines.ts      # Stick-figure constellation connections (HIP pairs)
│   ├── star-chart-renderer.ts      # SVG export of star charts
│   └── types.ts                    # TypeScript interfaces (Star, Constellation, etc.)
└── public/
    └── data/
        ├── hyg-bright.json          # Star catalog (~120,000 stars, 922 KB)
        └── constellation-index.json # Constellation → HIP ID index
```

---

## 4. End-to-End Workflow: Image Upload to Star Identification

### Phase 1: Image Ingestion

1. The user uploads a night sky photograph via drag-and-drop, file picker, or camera capture (in `UploadZone` component).
2. On mobile devices, the image is resized before upload to reduce bandwidth: max 1,500px on the longest dimension, JPEG quality 0.75. On desktop, the limit is 2,000px at quality 0.85. This is handled by `resizeImage()` in `use-analysis.ts`.
3. The image is converted to a base64 data URL and sent as a `POST` request to `/api/analyze` along with the image dimensions.

### Phase 2: Dual-API Race Strategy

The backend (`/app/api/analyze/route.ts`) employs a clever **parallel race** between two analysis methods:

**Method A — Astrometry.net (Accurate but Slow)**
Astrometry.net is a professional-grade astrometric plate solver. It works by extracting star patterns from the image and matching them against its index of known star field "quads" (groups of 4 stars). This is the gold standard for sky calibration but can take 30-120 seconds.

Steps:
1. Login to Astrometry.net API with an API key → receive session token
2. Upload the image with scale hints (10°–180° field of view) and downsample factor 2
3. Poll the submission endpoint every 3 seconds until a job ID is assigned
4. Poll the job endpoint every 3 seconds until the job succeeds or fails (up to 180 seconds)
5. Fetch calibration results: center RA/Dec, plate scale (arcsec/pixel), orientation, and field radius

**Method B — GPT-4o Vision (Fast but Approximate)**
GPT-4o is sent the image along with a detailed system prompt instructing it to act as a "world-class astronomer." It returns:
- `centerRA` — Right Ascension of image center in hours (0–24)
- `centerDec` — Declination of image center in degrees (-90 to +90)
- `horizontalFOV` — Horizontal field of view in degrees
- `orientation` — Rotation angle from celestial north
- `constellations` — List of IAU 3-letter abbreviation codes for all visible constellations

This typically returns within 2–5 seconds.

**The Race Logic:**
```
If both API keys are available:
  1. Start GPT-4o AND Astrometry.net in parallel
  2. Wait for GPT-4o to return (fast)
  3. Give Astrometry.net a 5-second window to finish
  4. If Astrometry.net finishes → use it (more accurate)
  5. Otherwise → use GPT-4o result enhanced with catalog data

If only Astrometry.net key → use Astrometry.net only
If only OpenAI key → use GPT-4o only
If both fail → sequential GPT-4o retry
```

### Phase 3: Star Projection

Once a "field estimate" is obtained (center RA/Dec, FOV, orientation), all bright catalog stars (magnitude < 5.5, approximately ~3,000 stars visible to the naked eye) are projected onto the image plane using **gnomonic (tangent-plane) projection**.

The gnomonic projection works by:
1. Computing the angular offset of each star from the field center in RA/Dec
2. Projecting this offset onto a flat tangent plane using spherical trigonometry
3. Converting from radians to pixel coordinates using the plate scale (arcsec/pixel)
4. Applying rotation to compensate for camera orientation
5. Centering on the image and filtering out stars outside the frame

For Astrometry.net results, the calibration parameters are used directly. For GPT-4o results, a "synthetic calibration" is built from the field estimate, and the `enhanceWithCatalog()` function projects the full catalog using these estimated parameters.

### Phase 4: Constellation Assembly

The `buildConstellations()` function:
1. Groups all projected stars by their IAU constellation abbreviation
2. For each constellation, looks up the stick-figure connections from `constellation-lines.ts` — these are pairs of Hipparcos IDs (e.g., `[54061, 53910]` connects Dubhe to Merak in Ursa Major)
3. Checks which connection endpoints are both present in the projected stars
4. Builds an indexed list of stars and connections for rendering
5. Identifies the brightest star in each visible constellation

### Phase 5: Coordinate Normalization and Response

All pixel coordinates are normalized to a 0–1000 canvas coordinate system for consistent rendering regardless of image dimensions. The response includes:
- `constellations[]` — Each with stars, connections, name, and description
- `allStars[]` — All projected stars for background rendering
- `fieldDescription` — Human-readable description of the sky region
- `source` — Either `'astrometry'` or `'gpt4o-fallback'`
- `processingTime` — Milliseconds elapsed

### Phase 6: Frontend Rendering

The `CanvasOverlay` component renders the results on an HTML5 Canvas layered over the uploaded image:
- **Stars** are drawn as circles sized proportionally to brightness (brighter = larger)
- **Star colors** are derived from the B-V color index: blue for hot O/B-type stars, white for A-type, yellow for G-type (Sun-like), orange for K-type, and red for cool M-type stars
- **Constellation lines** connect stars with semi-transparent lines, with glow effects when highlighted
- **Labels** display constellation names, togglable by the user
- The `ConstellationPanel` sidebar lists all found constellations with mythological descriptions and visibility information

---

## 5. Star Databases and Data Sources

### 5.1 HYG Star Catalog (Primary)

**File:** `public/data/hyg-bright.json` (922 KB)

The HYG database is a composite catalog that merges data from three major astronomical catalogs:

- **Hipparcos Catalog (HIP)** — The European Space Agency's Hipparcos satellite (1989–1993) measured precise positions, proper motions, and parallaxes for ~118,000 stars. It provided the most accurate star positions available at the time, with positional accuracy of ~1 milliarcsecond. The Hipparcos ID (HIP number) serves as the primary identifier in Star Finder for linking stars to constellation stick figures.

- **Yale Bright Star Catalog (BSC/YBS)** — Originally compiled at Yale University, this catalog contains all 9,110 stars brighter than magnitude 6.5 (approximately the naked-eye visibility limit). It provides supplementary data including proper names (e.g., "Sirius," "Vega"), Bayer designations (e.g., "Alpha Canis Majoris"), Flamsteed numbers, and spectral classifications.

- **Gliese Catalog of Nearby Stars (GJ/Gl)** — A catalog of stars within 25 parsecs (~82 light-years) of the Sun, maintained by the Astronomisches Rechen-Institut in Heidelberg. It contributes nearby star data including distance estimates and spectral types.

**Fields used by Star Finder:**

| Field | Description | Example |
|-------|-------------|---------|
| `id` | Unique row ID | `32349` |
| `hip` | Hipparcos catalog number | `32349` |
| `name` | Common proper name | `"Sirius"` |
| `bf` | Bayer/Flamsteed designation | `"9Alp CMa"` |
| `ra` | Right Ascension (stored in hours in JSON, converted to degrees on load by multiplying by 15) | `6.752` → `101.28°` |
| `dec` | Declination in degrees | `-16.716°` |
| `mag` | Apparent visual magnitude (smaller = brighter; Sirius = -1.46) | `-1.46` |
| `ci` | B-V Color Index (blue/hot stars ≈ -0.3, red/cool stars ≈ +2.0) | `0.009` |
| `con` | IAU constellation abbreviation | `"CMa"` |
| `sp` | Spectral type classification | `"A1V"` |

**Processing pipeline:** A build script (`scripts/process-hyg.ts`) processes the raw HYG CSV into the optimized JSON file, selecting only necessary fields and filtering to bright stars.

### 5.2 Constellation Stick-Figure Lines

**File:** `src/lib/constellation-lines.ts`

This file contains hand-curated stick-figure connections for **30 major constellations**. Each constellation is represented as an array of Hipparcos ID pairs — each pair defines one line segment of the constellation figure.

Supported constellations:
- **Northern:** Ursa Major, Ursa Minor, Cassiopeia, Cygnus, Draco, Cepheus, Perseus, Andromeda, Pegasus, Auriga, Gemini, Leo, Bootes, Corona Borealis, Hercules, Lyra
- **Zodiac:** Taurus, Virgo, Libra, Scorpius, Sagittarius, Capricornus, Aquarius, Pisces, Aries
- **Southern:** Orion, Canis Major, Corvus, Crater, Aquila

Example — Ursa Major (the Big Dipper) is defined by 7 HIP pairs:
```
Dubhe(54061) ↔ Merak(53910)
Merak(53910) ↔ Phecda(54539)
Phecda(54539) ↔ Megrez(59774)
Megrez(59774) ↔ Alioth(62956)
Alioth(62956) ↔ Mizar(65378)
Mizar(65378) ↔ Alkaid(67301)
Phecda(54539) ↔ Dubhe(54061)   // closes the "bowl"
```

### 5.3 Constellation Index

**File:** `public/data/constellation-index.json`

A pre-computed lookup table mapping each IAU constellation abbreviation to the list of all Hipparcos IDs belonging to that constellation. This enables quick membership checks without scanning the entire catalog.

### 5.4 SIMBAD (Secondary / On-Demand)

**API Endpoint:** `https://simbad.cds.unistra.fr/`

SIMBAD (Set of Identifications, Measurements, and Bibliography for Astronomical Data) is maintained by the Centre de Données astronomiques de Strasbourg (CDS) in France. Star Finder queries SIMBAD through the `/api/star-info` proxy route when a user clicks on a star to see detailed information.

SIMBAD provides:
- **Object type** — e.g., "Star", "Double Star", "Variable Star", "Nebula"
- **Spectral type** — Full MK spectral classification (e.g., "A0V" for Vega, "M1Ia-Iab" for Betelgeuse)
- **Parallax** — Measured in milliarcseconds; used to calculate distance (distance in parsecs = 1000 / parallax in mas)
- **Distance** — Computed from parallax
- **Radial velocity** — The star's motion toward or away from us

Two query modes are supported:
1. **By name:** Uses ADQL (Astronomical Data Query Language) via the TAP (Table Access Protocol) interface
2. **By coordinates:** Uses a cone search — returns all objects within a given angular radius (default 5 arcseconds) of the specified RA/Dec

### 5.5 Astrometry.net Index (Indirect)

Astrometry.net maintains its own proprietary index of star field "quads" — geometric patterns of 4 stars — derived from the USNO-B, 2MASS, and Tycho-2 catalogs. Star Finder does not access this index directly; instead, it sends images to the Astrometry.net service, which performs the pattern matching internally and returns calibration parameters.

---

## 6. API Integrations

### 6.1 Astrometry.net REST API

Astrometry.net is a free, open-source plate solving service hosted at `nova.astrometry.net`. Plate solving is the process of determining the precise celestial coordinates of an astronomical image by matching star patterns.

**Authentication Flow:**
```
POST http://nova.astrometry.net/api/login
Body: request-json={"apikey": "<key>"}
Response: { "status": "success", "session": "<session_token>" }
```

**Image Upload:**
```
POST http://nova.astrometry.net/api/upload
Body: multipart/form-data
  - request-json: { session, scale_units: "degwidth", scale_lower: 10,
                     scale_upper: 180, downsample_factor: 2 }
  - file: <image binary>
Response: { "status": "success", "subid": 12345 }
```

The scale hints (10°–180° field of view) tell the solver to look for wide-field solutions, which dramatically improves solve rate and speed for typical night sky photos. The downsample factor reduces resolution by half for faster processing.

**Polling Cycle:**
```
GET /api/submissions/{subId}     → Wait for job ID (poll every 3s)
GET /api/jobs/{jobId}            → Wait for completion (poll every 3s, up to 180s)
GET /api/jobs/{jobId}/info       → Fetch calibration data
GET /api/jobs/{jobId}/annotations → Fetch identified objects
```

**Calibration Output:**
- `ra` / `dec` — Center of field in degrees
- `orientation` — Position angle (degrees east of north)
- `pixscale` — Plate scale in arcseconds per pixel
- `radius` — Angular radius of the field in degrees
- `width_arcsec` / `height_arcsec` — Field dimensions

### 6.2 OpenAI GPT-4o Vision API

GPT-4o is used as a fast, approximate "first pass" for identifying the sky region. The image is sent as a high-detail base64-encoded JPEG in a vision API call.

**Request:**
```
POST https://api.openai.com/v1/chat/completions
Model: gpt-4o
Temperature: 0.2 (low, for consistent results)
Response format: JSON object
Max tokens: 2048
```

**System prompt** instructs GPT-4o to act as a "world-class astronomer" and return:
- Field center coordinates (RA in hours, Dec in degrees)
- Horizontal field of view estimate
- Camera orientation relative to celestial north
- List of IAU constellation abbreviations visible in the image

**Key insight:** Star Finder does NOT use GPT-4o to place individual stars. Instead, GPT-4o's field estimate is used as input to the gnomonic projection math, which then places stars from the HYG catalog with proper mathematical accuracy. GPT-4o answers "where is the camera pointing?" and the catalog + math answer "where exactly are the stars?"

### 6.3 SIMBAD TAP/Cone Search

Proxied through `/api/star-info/route.ts` to avoid CORS issues.

**By name (TAP/ADQL):**
```
GET https://simbad.cds.unistra.fr/simbad/sim-tap/sync
  ?request=doQuery&lang=adql&format=json
  &query=SELECT main_id, otype_txt, sp_type, plx_value, rvz_radvel
         FROM basic WHERE main_id = '<star_name>'
```

**By coordinates (Cone search):**
```
GET https://simbad.cds.unistra.fr/simbad/sim-coo
  ?Coord=<ra>+<dec>&CooFrame=FK5&CooEpoch=2000&Radius=5&Radius.unit=arcsec
  &output.format=JSON
```

### 6.4 IP Geolocation (Fallback for Live Sky)

```
GET https://ipapi.co/json/
```
Used in the `CameraView` component as a fallback if the user denies GPS permission. Returns city-level latitude/longitude. No API key required. If this also fails, defaults to New York (40.7°N, 74.0°W).

---

## 7. Coordinate Systems and Projections

### 7.1 Celestial Coordinate Systems

**Equatorial Coordinates (RA/Dec):**
- **Right Ascension (RA):** Measured in hours (0–24h) or degrees (0–360°). Equivalent to longitude on the celestial sphere. The HYG catalog stores RA in hours; Star Finder converts to degrees by multiplying by 15.
- **Declination (Dec):** Measured in degrees (-90° to +90°). Equivalent to latitude. +90° is the north celestial pole (near Polaris).

**Horizontal Coordinates (Alt/Az):**
- **Altitude (Alt):** Angle above the observer's horizon (0° = horizon, 90° = zenith).
- **Azimuth (Az):** Compass bearing (0° = North, 90° = East, 180° = South, 270° = West).
- These depend on the observer's location and the current time.

### 7.2 Gnomonic (Tangent-Plane) Projection

Star Finder uses gnomonic projection for both image overlay and live camera view. This is the standard projection for astronomical imaging because it preserves straight lines — great circles on the celestial sphere (which constellation lines approximate) map to straight lines on the image.

**Mathematical formulation** (from `coordinates.ts`):

Given a star at (RA, Dec) and a field center at (RA₀, Dec₀):

```
ξ = cos(Dec) × sin(RA - RA₀) / D
η = [cos(Dec₀) × sin(Dec) - sin(Dec₀) × cos(Dec) × cos(RA - RA₀)] / D

where D = sin(Dec₀) × sin(Dec) + cos(Dec₀) × cos(Dec) × cos(RA - RA₀)
```

If D ≤ 0, the star is behind the projection center (more than 90° away) and is discarded.

The tangent-plane coordinates (ξ, η) in radians are then converted to pixels:
```
pixscale_rad = (pixscale_arcsec / 3600) × π/180
dx = (ξ × cos(orient) + η × sin(orient)) / pixscale_rad
dy = (-ξ × sin(orient) + η × cos(orient)) / pixscale_rad
px = imgWidth/2 + dx
py = imgHeight/2 - dy
```

### 7.3 Affine Transform (GPT-4o Star Matching)

For cases where matched star positions are available, Star Finder can fit an affine transform using least-squares regression. This maps standard coordinates (ξ, η) to pixel coordinates (px, py) via:

```
px = a×ξ + b×η + c
py = d×ξ + e×η + f
```

The 6 coefficients (a, b, c, d, e, f) are solved using the normal equations (A^T × A)x = A^T × b with Cramer's rule. This requires at least 3 matched stars; a fallback for exactly 2 stars fits a simpler rotation+scale+translation model.

### 7.4 Sidereal Time Computation

For the live sky view, converting between RA/Dec and Alt/Az requires knowing the Local Sidereal Time:

```
Julian Date:   JD = Unix_ms / 86400000 + 2440587.5
GMST (degrees): θ = 280.46061837 + 360.98564736629 × (JD - 2451545.0)
                    + 0.000387933 × T² - T³/38710000
                where T = (JD - 2451545.0) / 36525
LST:           LST = GMST + observer_longitude
```

---

## 8. Live Sky View: Real-Time Constellation Overlay

The `CameraView` component provides an augmented-reality experience by overlaying constellations on the live camera feed.

### 8.1 Location Acquisition

Three-tier fallback:
1. **Browser Geolocation API** — High-accuracy GPS with 10-second timeout
2. **IP Geolocation** (`ipapi.co/json/`) — If GPS is denied
3. **Hardcoded default** — New York (40.7°N, 74.0°W) if all else fails

### 8.2 Device Orientation (Compass)

**iOS (iPhone/iPad):**
- Requires explicit permission via `DeviceOrientationEvent.requestPermission()` (mandatory since iOS 13)
- Uses the `deviceorientation` event
- Reads `webkitCompassHeading` for true compass heading (0–360° clockwise from magnetic north)
- `beta` = pitch (90° when phone is vertical/level)

**Android/Chrome:**
- Prefers `deviceorientationabsolute` event for true compass heading
- Falls back to standard `deviceorientation` if absolute is unavailable
- Converts `alpha` (counterclockwise from north) to clockwise azimuth: `(360 - alpha) % 360`

**Sensor fusion:**
- `alpha` → yaw/azimuth (compass heading)
- `beta` → pitch/tilt (90° = phone vertical, <90° = tilted up at sky)
- `gamma` → roll (camera rotation)

### 8.3 Real-Time Projection Pipeline

Running at 60 FPS on the canvas:

1. **Compute Local Sidereal Time** from current Date + observer longitude
2. **For each bright star** (~1,000 stars with magnitude < 4.5):
   a. Convert RA/Dec → Alt/Az using observer latitude and LST
   b. Filter out stars below -5° altitude (below horizon with small margin)
   c. Project Alt/Az → camera tangent-plane using gnomonic projection centered on camera pointing direction (derived from compass heading and phone tilt)
   d. Apply camera roll rotation
   e. Convert tangent-plane coordinates to pixel coordinates using 65° assumed horizontal FOV
3. **Draw constellation lines** where both endpoints of a connection are visible
4. **Draw star dots** scaled by magnitude
5. **Draw constellation labels** at the centroid of visible stars

### 8.4 Camera Projection Math

From `celestial.ts`, the camera projection converts Alt/Az to screen pixels:

1. Convert star and camera Alt/Az to 3D unit vectors in East-North-Up coordinates
2. Compute dot product — if ≤ 0.01, star is behind camera
3. Project onto tangent plane using camera's "right" vector (horizontal perpendicular) and "up" vector
4. Apply camera roll rotation
5. Convert from angular tangent-plane to pixels: `scale = viewWidth / (2 × tan(hFov/2))`

---

## 9. Frontend Architecture

### 9.1 Main Page State Machine

`app/page.tsx` manages a three-state flow:
- **`"upload"`** — Shows the `UploadZone` for image selection
- **`"loading"`** — Shows `LoadingState` with a progress bar during analysis
- **`"results"`** — Shows the image with `CanvasOverlay` + `ConstellationPanel` sidebar

### 9.2 Key Components

| Component | File | Responsibility |
|-----------|------|----------------|
| **UploadZone** | `upload-zone.tsx` | Drag-drop area, file picker, camera capture button, "Live Sky View" button |
| **LoadingState** | `loading-state.tsx` | Animated spinner and progress bar during analysis |
| **CanvasOverlay** | `canvas-overlay.tsx` | Renders uploaded image as background, draws stars and constellation lines on canvas |
| **ConstellationPanel** | `constellation-panel.tsx` | Scrollable sidebar listing identified constellations with descriptions and mythology |
| **CameraView** | `camera-view.tsx` | Full-screen live camera with real-time constellation overlay using GPS + compass |
| **StarDetail** | `star-detail.tsx` | Modal popup showing star properties (name, magnitude, RA/Dec, spectral type, SIMBAD data) |
| **ToggleControls** | `toggle-controls.tsx` | Toggle switches for constellation lines, labels, and a reset button |
| **StarBackground** | `star-background.tsx` | Decorative animated starfield behind the UI (200 pulsing stars on canvas) |

### 9.3 Custom Hooks

**`useAnalysis()`** — Manages the entire analysis lifecycle:
- `resizeImage()` — Client-side image downscaling for mobile bandwidth
- Sends POST to `/api/analyze`
- Tracks loading status and error states
- Handles retry with `useFallback` flag

**`useIsMobile()`** — Detects mobile devices for responsive behavior adjustments.

### 9.4 SVG Star Chart Export

`lib/star-chart-renderer.ts` generates a downloadable SVG document of the constellation chart with:
- Dark background
- Stars sized by magnitude, colored by spectral type (B-V color index mapping)
- Glow effects on brighter stars
- Constellation lines and labels
- Optional title

---

## 10. Backend / Serverless Functions

### 10.1 POST `/api/analyze`

The core analysis endpoint. Accepts:
```json
{
  "image": "data:image/jpeg;base64,...",
  "width": 1920,
  "height": 1080,
  "useFallback": false
}
```

Processing pipeline:
1. Decode base64 image to Buffer
2. Load HYG star catalog from disk (synchronous, cached)
3. Execute dual-API race (or single-API depending on available keys)
4. Project catalog stars onto image plane
5. Build constellation stick figures
6. Normalize coordinates to 0–1000 canvas space
7. Return JSON with constellations, stars, metadata

Timeout: 60 seconds (configured in `vercel.json`).

### 10.2 POST/GET `/api/astrometry`

Intermediate proxy endpoints for manual Astrometry.net interaction:
- **POST:** Uploads image to Astrometry.net
- **GET:** Polls submission status or fetches job results

### 10.3 GET `/api/star-info`

SIMBAD proxy endpoint. Accepts query parameters:
- `name` — Star name for TAP/ADQL lookup
- `ra` + `dec` — Coordinates for cone search
- `radius` — Search radius in arcseconds (default: 5)

Returns object type, spectral type, distance, and other properties.

---

## 11. Data Flow Diagrams

### Image Analysis Flow

```
User Photo Upload
       │
       ▼
┌─────────────────────┐
│  Image Resize        │ (mobile: 1500px/0.75q, desktop: 2000px/0.85q)
│  (use-analysis.ts)   │
└─────────┬───────────┘
          │ POST /api/analyze (base64, width, height)
          ▼
┌─────────────────────┐
│  Load HYG Catalog    │ ← public/data/hyg-bright.json
│  (~120,000 stars)    │
└─────────┬───────────┘
          │
          ├────────────────────────────────────┐
          ▼                                    ▼
┌──────────────────┐              ┌──────────────────────┐
│  GPT-4o Vision    │              │  Astrometry.net       │
│  (2-5 seconds)    │              │  (30-120 seconds)     │
│                   │              │                       │
│  Returns:         │              │  Returns:             │
│  - Center RA/Dec  │              │  - Precise RA/Dec     │
│  - FOV estimate   │              │  - Plate scale        │
│  - Orientation    │              │  - Orientation        │
│  - Constellation  │              │  - Field radius       │
│    list           │              │                       │
└────────┬─────────┘              └──────────┬────────────┘
         │                                    │
         │◄──── 5-second window ─────────────►│
         │        (prefer astrometry          │
         │         if it finishes)            │
         ▼                                    ▼
┌─────────────────────────────────────────────────────────┐
│  Gnomonic Projection                                     │
│  Project bright catalog stars (mag < 5.5) onto image     │
│  using calibration/field estimate parameters             │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Build Constellations                                    │
│  Match projected stars to HIP pairs in constellation-    │
│  lines.ts → stick-figure connections                     │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Normalize to Canvas Coordinates (0-1000)                │
│  Return JSON response to frontend                        │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Canvas Overlay Rendering                                │
│  - Star dots (sized by magnitude, colored by B-V index)  │
│  - Constellation lines (with glow on highlight)          │
│  - Labels (togglable)                                    │
│  - Constellation panel with mythology                    │
└─────────────────────────────────────────────────────────┘
```

### Live Sky View Flow

```
┌──────────────────┐     ┌──────────────────┐
│  GPS Location     │     │  Device Compass   │
│  (or IP fallback) │     │  (alpha/beta/     │
│                   │     │   gamma sensors)  │
└────────┬─────────┘     └────────┬──────────┘
         │                         │
         ▼                         ▼
┌─────────────────────────────────────────────┐
│  Compute Local Sidereal Time                 │
│  LST = GMST(now) + observer_longitude        │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│  For each bright star (~1,000):              │
│  1. RA/Dec → Alt/Az (using lat, LST)         │
│  2. Filter: altitude > -5°                   │
│  3. Alt/Az → Camera projection               │
│     (gnomonic, centered on phone direction)  │
│  4. Apply roll rotation                      │
│  5. Convert to screen pixels                 │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│  Canvas Render @ 60 FPS                      │
│  - Camera video feed (background)            │
│  - Star dots                                 │
│  - Constellation lines                       │
│  - Constellation labels                      │
│  Updates every frame as phone moves          │
└─────────────────────────────────────────────┘
```

---

## 12. Configuration and Deployment

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | At least one of these two | OpenAI API key for GPT-4o vision analysis |
| `ASTROMETRY_API_KEY` | At least one of these two | Astrometry.net API key for plate solving |
| `NEXT_PUBLIC_APP_URL` | Optional | Application URL (defaults to `http://localhost:3000`) |

### Vercel Configuration (`vercel.json`)

```json
{
  "functions": {
    "src/app/api/analyze/route.ts": {
      "maxDuration": 60
    }
  }
}
```

The 60-second timeout is necessary because Astrometry.net plate solving can take 30–120 seconds. The GPT-4o fallback ensures users still get results even if plate solving times out.

### Next.js Configuration

```typescript
// next.config.ts
{
  serverExternalPackages: ["sharp"]
}
```

Sharp is listed as a server external package so it can use native binaries for image processing.

### Build and Run

```bash
npm install          # Install dependencies
npm run dev          # Development server on localhost:3000
npm run build        # Production build
npm run start        # Production server
npm run process-hyg  # Regenerate star catalog from raw HYG data
```

---

---

# Star Finder — 技術文件（繁體中文）

## 目錄

1. [專案概述](#1-專案概述)
2. [技術堆疊](#2-技術堆疊)
3. [架構總覽](#3-架構總覽)
4. [端對端工作流程：從圖片上傳到星體辨識](#4-端對端工作流程從圖片上傳到星體辨識)
5. [星體資料庫與資料來源](#5-星體資料庫與資料來源)
6. [API 整合](#6-api-整合)
7. [座標系統與投影方法](#7-座標系統與投影方法)
8. [即時星空模式：即時星座疊加](#8-即時星空模式即時星座疊加)
9. [前端架構](#9-前端架構)
10. [後端 / 無伺服器函式](#10-後端--無伺服器函式)
11. [資料流程圖](#11-資料流程圖)
12. [設定與部署](#12-設定與部署)

---

## 1. 專案概述

Star Finder 是一款 Web 應用程式，能夠辨識夜空照片中的恆星與星座。使用者可以上傳夜空照片，或使用手機相機進行即時的擴增實境星座疊加顯示。

本應用結合多種方式達成精確的星體辨識：
- **AI 視覺分析**（GPT-4o）— 快速估算照片所拍攝的天區
- **天文定位解算**（Astrometry.net）— 透過星場圖案比對，精確校準照片的天球座標
- **本地星體目錄**（HYG 資料庫）— 在確定天區後，使用完整的恆星資料庫將星體投影並渲染至影像上

---

## 2. 技術堆疊

| 層級 | 技術 |
|------|------|
| **框架** | Next.js 16.1.6 搭配 React 19.2.3 |
| **語言** | TypeScript（嚴格模式）|
| **樣式** | Tailwind CSS 4 + shadcn/ui 元件庫 |
| **UI 基礎元件** | Radix UI（Toast、Switch、Label、Scroll Area、Slot）|
| **圖示** | Lucide React |
| **影像處理** | Sharp（伺服器端縮放/轉換）|
| **AI 視覺** | OpenAI GPT-4o Vision API |
| **定位解算** | Astrometry.net REST API |
| **天文資料** | SIMBAD（斯特拉斯堡天文資料中心）|
| **星體目錄** | HYG（依巴谷-耶魯-格利澤）亮星資料集 |
| **渲染** | HTML5 Canvas（影像疊加層與即時相機畫面）|
| **部署** | Vercel（無伺服器函式，60 秒逾時限制）|

---

## 3. 架構總覽

本應用程式採用 Next.js App Router 結構：

```
src/
├── app/
│   ├── page.tsx                    # 主頁面（狀態機：上傳 → 載入中 → 結果）
│   ├── layout.tsx                  # 根佈局
│   ├── api/
│   │   ├── analyze/route.ts        # 核心分析端點（POST）
│   │   ├── astrometry/route.ts     # Astrometry.net 代理端點
│   │   └── star-info/route.ts      # SIMBAD 星體資訊代理（GET）
├── components/
│   ├── upload-zone.tsx             # 拖放上傳 + 相機輸入
│   ├── canvas-overlay.tsx          # 上傳影像上的星座 Canvas 疊加層
│   ├── constellation-panel.tsx     # 側邊欄列出已辨識的星座
│   ├── camera-view.tsx             # 即時相機搭配即時星座疊加
│   ├── star-detail.tsx             # 星體詳細資訊彈出視窗
│   ├── loading-state.tsx           # 分析中的進度條
│   ├── toggle-controls.tsx         # 連線/標籤的切換開關
│   └── star-background.tsx         # 裝飾性動態星空背景
├── hooks/
│   ├── use-analysis.ts             # 影像縮放、API 呼叫、狀態追蹤
│   └── use-mobile.tsx              # 行動裝置偵測
├── lib/
│   ├── astrometry.ts               # Astrometry.net API 客戶端
│   ├── gpt4o-stars.ts              # GPT-4o 視覺分析
│   ├── coordinates.ts              # 日心投影與仿射變換
│   ├── celestial.ts                # 赤經/赤緯 ↔ 高度/方位 轉換（即時模式）
│   ├── constellation-lines.ts      # 星座連線（依巴谷 ID 配對）
│   ├── star-chart-renderer.ts      # SVG 星圖匯出
│   └── types.ts                    # TypeScript 介面（Star、Constellation 等）
└── public/
    └── data/
        ├── hyg-bright.json          # 星體目錄（約 120,000 顆星，922 KB）
        └── constellation-index.json # 星座 → 依巴谷 ID 索引
```

---

## 4. 端對端工作流程：從圖片上傳到星體辨識

### 第一階段：影像輸入

1. 使用者透過拖放、檔案選擇器或相機拍攝上傳夜空照片（`UploadZone` 元件）。
2. 在行動裝置上，影像會在上傳前縮小以減少頻寬：最長邊不超過 1,500 像素，JPEG 品質 0.75。桌面端限制為 2,000 像素，品質 0.85。此處理由 `use-analysis.ts` 中的 `resizeImage()` 執行。
3. 影像轉換為 base64 資料 URL，以 `POST` 請求傳送至 `/api/analyze`，同時附帶影像尺寸。

### 第二階段：雙 API 競速策略

後端（`/app/api/analyze/route.ts`）採用巧妙的**平行競速**策略，同時使用兩種分析方法：

**方法 A — Astrometry.net（精確但緩慢）**
Astrometry.net 是專業級的天文定位解算服務。其原理是從影像中擷取星體圖案，並與已知星場「四星組」（4 顆星的幾何圖案）索引進行比對。這是天空校準的黃金標準，但可能需要 30–120 秒。

步驟：
1. 使用 API 金鑰登入 Astrometry.net API → 取得工作階段權杖
2. 上傳影像，附帶比例提示（10°–180° 視野範圍）和降採樣因子 2
3. 每 3 秒輪詢提交端點，直到分配工作 ID
4. 每 3 秒輪詢工作端點，直到工作完成或失敗（最長 180 秒）
5. 取得校準結果：中心赤經/赤緯、像素比例（角秒/像素）、方向和視野半徑

**方法 B — GPT-4o 視覺（快速但近似）**
GPT-4o 接收影像及詳細的系統提示，指示其扮演「世界級天文學家」的角色。回傳：
- `centerRA` — 影像中心的赤經（小時，0–24）
- `centerDec` — 影像中心的赤緯（度，-90 到 +90）
- `horizontalFOV` — 水平視野（度）
- `orientation` — 相對於天球北極的旋轉角度
- `constellations` — 所有可見星座的 IAU 三字母縮寫列表

此方法通常在 2–5 秒內回傳。

**競速邏輯：**
```
若兩組 API 金鑰皆可用：
  1. 同時啟動 GPT-4o 和 Astrometry.net
  2. 等待 GPT-4o 回傳（快速）
  3. 給予 Astrometry.net 5 秒的完成視窗
  4. 若 Astrometry.net 完成 → 使用其結果（更精確）
  5. 否則 → 使用經目錄增強的 GPT-4o 結果

若僅有 Astrometry.net 金鑰 → 僅使用 Astrometry.net
若僅有 OpenAI 金鑰 → 僅使用 GPT-4o
若兩者皆失敗 → 依序重試 GPT-4o
```

### 第三階段：星體投影

取得「視野估計」（中心赤經/赤緯、視野範圍、方向）後，所有明亮的目錄星體（視星等 < 5.5，約 3,000 顆肉眼可見的星）透過**日心（切面）投影**投射至影像平面。

日心投影的運作方式：
1. 計算每顆星與視野中心在赤經/赤緯上的角度偏移
2. 使用球面三角學將此偏移投射至平坦的切面上
3. 使用像素比例（角秒/像素）從弧度轉換為像素座標
4. 套用旋轉以補償相機方向
5. 以影像中心為原點，過濾掉畫面外的星體

對於 Astrometry.net 的結果，直接使用校準參數。對於 GPT-4o 的結果，則從視野估計建構「合成校準」參數，由 `enhanceWithCatalog()` 函式使用這些估計參數投射完整目錄。

### 第四階段：星座組裝

`buildConstellations()` 函式：
1. 依 IAU 星座縮寫將所有投影星體分組
2. 對每個星座，查閱 `constellation-lines.ts` 中的連線定義 — 這些是依巴谷 ID 配對（例如 `[54061, 53910]` 連接大熊座的天樞與天璇）
3. 檢查哪些連線的兩端點都存在於投影星體中
4. 建構帶有索引的星體與連線列表，供渲染使用
5. 辨識每個可見星座中最亮的星

### 第五階段：座標正規化與回應

所有像素座標正規化至 0–1000 的 Canvas 座標系統，確保不同影像尺寸下的一致渲染。回應包含：
- `constellations[]` — 各星座附帶星體、連線、名稱和描述
- `allStars[]` — 所有投影星體，用於背景渲染
- `fieldDescription` — 人類可讀的天區描述
- `source` — `'astrometry'` 或 `'gpt4o-fallback'`
- `processingTime` — 經過的毫秒數

### 第六階段：前端渲染

`CanvasOverlay` 元件在疊加於上傳影像上的 HTML5 Canvas 上渲染結果：
- **星體**以圓形繪製，大小與亮度成正比（越亮越大）
- **星體顏色**源自 B-V 色指數：藍色代表高溫 O/B 型星、白色代表 A 型、黃色代表 G 型（類太陽）、橙色代表 K 型、紅色代表低溫 M 型星
- **星座連線**以半透明線條連接星體，高亮時帶有光暈效果
- **標籤**顯示星座名稱，可由使用者切換
- `ConstellationPanel` 側邊欄列出所有找到的星座，附有神話故事描述和可見度資訊

---

## 5. 星體資料庫與資料來源

### 5.1 HYG 星體目錄（主要）

**檔案：** `public/data/hyg-bright.json`（922 KB）

HYG 資料庫是一個合併了三大主要天文目錄資料的複合目錄：

- **依巴谷星表（HIP）** — 歐洲太空總署的依巴谷衛星（1989–1993）測量了約 118,000 顆恆星的精確位置、自行運動和視差。當時提供了最精確的恆星位置數據，定位精度約為 1 毫角秒。依巴谷 ID（HIP 編號）在 Star Finder 中作為主要識別碼，用於將星體連結至星座連線圖。

- **耶魯亮星表（BSC/YBS）** — 最初由耶魯大學編纂，此目錄包含所有亮於 6.5 等的 9,110 顆恆星（大約是肉眼可見的極限）。提供補充資料，包括通俗名稱（如「天狼星」、「織女星」）、拜耳命名法（如「大犬座 α」）、弗蘭斯蒂德編號和光譜分類。

- **格利澤近星表（GJ/Gl）** — 收錄距離太陽 25 秒差距（約 82 光年）以內的恆星目錄，由海德堡天文計算研究所維護。提供近距恆星資料，包括距離估計和光譜類型。

**Star Finder 使用的欄位：**

| 欄位 | 說明 | 範例 |
|------|------|------|
| `id` | 唯一列 ID | `32349` |
| `hip` | 依巴谷目錄編號 | `32349` |
| `name` | 通俗名稱 | `"Sirius"`（天狼星）|
| `bf` | 拜耳/弗蘭斯蒂德命名 | `"9Alp CMa"` |
| `ra` | 赤經（JSON 中以小時儲存，載入時乘以 15 轉換為度）| `6.752` → `101.28°` |
| `dec` | 赤緯（度）| `-16.716°` |
| `mag` | 視星等（數值越小越亮；天狼星 = -1.46）| `-1.46` |
| `ci` | B-V 色指數（藍色/高溫恆星 ≈ -0.3，紅色/低溫恆星 ≈ +2.0）| `0.009` |
| `con` | IAU 星座縮寫 | `"CMa"` |
| `sp` | 光譜類型分類 | `"A1V"` |

**處理管線：** 建構腳本（`scripts/process-hyg.ts`）將原始 HYG CSV 處理為最佳化的 JSON 檔案，僅選取必要欄位並過濾出亮星。

### 5.2 星座連線圖

**檔案：** `src/lib/constellation-lines.ts`

此檔案包含 **30 個主要星座**的手工策劃連線定義。每個星座表示為依巴谷 ID 配對的陣列 — 每對定義星座圖形的一條線段。

涵蓋的星座：
- **北天：** 大熊座、小熊座、仙后座、天鵝座、天龍座、仙王座、英仙座、仙女座、飛馬座、御夫座、雙子座、獅子座、牧夫座、北冕座、武仙座、天琴座
- **黃道帶：** 金牛座、室女座、天秤座、天蠍座、人馬座、摩羯座、寶瓶座、雙魚座、白羊座
- **其他：** 獵戶座、大犬座、烏鴉座、巨爵座、天鷹座

範例 — 大熊座（北斗七星）由 7 個 HIP 配對定義：
```
天樞(54061) ↔ 天璇(53910)
天璇(53910) ↔ 天璣(54539)
天璣(54539) ↔ 天權(59774)
天權(59774) ↔ 玉衡(62956)
玉衡(62956) ↔ 開陽(65378)
開陽(65378) ↔ 搖光(67301)
天璣(54539) ↔ 天樞(54061)  // 封閉「斗杓」
```

### 5.3 星座索引

**檔案：** `public/data/constellation-index.json`

預先計算的查找表，將每個 IAU 星座縮寫對映至該星座中所有依巴谷 ID 的列表。可在不掃描整個目錄的情況下快速進行成員檢查。

### 5.4 SIMBAD（輔助 / 按需查詢）

**API 端點：** `https://simbad.cds.unistra.fr/`

SIMBAD（天文資料識別、量測與書目集）由法國斯特拉斯堡天文資料中心（CDS）維護。當使用者點擊星體查看詳細資訊時，Star Finder 透過 `/api/star-info` 代理路由查詢 SIMBAD。

SIMBAD 提供：
- **天體類型** — 如「恆星」、「雙星」、「變星」、「星雲」
- **光譜類型** — 完整的 MK 光譜分類（如織女星的「A0V」、參宿四的「M1Ia-Iab」）
- **視差** — 以毫角秒測量；用於計算距離（距離（秒差距）= 1000 / 視差（毫角秒））
- **距離** — 由視差計算得出
- **徑向速度** — 恆星朝向或遠離我們的運動速度

支援兩種查詢模式：
1. **按名稱查詢：** 透過 TAP（表存取協議）介面使用 ADQL（天文資料查詢語言）
2. **按座標查詢：** 使用錐形搜索 — 回傳指定赤經/赤緯給定角半徑（預設 5 角秒）內的所有天體

### 5.5 Astrometry.net 索引（間接使用）

Astrometry.net 維護自有的專有星場「四星組」索引 — 源自 USNO-B、2MASS 和第谷 2 星表的 4 顆恆星幾何圖案。Star Finder 不直接存取此索引；而是將影像傳送至 Astrometry.net 服務，由其內部執行圖案比對並回傳校準參數。

---

## 6. API 整合

### 6.1 Astrometry.net REST API

Astrometry.net 是一個免費的開源定位解算服務，託管於 `nova.astrometry.net`。定位解算是透過比對星體圖案來確定天文影像精確天球座標的過程。

**認證流程：**
```
POST http://nova.astrometry.net/api/login
主體：request-json={"apikey": "<金鑰>"}
回應：{ "status": "success", "session": "<工作階段權杖>" }
```

**影像上傳：**
```
POST http://nova.astrometry.net/api/upload
主體：multipart/form-data
  - request-json: { session, scale_units: "degwidth", scale_lower: 10,
                     scale_upper: 180, downsample_factor: 2 }
  - file: <影像二進位>
回應：{ "status": "success", "subid": 12345 }
```

比例提示（10°–180° 視野範圍）告訴解算器搜尋廣角解算方案，大幅提高典型夜空照片的解算成功率和速度。降採樣因子將解析度減半以加快處理。

**輪詢週期：**
```
GET /api/submissions/{subId}     → 等待工作 ID（每 3 秒輪詢）
GET /api/jobs/{jobId}            → 等待完成（每 3 秒輪詢，最長 180 秒）
GET /api/jobs/{jobId}/info       → 取得校準資料
GET /api/jobs/{jobId}/annotations → 取得已辨識天體
```

**校準輸出：**
- `ra` / `dec` — 視野中心（度）
- `orientation` — 位置角（從北向東量測的度數）
- `pixscale` — 像素比例（角秒/像素）
- `radius` — 視野角半徑（度）
- `width_arcsec` / `height_arcsec` — 視野尺寸

### 6.2 OpenAI GPT-4o Vision API

GPT-4o 作為快速、近似的「初步掃描」用於辨識天區。影像以高解析度 base64 編碼 JPEG 格式透過視覺 API 呼叫傳送。

**請求：**
```
POST https://api.openai.com/v1/chat/completions
模型：gpt-4o
溫度：0.2（低溫度，確保一致性結果）
回應格式：JSON 物件
最大權杖數：2048
```

**系統提示**指示 GPT-4o 扮演「世界級天文學家」並回傳：
- 視野中心座標（赤經以小時為單位，赤緯以度為單位）
- 水平視野估計
- 相機相對於天球北極的方向
- 影像中可見的 IAU 星座縮寫列表

**關鍵洞察：** Star Finder **不使用** GPT-4o 來定位個別星體。而是使用 GPT-4o 的視野估計作為日心投影數學計算的輸入，然後以正確的數學精度從 HYG 目錄中放置星體。GPT-4o 回答「相機指向哪裡？」，目錄加上數學計算回答「星體確切在哪裡？」

### 6.3 SIMBAD TAP/錐形搜索

透過 `/api/star-info/route.ts` 代理以避免 CORS 問題。

**按名稱查詢（TAP/ADQL）：**
```
GET https://simbad.cds.unistra.fr/simbad/sim-tap/sync
  ?request=doQuery&lang=adql&format=json
  &query=SELECT main_id, otype_txt, sp_type, plx_value, rvz_radvel
         FROM basic WHERE main_id = '<星名>'
```

**按座標查詢（錐形搜索）：**
```
GET https://simbad.cds.unistra.fr/simbad/sim-coo
  ?Coord=<赤經>+<赤緯>&CooFrame=FK5&CooEpoch=2000&Radius=5&Radius.unit=arcsec
  &output.format=JSON
```

### 6.4 IP 地理定位（即時星空備援）

```
GET https://ipapi.co/json/
```
在 `CameraView` 元件中使用，作為使用者拒絕 GPS 權限時的備援。回傳城市級別的經緯度。不需要 API 金鑰。若此方法也失敗，預設為紐約（北緯 40.7°，西經 74.0°）。

---

## 7. 座標系統與投影方法

### 7.1 天球座標系統

**赤道座標（赤經/赤緯）：**
- **赤經（RA）：** 以小時（0–24h）或度（0–360°）量測。相當於天球上的經度。HYG 目錄以小時儲存赤經；Star Finder 乘以 15 轉換為度。
- **赤緯（Dec）：** 以度量測（-90° 至 +90°）。相當於緯度。+90° 是北天極（靠近北極星）。

**地平座標（高度/方位）：**
- **高度（Alt）：** 觀測者地平線以上的角度（0° = 地平線，90° = 天頂）。
- **方位（Az）：** 羅盤方位（0° = 北，90° = 東，180° = 南，270° = 西）。
- 這些取決於觀測者的位置和當前時間。

### 7.2 日心（切面）投影

Star Finder 在影像疊加和即時相機模式中均使用日心投影。這是天文攝影的標準投影方式，因為它保持直線 — 天球上的大圓（星座連線所近似的）在影像上對映為直線。

**數學公式**（來自 `coordinates.ts`）：

給定一顆星位於 (RA, Dec)，視野中心位於 (RA₀, Dec₀)：

```
ξ = cos(Dec) × sin(RA - RA₀) / D
η = [cos(Dec₀) × sin(Dec) - sin(Dec₀) × cos(Dec) × cos(RA - RA₀)] / D

其中 D = sin(Dec₀) × sin(Dec) + cos(Dec₀) × cos(Dec) × cos(RA - RA₀)
```

若 D ≤ 0，則星體在投影中心後方（超過 90° 遠）並被捨棄。

切面座標 (ξ, η)（弧度）接著轉換為像素：
```
pixscale_rad = (pixscale_arcsec / 3600) × π/180
dx = (ξ × cos(orient) + η × sin(orient)) / pixscale_rad
dy = (-ξ × sin(orient) + η × cos(orient)) / pixscale_rad
px = imgWidth/2 + dx
py = imgHeight/2 - dy
```

### 7.3 仿射變換（GPT-4o 星體匹配）

在有已匹配星體位置的情況下，Star Finder 可使用最小二乘迴歸擬合仿射變換。將標準座標 (ξ, η) 對映至像素座標 (px, py)：

```
px = a×ξ + b×η + c
py = d×ξ + e×η + f
```

6 個係數（a, b, c, d, e, f）使用正規方程式（A^T × A）x = A^T × b 以克拉默法則求解。至少需要 3 顆匹配星；對於恰好 2 顆星的情況，使用較簡單的旋轉+縮放+平移模型。

### 7.4 恆星時計算

即時星空模式中，赤經/赤緯與高度/方位的互相轉換需要知道本地恆星時：

```
儒略日：   JD = Unix_ms / 86400000 + 2440587.5
GMST（度）：θ = 280.46061837 + 360.98564736629 × (JD - 2451545.0)
                    + 0.000387933 × T² - T³/38710000
                其中 T = (JD - 2451545.0) / 36525
本地恆星時：LST = GMST + 觀測者經度
```

---

## 8. 即時星空模式：即時星座疊加

`CameraView` 元件透過在即時相機畫面上疊加星座，提供擴增實境體驗。

### 8.1 位置取得

三層備援：
1. **瀏覽器定位 API** — 高精度 GPS，10 秒逾時
2. **IP 地理定位**（`ipapi.co/json/`）— 若 GPS 被拒絕
3. **硬編碼預設值** — 紐約（北緯 40.7°，西經 74.0°），若所有方式均失敗

### 8.2 裝置方向（羅盤）

**iOS（iPhone/iPad）：**
- 需透過 `DeviceOrientationEvent.requestPermission()` 明確請求權限（iOS 13 起強制要求）
- 使用 `deviceorientation` 事件
- 讀取 `webkitCompassHeading` 取得真北羅盤方位（0–360° 順時針）
- `beta` = 俯仰角（手機垂直時為 90°）

**Android/Chrome：**
- 偏好使用 `deviceorientationabsolute` 事件取得真北方位
- 若絕對方向不可用，退而使用標準 `deviceorientation`
- 將 `alpha`（逆時針）轉換為順時針方位：`(360 - alpha) % 360`

**感測器融合：**
- `alpha` → 偏航/方位（羅盤方位）
- `beta` → 俯仰（90° = 手機垂直，< 90° = 仰望天空）
- `gamma` → 橫滾（相機旋轉）

### 8.3 即時投影管線

在 Canvas 上以 60 FPS 運行：

1. **計算本地恆星時**（由當前時間 + 觀測者經度）
2. **對每顆亮星**（約 1,000 顆星等 < 4.5 的星）：
   a. 使用觀測者緯度和本地恆星時將赤經/赤緯轉換為高度/方位
   b. 過濾高度低於 -5° 的星（地平線以下，含微小邊距）
   c. 使用以手機指向方向（由羅盤方位和手機傾斜角推導）為中心的日心投影，將高度/方位投射至相機切面
   d. 套用相機橫滾旋轉
   e. 使用假設的 65° 水平視野轉換為螢幕像素座標
3. **繪製星座連線**（僅在連線兩端點均可見時）
4. **繪製星點**（依星等縮放大小）
5. **繪製星座標籤**（位於可見星體的質心）

### 8.4 相機投影數學

來自 `celestial.ts`，相機投影將高度/方位轉換為螢幕像素：

1. 將星體和相機的高度/方位轉換為東-北-上座標系的三維單位向量
2. 計算點積 — 若 ≤ 0.01，星體在相機後方
3. 使用相機的「右向」向量（水平垂直方向）和「上向」向量投射至切面
4. 套用相機橫滾旋轉
5. 從角度切面轉換為像素：`scale = viewWidth / (2 × tan(hFov/2))`

---

## 9. 前端架構

### 9.1 主頁面狀態機

`app/page.tsx` 管理三狀態流程：
- **`"upload"`** — 顯示 `UploadZone` 供使用者選擇影像
- **`"loading"`** — 在分析期間顯示 `LoadingState` 與進度條
- **`"results"`** — 顯示影像搭配 `CanvasOverlay` + `ConstellationPanel` 側邊欄

### 9.2 關鍵元件

| 元件 | 檔案 | 職責 |
|------|------|------|
| **UploadZone** | `upload-zone.tsx` | 拖放區域、檔案選擇器、相機拍攝按鈕、「即時星空」按鈕 |
| **LoadingState** | `loading-state.tsx` | 分析期間的動態旋轉器和進度條 |
| **CanvasOverlay** | `canvas-overlay.tsx` | 以上傳影像為背景，在 Canvas 上繪製星體和星座連線 |
| **ConstellationPanel** | `constellation-panel.tsx` | 可捲動的側邊欄，列出已辨識星座及描述和神話故事 |
| **CameraView** | `camera-view.tsx` | 全螢幕即時相機搭配即時星座疊加（使用 GPS + 羅盤）|
| **StarDetail** | `star-detail.tsx` | 彈出視窗顯示星體屬性（名稱、星等、赤經/赤緯、光譜類型、SIMBAD 資料）|
| **ToggleControls** | `toggle-controls.tsx` | 星座連線、標籤的切換開關和重設按鈕 |
| **StarBackground** | `star-background.tsx` | UI 背後的裝飾性動態星空（Canvas 上 200 顆閃爍的星）|

### 9.3 自訂 Hooks

**`useAnalysis()`** — 管理整個分析生命週期：
- `resizeImage()` — 客戶端影像縮放（行動端頻寬最佳化）
- 發送 POST 至 `/api/analyze`
- 追蹤載入狀態和錯誤狀態
- 處理帶有 `useFallback` 標記的重試

**`useIsMobile()`** — 偵測行動裝置以進行響應式行為調整。

### 9.4 SVG 星圖匯出

`lib/star-chart-renderer.ts` 生成可下載的星座圖 SVG 文件：
- 深色背景
- 依星等決定大小、依光譜類型決定顏色的星體（B-V 色指數對映）
- 較亮星體的光暈效果
- 星座連線和標籤
- 可選標題

---

## 10. 後端 / 無伺服器函式

### 10.1 POST `/api/analyze`

核心分析端點。接受：
```json
{
  "image": "data:image/jpeg;base64,...",
  "width": 1920,
  "height": 1080,
  "useFallback": false
}
```

處理管線：
1. 將 base64 影像解碼為 Buffer
2. 從磁碟載入 HYG 星體目錄（同步，已快取）
3. 執行雙 API 競速（或依可用金鑰使用單一 API）
4. 將目錄星體投射至影像平面
5. 建構星座連線圖
6. 將座標正規化至 0–1000 的 Canvas 空間
7. 回傳包含星座、星體、中繼資料的 JSON

逾時：60 秒（在 `vercel.json` 中設定）。

### 10.2 POST/GET `/api/astrometry`

Astrometry.net 中介代理端點：
- **POST：** 上傳影像至 Astrometry.net
- **GET：** 輪詢提交狀態或取得工作結果

### 10.3 GET `/api/star-info`

SIMBAD 代理端點。接受查詢參數：
- `name` — 星體名稱，用於 TAP/ADQL 查詢
- `ra` + `dec` — 座標，用於錐形搜索
- `radius` — 搜索半徑（角秒，預設：5）

回傳天體類型、光譜類型、距離和其他屬性。

---

## 11. 資料流程圖

### 影像分析流程

```
使用者上傳照片
       │
       ▼
┌─────────────────────┐
│  影像縮放             │ (行動端: 1500px/0.75q, 桌面端: 2000px/0.85q)
│  (use-analysis.ts)   │
└─────────┬───────────┘
          │ POST /api/analyze (base64, 寬, 高)
          ▼
┌─────────────────────┐
│  載入 HYG 目錄       │ ← public/data/hyg-bright.json
│  (約 120,000 顆星)   │
└─────────┬───────────┘
          │
          ├────────────────────────────────────┐
          ▼                                    ▼
┌──────────────────┐              ┌──────────────────────┐
│  GPT-4o 視覺      │              │  Astrometry.net       │
│  (2-5 秒)         │              │  (30-120 秒)          │
│                   │              │                       │
│  回傳：            │              │  回傳：                │
│  - 中心赤經/赤緯   │              │  - 精確赤經/赤緯       │
│  - 視野估計        │              │  - 像素比例            │
│  - 方向           │              │  - 方向                │
│  - 星座列表        │              │  - 視野半徑            │
└────────┬─────────┘              └──────────┬────────────┘
         │                                    │
         │◄──── 5 秒視窗 ───────────────────►│
         │       （優先使用                     │
         │        Astrometry.net）             │
         ▼                                    ▼
┌─────────────────────────────────────────────────────────┐
│  日心投影                                                │
│  投射亮目錄星（星等 < 5.5）至影像上                         │
│  使用校準/視野估計參數                                     │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  建構星座                                                │
│  將投射的星體匹配至 constellation-lines.ts 中的             │
│  HIP 配對 → 連線圖                                       │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  正規化至 Canvas 座標（0-1000）                            │
│  回傳 JSON 回應至前端                                      │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│  Canvas 疊加層渲染                                        │
│  - 星點（依星等決定大小，依 B-V 指數決定顏色）                │
│  - 星座連線（高亮時帶光暈）                                 │
│  - 標籤（可切換）                                          │
│  - 星座面板附帶神話故事                                     │
└─────────────────────────────────────────────────────────┘
```

### 即時星空流程

```
┌──────────────────┐     ┌──────────────────┐
│  GPS 位置         │     │  裝置羅盤         │
│ （或 IP 備援）     │     │ （alpha/beta/    │
│                   │     │   gamma 感測器）  │
└────────┬─────────┘     └────────┬──────────┘
         │                         │
         ▼                         ▼
┌─────────────────────────────────────────────┐
│  計算本地恆星時                                │
│  LST = GMST(現在) + 觀測者經度                 │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│  對每顆亮星（約 1,000 顆）：                    │
│  1. 赤經/赤緯 → 高度/方位（使用緯度、LST）       │
│  2. 過濾：高度 > -5°                           │
│  3. 高度/方位 → 相機投影                        │
│    （日心投影，以手機方向為中心）                  │
│  4. 套用橫滾旋轉                               │
│  5. 轉換為螢幕像素                              │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│  Canvas 渲染 @ 60 FPS                        │
│  - 相機影像（背景）                             │
│  - 星點                                       │
│  - 星座連線                                    │
│  - 星座標籤                                    │
│  隨手機移動持續更新                              │
└─────────────────────────────────────────────┘
```

---

## 12. 設定與部署

### 環境變數

| 變數 | 是否必要 | 說明 |
|------|---------|------|
| `OPENAI_API_KEY` | 兩者至少需要一個 | OpenAI API 金鑰，用於 GPT-4o 視覺分析 |
| `ASTROMETRY_API_KEY` | 兩者至少需要一個 | Astrometry.net API 金鑰，用於定位解算 |
| `NEXT_PUBLIC_APP_URL` | 選填 | 應用程式 URL（預設為 `http://localhost:3000`）|

### Vercel 設定（`vercel.json`）

```json
{
  "functions": {
    "src/app/api/analyze/route.ts": {
      "maxDuration": 60
    }
  }
}
```

60 秒逾時是必要的，因為 Astrometry.net 定位解算可能需要 30–120 秒。GPT-4o 備援確保即使定位解算逾時，使用者仍能獲得結果。

### Next.js 設定

```typescript
// next.config.ts
{
  serverExternalPackages: ["sharp"]
}
```

Sharp 被列為伺服器外部套件，以便使用原生二進位檔進行影像處理。

### 建構與執行

```bash
npm install          # 安裝相依套件
npm run dev          # 開發伺服器於 localhost:3000
npm run build        # 生產環境建構
npm run start        # 生產環境伺服器
npm run process-hyg  # 從原始 HYG 資料重新生成星體目錄
```
