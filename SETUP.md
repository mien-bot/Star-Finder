# HYLO-SP API Setup Guide

## Current Status

**The app works without API keys** — it uses simulated building detection for demo purposes.

To enable real AI-powered building detection from satellite images, add one or more Vision API keys.

---

## API Keys Needed (Optional)

### Option 1: OpenAI GPT-4V (Recommended)
1. Go to https://platform.openai.com/api-keys
2. Create a new secret key
3. Add to `.env.local`: `OPENAI_API_KEY=sk-...`

### Option 2: Anthropic Claude Vision
1. Go to https://console.anthropic.com/
2. Create an API key
3. Add to `.env.local`: `ANTHROPIC_API_KEY=sk-ant-...`

### Option 3: Google Gemini Vision
1. Go to https://aistudio.google.com/app/apikey
2. Create an API key
3. Add to `.env.local`: `GOOGLE_GENERATIVE_AI_API_KEY=...`

---

## How It Works

### Current Demo Mode (No API Key)
```
Upload Image → Simulated Building Detection → SVG Output
```
Returns fake building outlines for testing the UI.

### With Vision API
```
Upload Image → AI Analyzes Image → Detects Buildings → SVG Output
```

The API route (`/api/process`) will:
1. Send your satellite image to the Vision API
2. Ask AI to identify buildings, roads, property boundaries
3. Return coordinates converted to SVG

---

## Setup

```bash
# 1. Copy the example env file
cp .env.example .env.local

# 2. Add your API key(s)
# Edit .env.local with your actual keys

# 3. Run the app
npm run dev
```

---

## Testing

### Test without API key:
1. Run `npm run dev`
2. Open http://localhost:3000
3. Upload any image
4. See simulated building outlines

### Test with API key:
1. Add key to `.env.local`
2. Restart the dev server
3. Upload a satellite image (Google Maps, Mapbox, etc.)
4. AI will detect real buildings

---

## File Structure

```
hylo-sp/
├── .env.example          # Template for env variables
├── .env.local           # Your actual keys (NOT committed to git)
├── src/
│   └── app/
│       ├── page.tsx           # Main UI
│       └── api/
│           ├── process/       # Phase 1: Image → SVG
│           ├── blender/       # Phase 2: SVG → 3D
│           └── export/        # Phase 3: Export formats
```

---

## API Rate Limits

- **OpenAI**: ~$0.01-0.03 per image with GPT-4V
- **Claude**: ~$0.01-0.02 per image with Sonnet
- **Gemini**: ~$0.001-0.005 per image (cheapest)

Start with free tiers before production use.
