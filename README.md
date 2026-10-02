# LinkRoad

A pixel-art V2V (vehicle-to-vehicle) highway sim built on the VAST Builders Challenge video stack.
Cars scan road footage (browser YOLO + Cosmos fusion), classify incidents, and share hazard alerts
over a V2V link. Natural-language commands drive lane changes, video search, and Q&A over the archive.

- `web/` — Vite + React game UI on `:5173` (proxies `/api` to the server)
- `server/` — Hono API on `:8787` (ingest, scan, search, ask, agent)

## Run

```sh
npm install
npm run install:all
cp .env.example .env   # fill in what you have; everything is optional
npm run dev
```

Open http://localhost:5173. `GET /api/health` reports which providers are live.

## Live vs mock

Each provider switches to live when its credentials are present, otherwise it falls back to a
local mock so the demo always runs (`server/src/config.js` `modes()`).

| Provider | Live when |
|----------|-----------|
| `llm` (agent, fusion, ask) | `WANDB_API_KEY` |
| `weave` (tracing) | `WEAVE_ENABLED=1` + `WANDB_API_KEY` + `WANDB_PROJECT` |
| `search` (team VSS archive) | `INGRESS_URL` + `USERNAME` + `PASSWORD` |
| `cosmos` (captions) | `GPU_BEARER_TOKEN`, `COSMOS3_REASON_URL`, `NVIDIA_VSS_URL`, or `NVIDIA_API_KEY` |
| `embed` | `GPU_BEARER_TOKEN`, `COSMOS_EMBED1_URL`, `NVIDIA_EMBED_URL`, or `NVIDIA_API_KEY` |
| `yolo` | always (ONNX in the browser) |

On the challenge VM the server also loads `/config/*.config`, so search, Cosmos, and embeddings go
live with no `.env` edits.

## Demo script

1. Drag a hazard (pothole, debris, police) from the bag onto a lane and watch the cars react.
2. Toggle **V2V LINK** and drop another hazard: linked cars share the alert and change lanes early.
3. Type commands such as `RED TRUCK TO LANE 1` or `POTHOLE IN LANE 3`.
4. **UPLOAD** a road clip, drop it on the road, and let the cars scan it into an incident card.
5. Search the archive (`FIND A PEDESTRIAN`) and drop a hit onto a lane.
6. Ask about the footage (`WAS ANYONE IN THE CROSSWALK?`).
