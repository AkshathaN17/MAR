# Live recording (real-time affect analysis)

This document describes the **live webcam recording** path that runs **alongside** the existing **upload → Python pipeline → FastAPI** flow. It does not replace or change that upload pipeline.

## Architecture (two backends)

| Service | Default URL | Role |
|--------|-------------|------|
| **Node (Express)** | `http://127.0.0.1:5000` | Auth, MongoDB, video upload, and **live recording relay**: static JSON, WebSocket, forwarding to FastAPI. |
| **FastAPI (Python)** | `http://127.0.0.1:8000` | Unchanged **`/ingest/window`**, **`/ingest/session`**, plus **`/realtime/infer/gaze`** and **`/realtime/infer/posture`** (preprocessed tensors only). |

The **browser never** should load pipeline config from port **8000** for this feature. Config and WebSocket live on **Node (5000)**.

## Frontend configuration (`frontend/src/config/appConfig.js`)

- **`BACKEND_URL`** (`VITE_BACKEND_URL`): Express server. Used for uploads, login, **`/realtime/pipeline-constants`**, **`/realtime/fusion-config`**, **`WebSocket /realtime/ws`**, **`POST /realtime/session-final`** (beacon).
- **`BACKEND_REALTIME_URL`** (`VITE_BACKEND_REALTIME_URL`): FastAPI base URL. Reserved for **direct** FastAPI calls if you add them later; **live recording does not use it** for config or WebSocket.

## Node relay (`backend/realtimeWs.js`)

- **`GET /realtime/pipeline-constants`** → `shared/pipeline_public_constants.json`
- **`GET /realtime/fusion-config`** → `client/fusion/fusion_config.json`
- **`POST /realtime/session-final`** → JSON body forwarded to FastAPI **`POST /ingest/session`**
- **`POST /realtime/live-frame`** → FastAPI **`POST /realtime/live-frame`** (full upload-parity pipeline step for one timestamp)
- **`POST /realtime/live-result-mongo`** (Node only) → writes **`Result`** to MongoDB with the same shape as **`upload-video`** completion (`sid`, `section`, `subject`, `emotion`, `date`). Called by the live UI every **30s** (running dominant from the server packager) and once on **Stop** (final dominant from session end).

Node reads **`AFFECT_SERVER_URL`** (default `http://localhost:8000`) when calling FastAPI.

## Express + WebSocket startup (`backend/server.js`)

The HTTP server is created with **`http.createServer(app)`**, and **`ws`** attaches at path **`/realtime/ws`**. **`registerRealtimeHttpRoutes(app)`** must run so the `/realtime/*` HTTP routes exist. If those lines are missing, the UI shows **config fetch failed** (typically **404**).

## Debugging checklist

1. **Node running** on the same host/port as `VITE_BACKEND_URL` / `BACKEND_URL` (default `127.0.0.1:5000`).
2. **FastAPI running** on `AFFECT_SERVER_URL` (default `8000`) so inference and ingest relay succeed after config loads.
3. **Wrong port for config (fixed bug)**  
   If the UI called **`BACKEND_REALTIME_URL` (8000)** for `/realtime/pipeline-constants`, FastAPI returns **404** because those routes are on **Node**. **`LiveRecordingPanel`** must use **`BACKEND_URL`** only for config, WebSocket URL, and `sendBeacon` session flush.
4. **MongoDB**  
   This project’s `server.js` may require **`DB_URI`** in `.env`. If the process exits before listen, fix env first.
5. **CORS**  
   Dev uses `app.use(cors())`. If you lock CORS later, allow the Vite origin for `fetch` + WebSocket.

## Files touched for this feature (reference)

| Path | Purpose |
|------|---------|
| `backend/server.js` | HTTP server + WebSocket attach + `registerRealtimeHttpRoutes` |
| `backend/realtimeWs.js` | Relay + static file routes (`path.resolve` for `sendFile` on Windows) |
| `backend/package.json` | `ws` dependency |
| `frontend/src/components/LiveRecordingPanel.jsx` | Webcam UI; fetches config from **`BACKEND_URL`** |
| `frontend/src/config/appConfig.js` | `BACKEND_URL` vs `BACKEND_REALTIME_URL` documentation |
| `frontend/src/realtime/videoFrameCapture.js` | JPEG frame capture for `/realtime/live-frame` |
| `server/live_session_pipeline.py` | **Upload-parity live path**: decode JPEG → BGR, same infer/smooth/map/fuse/packager as `run_client_pipeline.py`, persist windows + session end |
| `server/realtime_infer_api.py` | FastAPI inference from preprocessed crops |
| `server/main.py` | Includes realtime infer router (additive) |
| `shared/pipeline_public_constants.json` | Public constants aligned with the Python client pipeline |

## Run order (typical dev)

1. Start **FastAPI** (affect server), e.g. port **8000**.
2. Start **Node** backend, port **5000**, with `AFFECT_SERVER_URL` pointing at FastAPI if not default.
3. Start **Vite** frontend; set `VITE_BACKEND_URL` if Node is not on `127.0.0.1:5000`.
