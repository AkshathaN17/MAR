/**
 * WebSocket relay for live recording: browser <-> Node <-> FastAPI (unchanged ingest + /realtime/infer/*).
 */
const path = require("path");
const fs = require("fs");
const express = require("express");

const AFFECT_BASE =
  process.env.AFFECT_SERVER_URL || "http://localhost:8000";

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const detail = json.detail;
    const detailStr = Array.isArray(detail)
      ? detail.map((d) => d.msg || JSON.stringify(d)).join("; ")
      : detail;
    const err = new Error(
      detailStr ||
        json.message ||
        json.raw ||
        (typeof text === "string" ? text.trim() : "") ||
        res.statusText ||
        "HTTP error"
    );
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

function defaultGazeFail(timestamp_sec) {
  return {
    cue: "gaze",
    timestamp_sec,
    prediction: "unknown",
    confidence: 0.0,
    quality: "face_not_detected",
  };
}

function defaultPostureFail(timestamp_sec) {
  return {
    cue: "posture",
    timestamp_sec,
    prediction: "unknown",
    confidence: 0.0,
    probabilities: {},
    quality: "person_not_detected",
  };
}

async function handleInfer(msg) {
  const { timestamp_sec, gaze, posture } = msg;
  const out = { timestamp_sec };

  if (gaze && gaze.ok && gaze.eye_gray_u8_b64) {
    out.gaze = await postJson(`${AFFECT_BASE}/realtime/infer/gaze`, {
      timestamp_sec,
      eye_gray_u8_b64: gaze.eye_gray_u8_b64,
    });
  } else {
    out.gaze = defaultGazeFail(timestamp_sec);
  }

  if (posture && posture.ok && posture.person_bgr_u8_b64 && posture.width && posture.height) {
    out.posture = await postJson(`${AFFECT_BASE}/realtime/infer/posture`, {
      timestamp_sec,
      person_bgr_u8_b64: posture.person_bgr_u8_b64,
      width: posture.width,
      height: posture.height,
    });
  } else {
    out.posture = defaultPostureFail(timestamp_sec);
  }

  return out;
}

function attachRealtimeWebSocket(wss) {
  wss.on("connection", (ws) => {
    ws.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "invalid_json" }));
        return;
      }

      try {
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          return;
        }

        if (msg.type === "infer") {
          const result = await handleInfer(msg);
          ws.send(
            JSON.stringify({
              type: "infer_result",
              requestId: msg.requestId,
              ...result,
            })
          );
          return;
        }

        if (msg.type === "ingest_window") {
          await postJson(`${AFFECT_BASE}/ingest/window`, msg.payload);
          ws.send(
            JSON.stringify({
              type: "ingest_window_ok",
              requestId: msg.requestId,
              timestamp_sec: msg.payload?.timestamp_sec,
            })
          );
          return;
        }

        if (msg.type === "ingest_session") {
          await postJson(`${AFFECT_BASE}/ingest/session`, msg.payload);
          ws.send(
            JSON.stringify({
              type: "ingest_session_ok",
              requestId: msg.requestId,
              session_id: msg.payload?.session_id,
            })
          );
          return;
        }

        ws.send(JSON.stringify({ type: "error", message: "unknown_message_type" }));
      } catch (e) {
        console.error("realtime ws error:", e);
        const payload = {
          type: "error",
          message: e.message || String(e),
          status: e.status,
        };
        if (msg && msg.requestId != null) {
          payload.requestId = msg.requestId;
        }
        ws.send(JSON.stringify(payload));
      }
    });
  });
}

async function relaySessionPayload(body) {
  return postJson(`${AFFECT_BASE}/ingest/session`, body);
}

async function relayLiveFrame(body) {
  return postJson(`${AFFECT_BASE}/realtime/live-frame`, body);
}

async function relayLiveSessionEnd(body) {
  return postJson(`${AFFECT_BASE}/realtime/live-session-end`, body);
}

function registerRealtimeHttpRoutes(app) {
  const sharedConstants = path.join(__dirname, "../shared/pipeline_public_constants.json");
  const fusionConfig = path.join(__dirname, "../client/fusion/fusion_config.json");

  app.get("/realtime/pipeline-constants", (req, res) => {
    if (!fs.existsSync(sharedConstants)) {
      return res.status(404).json({ error: "pipeline_public_constants.json not found" });
    }
    res.sendFile(path.resolve(sharedConstants));
  });

  app.get("/realtime/fusion-config", (req, res) => {
    if (!fs.existsSync(fusionConfig)) {
      return res.status(404).json({ error: "fusion_config.json not found" });
    }
    res.sendFile(path.resolve(fusionConfig));
  });

  app.post("/realtime/session-final", async (req, res) => {
    try {
      await relaySessionPayload(req.body);
      res.json({ ok: true });
    } catch (e) {
      console.error("session-final relay failed:", e);
      res.status(e.status || 500).json({ ok: false, error: e.message });
    }
  });

  app.post("/realtime/live-frame", express.json({ limit: "25mb" }), async (req, res) => {
    try {
      const out = await relayLiveFrame(req.body);
      res.status(200).json(out);
    } catch (e) {
      console.error("live-frame relay failed:", e);
      res.status(e.status || 500).json({ ok: false, error: e.message, detail: e.body });
    }
  });

  app.post("/realtime/live-session-end", express.json({ limit: "1mb" }), async (req, res) => {
    try {
      const out = await relayLiveSessionEnd(req.body);
      res.status(200).json(out);
    } catch (e) {
      console.error("live-session-end relay failed:", e);
      res.status(e.status || 500).json({ ok: false, error: e.message });
    }
  });
}

module.exports = {
  attachRealtimeWebSocket,
  registerRealtimeHttpRoutes,
  relaySessionPayload,
};
