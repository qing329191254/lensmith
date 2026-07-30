# Lensmith

AI-native storyboard and image studio. Vue 3 frontend + FastAPI backend.

```plaintext
lensmith/
├── client/     # Vue 3 + Vite + Pinia + Tailwind + vue-i18n
└── server/     # FastAPI (/api/seq/*)
```

## Prerequisites

- Node.js 22+
- pnpm 11+ (see `packageManager` in root `package.json`)
- Conda (Miniconda / Anaconda)
- API keys: `AI_GATEWAY_API_KEY` (Vercel AI Gateway / Gemini), `FAL_KEY` (fal.ai)

## Quick start (both)

```bash
# one-time: conda env
cd server
conda env create -f environment.yml
cp .env.example .env
# edit .env with your keys
cd ..

# one-time: node deps
pnpm install

# run API + Vue together
pnpm dev
```

FastAPI `:8000` · Vue `:5173` · Stop with `Ctrl+C`.

## Routes

| Path                | Feature                                 |
| ------------------- | --------------------------------------- |
| `/`                 | Landing                                 |
| `/demo`             | Product demo                            |
| `/storyboard`       | 5-step AI storyboard wizard             |
| `/image-playground` | Image generation / editing              |
| `/timeline`         | Timeline NLE (import, edit, export MP4) |

## Server only

```bash
conda activate lensmith
python server/run.py
```

API docs: http://127.0.0.1:8000/docs

### AI orchestration (LangGraph)

Storyboard multi-step flow can run server-side via LangGraph:

`POST /api/seq/storyboard/run`

```json
{
  "prompt": "A critic tastes a dish and flashes back to childhood",
  "options": {
    "enhanceText": false,
    "extractPanels": true,
    "enhanceVideoPrompts": false,
    "generateVideos": false,
    "maxPanels": 6
  }
}
```

Pipeline: prepare → (optional enhance text via LangChain) → master grid → analyze → extract panels → (optional video prompts) → (optional fal videos).

Existing step APIs (`/generate-image`, `/analyze-storyboard`, …) remain for the Vue wizard.

After pulling deps:

```bash
conda activate lensmith
pip install -r server/requirements.txt
```

## Client only

```bash
pnpm --filter lensmith-client dev
```

## Environment

See [server/.env.example](server/.env.example):

- `AI_GATEWAY_API_KEY` — text / image Gemini routes
- `FAL_KEY` — video generation, upscale, fal proxy
- `CORS_ORIGINS` — default includes `http://localhost:5173`

## Deploy (Docker + CI)

Cloud VPS + Baota reverse proxy + GitHub Actions (GHCR + self-hosted runner): see [deploy/README.md](deploy/README.md).

Auth / MySQL: set `DATABASE_URL` and `JWT_SECRET` in `server/.env`, then `alembic upgrade head` (see [server/README.md](server/README.md)).
