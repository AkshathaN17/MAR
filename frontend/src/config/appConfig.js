export const COLLEGE_NAME = "R. V. College of Engineering";

/**
 * Node/Express backend (port 5000 by default): auth, uploads, quiz APIs,
 * and live-recording relay (`/realtime/*`, WebSocket `/realtime/ws`).
 */
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:5000";

/**
 * FastAPI affect-analysis server (port 8000 by default): `/ingest/*`,
 * `/realtime/infer/*`, analytics. The browser does not call this for live
 * recording config; Node proxies inference/ingest. Use this if you add
 * direct FastAPI calls from the frontend.
 */
export const BACKEND_REALTIME_URL =
  import.meta.env.VITE_BACKEND_REALTIME_URL || "http://127.0.0.1:8000";
