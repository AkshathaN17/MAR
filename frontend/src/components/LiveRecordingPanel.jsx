import { useCallback, useEffect, useRef, useState } from "react";
import { BACKEND_URL } from "../config/appConfig.js";
import { DataPackager } from "../realtime/dataPackager.js";
import { TemporalSmoother } from "../realtime/temporalSmoother.js";
import { CueToAffectMapper } from "../realtime/cueToAffect.js";
import { FusionEngine } from "../realtime/fusionEngine.js";
import { extractGazeAndPostureCrops, loadOpenCv } from "../realtime/opencvPreprocess.js";
import { RealtimeWsClient } from "../realtime/realtimeWsClient.js";

function backendWsUrl() {
  const u = new URL(BACKEND_URL);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/realtime/ws";
  u.search = "";
  u.hash = "";
  return u.toString();
}

export default function LiveRecordingPanel({ user, course }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const wsRef = useRef(null);
  const packagerRef = useRef(null);
  const gazeSmootherRef = useRef(null);
  const postureSmootherRef = useRef(null);
  const cueMapperRef = useRef(null);
  const fusionRef = useRef(null);
  const constantsRef = useRef(null);
  const startedAtRef = useRef(0);
  const lastBucketRef = useRef(-1);
  const tickTimerRef = useRef(null);
  const processingRef = useRef(false);
  const pagehideHandlerRef = useRef(null);
  const beaconSentRef = useRef(false);

  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [liveFusion, setLiveFusion] = useState(null);
  const [cameraOk, setCameraOk] = useState(true);

  const stopMedia = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      for (const t of s.getTracks()) {
        t.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const teardownWs = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const flushSessionBeacon = useCallback(() => {
    if (beaconSentRef.current) return;
    const p = packagerRef.current;
    if (!p || !p.emotion_history || p.emotion_history.length === 0) return;
    try {
      const payload = p.buildFinalPayload();
      const url = `${BACKEND_URL}/realtime/session-final`;
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const ok = navigator.sendBeacon(url, blob);
      if (ok) {
        beaconSentRef.current = true;
      }
    } catch (e) {
      console.warn("session beacon failed", e);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (pagehideHandlerRef.current) {
      window.removeEventListener("pagehide", pagehideHandlerRef.current);
      pagehideHandlerRef.current = null;
    }
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    setRecording(false);
    setBusy(true);
    setStatus("Ending session…");

    try {
      const p = packagerRef.current;
      const client = wsRef.current;
      if (p && p.emotion_history.length > 0 && client) {
        const finalPayload = p.buildFinalPayload();
        await client.ingestSession(finalPayload);
        beaconSentRef.current = true;
      }
    } catch (e) {
      console.error(e);
      flushSessionBeacon();
    } finally {
      teardownWs();
      stopMedia();
      packagerRef.current = null;
      gazeSmootherRef.current = null;
      postureSmootherRef.current = null;
      cueMapperRef.current = null;
      fusionRef.current = null;
      setBusy(false);
      setStatus("");
      setLiveFusion(null);
    }
  }, [flushSessionBeacon, stopMedia, teardownWs]);

  const processBucket = useCallback(async (timestampSec) => {
    const video = videoRef.current;
    const cv = window.cv;
    const constants = constantsRef.current;
    const ws = wsRef.current;
    if (!video || !cv || !constants || !ws || processingRef.current) return;
    processingRef.current = true;
    setStatus(`Analyzing (t=${timestampSec}s)…`);
    try {
      const crops = await extractGazeAndPostureCrops(cv, video, constants);
      const inferMsg = await ws.infer({
        timestamp_sec: timestampSec,
        gaze: crops.gaze,
        posture: crops.posture,
      });

      const gazeRaw = inferMsg.gaze;
      const postureRaw = inferMsg.posture;

      const gazeSmoothed = gazeSmootherRef.current.update(gazeRaw);
      const postureSmoothed = postureSmootherRef.current.update(postureRaw);

      const gazeAffect = cueMapperRef.current.map(gazeSmoothed);
      const postureAffect = cueMapperRef.current.map(postureSmoothed);

      const fusionOutput = fusionRef.current.fuse(
        { gaze: gazeAffect, posture: postureAffect },
        timestampSec
      );

      packagerRef.current.addFusionResult(fusionOutput);
      const windowPayload = packagerRef.current.buildWindowPayload(fusionOutput);
      await ws.ingestWindow(windowPayload);
      setLiveFusion(fusionOutput);
      setStatus(`Last window saved (t=${timestampSec}s)`);
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
      setStatus("Analysis error");
    } finally {
      processingRef.current = false;
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError("");
    setLiveFusion(null);
    setBusy(true);
    setStatus("Starting…");
    beaconSentRef.current = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraOk(false);
      setError(
        "This browser does not support camera access (getUserMedia is unavailable)."
      );
      setBusy(false);
      return;
    }

    try {
      const [constantsRes, fusionRes] = await Promise.all([
        fetch(`${BACKEND_URL}/realtime/pipeline-constants`),
        fetch(`${BACKEND_URL}/realtime/fusion-config`),
      ]);
      if (!constantsRes.ok || !fusionRes.ok) {
        throw new Error("Failed to load pipeline configuration from server");
      }
      const constants = await constantsRes.json();
      const fusionCfg = await fusionRes.json();
      constantsRef.current = constants;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOk(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      await loadOpenCv();

      const ws = new RealtimeWsClient(backendWsUrl());
      await ws.connect();
      wsRef.current = ws;

      const studentId = String(user.sid);
      const classId = constants.default_class_id;
      const sessionId = `session_live_${Date.now()}`;
      packagerRef.current = new DataPackager(studentId, classId, sessionId);
      gazeSmootherRef.current = new TemporalSmoother(
        constants.temporal_smoothing_window_size,
        constants.temporal_smoothing_confidence_threshold
      );
      postureSmootherRef.current = new TemporalSmoother(
        constants.temporal_smoothing_window_size,
        constants.temporal_smoothing_confidence_threshold
      );
      cueMapperRef.current = new CueToAffectMapper(fusionCfg.cue_to_emotion);
      fusionRef.current = new FusionEngine(fusionCfg);

      startedAtRef.current = Date.now();
      lastBucketRef.current = -1;
      setRecording(true);

      const pagehide = () => {
        flushSessionBeacon();
      };
      pagehideHandlerRef.current = pagehide;
      window.addEventListener("pagehide", pagehide);

      const frameIntervalSec = constants.frame_interval_sec;

      const scheduleTick = async () => {
        const elapsedSec = Math.floor((Date.now() - startedAtRef.current) / 1000);
        const bucket =
          Math.floor(elapsedSec / frameIntervalSec) * frameIntervalSec;
        if (bucket <= lastBucketRef.current) return;
        lastBucketRef.current = bucket;
        await processBucket(bucket);
      };

      await processBucket(0);
      lastBucketRef.current = 0;

      tickTimerRef.current = setInterval(() => {
        scheduleTick().catch((e) => {
          console.error(e);
          setError(e.message || String(e));
        });
      }, 1000);

      setStatus("Recording…");
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
      stopMedia();
      teardownWs();
    } finally {
      setBusy(false);
    }
  }, [flushSessionBeacon, processBucket, stopMedia, teardownWs, user.sid]);

  useEffect(() => {
    return () => {
      if (pagehideHandlerRef.current) {
        window.removeEventListener("pagehide", pagehideHandlerRef.current);
      }
      if (tickTimerRef.current) {
        clearInterval(tickTimerRef.current);
      }
      flushSessionBeacon();
      teardownWs();
      stopMedia();
    };
  }, [flushSessionBeacon, stopMedia, teardownWs]);

  const scores = liveFusion?.emotion_scores || null;

  return (
    <div>
      <h2>Live recording</h2>
      <p className="info">
        <strong>Student:</strong> {user.name} &nbsp;|&nbsp;{" "}
        <strong>Course:</strong> {course}
      </p>
      <p className="info" style={{ fontSize: "0.9rem", opacity: 0.85 }}>
        Uses the same sampling interval, smoothing, fusion, and ingestion
        endpoints as the upload pipeline. Rows appear in the affect store each
        time a window completes (same cadence as video analysis).
      </p>

      {!cameraOk && (
        <p className="info" style={{ color: "#b45309" }}>
          Camera API is not available in this environment.
        </p>
      )}

      {error && (
        <p className="info" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      )}

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: "1 1 260px" }}>
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              width: "100%",
              maxWidth: 420,
              borderRadius: 8,
              background: "#111",
              minHeight: 180,
            }}
          />
          {recording && (
            <p style={{ marginTop: 8, fontWeight: 600, color: "#b91c1c" }}>
              ● Recording
            </p>
          )}
        </div>

        <div style={{ flex: "1 1 220px" }}>
          <p className="info">
            <strong>Status:</strong> {busy ? "Working…" : status || "Idle"}
          </p>
          {liveFusion && (
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: "0.75rem",
                background: "#fafafa",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                Current fusion
              </div>
              <div>
                Emotion:{" "}
                <strong>{liveFusion.final_emotion}</strong> (confidence{" "}
                {liveFusion.confidence})
              </div>
              {scores && (
                <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>
                  {Object.entries(scores).map(([k, v]) => (
                    <li key={k}>
                      {k}: {typeof v === "number" ? v.toFixed(4) : v}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
        {!recording ? (
          <button type="button" onClick={startRecording} disabled={busy}>
            {busy ? "Starting…" : "Start recording"}
          </button>
        ) : (
          <button type="button" onClick={stopRecording} disabled={busy}>
            Stop recording
          </button>
        )}
      </div>
    </div>
  );
}
