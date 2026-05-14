Summary
Live webcam recording is added next to the existing upload UI on the student upload page. It does not change the upload handler, Python pipeline, FastAPI /ingest/window or /ingest/session, or any Pydantic schemas.

Flow
Browser: getUserMedia → live <video> preview. On each `frame_interval_sec` bucket, the page JPEG-encodes the current frame and **POST**s to Node **`/realtime/live-frame`**, which proxies to FastAPI. The FastAPI handler runs the **same steps as `client/run_client_pipeline.py` per frame**: parallel `GazeInference.infer` / `PostureInference.infer` on a BGR frame from `cv2.imdecode`, `TemporalSmoother`, `CueToAffectMapper`, `FusionEngine`, `DataPackager`, then persists with the same shape as **`/ingest/window`**. Stopping calls **`/realtime/live-session-end`** (session payload + aggregation like **`/ingest/session`**). Optional WebSocket paths remain for older clients but live UI uses HTTP only.
WebSocket (ws://…/realtime/ws): browser sends infer with base64 crops; Node forwards to FastAPI POST /realtime/infer/gaze and POST /realtime/infer/posture.
FastAPI (server/realtime_infer_api.py, mounted in server/main.py): decodes tensors, calls existing _preprocess_eye / _preprocess and the loaded cnn / svm / model on GazeInference / PostureInference without editing client/inference/*.py.
Browser: TemporalSmoother (window size and threshold from the same JSON), CueToAffectMapper, FusionEngine (config from GET /realtime/fusion-config), DataPackager — aligned with the Python pipeline.
WebSocket: ingest_window / ingest_session → Node POSTs to existing /ingest/window and /ingest/session.
Tab close / navigate away: pagehide + navigator.sendBeacon → POST /realtime/session-final (same session JSON), with a ref guard to avoid double session when stop already succeeded.
New / touched artifacts
Area	Files
Shared constants
shared/pipeline_public_constants.json (must stay aligned with run_client_pipeline.py / smoothers)
FastAPI
server/realtime_infer_api.py; additive app.include_router in server/main.py
Node
backend/realtimeWs.js; backend/server.js (HTTP server + ws, registerRealtimeHttpRoutes, express.json({ limit: "4mb" })); backend/package.json (ws)
Frontend
frontend/src/realtime/*, frontend/src/components/LiveRecordingPanel.jsx, frontend/src/pages/student/UploadVideo.jsx, frontend/src/config/appConfig.js (BACKEND_URL)
Config you should know
Node → FastAPI: AFFECT_SERVER_URL (default http://localhost:8000), same idea as Python’s AFFECT_SERVER_URL.
Frontend → Node: VITE_BACKEND_URL or default http://localhost:5000 in appConfig.js.
If npm install was skipped in this environment, run it under backend so ws is guaranteed installed.

Operational notes
DB “live” feel: windows are written on the same 20-second grid as the file-based sampler, so observers see new rows each time a window completes, not on every video frame.
No large client-side vision libraries: preprocessing uses only `canvas` + `ImageData` + typed arrays so the upload page stays interactive immediately after load.
Camera unsupported: handled with a clear message when getUserMedia is missing.
If you want denser DB updates while keeping the same models, the only knob is frame_interval_sec in shared/pipeline_public_constants.json (then keep run_client_pipeline.py in sync manually, since that file was not changed per your constraints).