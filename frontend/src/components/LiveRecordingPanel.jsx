import { useCallback, useEffect, useRef, useState } from "react";
import { BACKEND_URL } from "../config/appConfig.js";
import { captureVideoFrameAsJpegBase64 } from "../realtime/videoFrameCapture.js";

const MONGO_SYNC_INTERVAL_MS = 30_000;

export default function LiveRecordingPanel({ user, course }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const constantsRef = useRef(null);
  const sessionMetaRef = useRef(null);
  const startedAtRef = useRef(0);
  const lastBucketRef = useRef(-1);
  const tickTimerRef = useRef(null);
  const mongoIntervalRef = useRef(null);
  const processingRef = useRef(false);
  const pagehideHandlerRef = useRef(null);
  const beaconSentRef = useRef(false);
  const stopRequestedRef = useRef(false);
  /** Running-session dominant from packager (same aggregation as upload pipeline windows). */
  const lastDominantEmotionRef = useRef(null);

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

  const clearMongoInterval = useCallback(() => {
    if (mongoIntervalRef.current) {
      clearInterval(mongoIntervalRef.current);
      mongoIntervalRef.current = null;
    }
  }, []);

  const waitForProcessingIdle = useCallback(async (maxMs = 120000) => {
    const t0 = Date.now();
    while (processingRef.current) {
      if (Date.now() - t0 > maxMs) break;
      await new Promise((r) => setTimeout(r, 50));
    }
  }, []);

  /** Same MongoDB Result write as upload-video completion. */
  const saveDominantToMongo = useCallback(async (dominantEmotion) => {
    if (dominantEmotion == null || dominantEmotion === "") return;
    const res = await fetch(`${BACKEND_URL}/realtime/live-result-mongo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: user.sid,
        section: user.section,
        course,
        dominant_emotion: dominantEmotion,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || data.details || `${res.status}`);
    }
  }, [course, user.section, user.sid]);

  const endLiveSessionHttp = useCallback(async (meta) => {
    const res = await fetch(`${BACKEND_URL}/realtime/live-session-end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: meta.sessionId,
        student_id: meta.studentId,
        class_id: meta.classId,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        data.detail || data.error || `${res.status} ${res.statusText}`
      );
    }
    return data;
  }, []);

  const flushSessionBeacon = useCallback(() => {
    if (beaconSentRef.current) return;
    const meta = sessionMetaRef.current;
    if (!meta) return;
    try {
      const body = JSON.stringify({
        session_id: meta.sessionId,
        student_id: meta.studentId,
        class_id: meta.classId,
      });
      const url = `${BACKEND_URL}/realtime/live-session-end`;
      const ok = navigator.sendBeacon(
        url,
        new Blob([body], { type: "application/json" })
      );
      if (ok) {
        beaconSentRef.current = true;
      }
    } catch (e) {
      console.warn("live-session-end beacon failed", e);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    stopRequestedRef.current = true;

    if (pagehideHandlerRef.current) {
      window.removeEventListener("pagehide", pagehideHandlerRef.current);
      pagehideHandlerRef.current = null;
    }
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
    clearMongoInterval();

    setRecording(false);
    setBusy(true);
    setStatus("Stopping… waiting for any in-flight analysis");
    setError("");

    await waitForProcessingIdle();

    const meta = sessionMetaRef.current;
    setStatus("Ending session…");

    try {
      if (meta) {
        const data = await endLiveSessionHttp(meta);
        beaconSentRef.current = true;
        if (data.dominant_emotion != null && data.dominant_emotion !== "") {
          try {
            await saveDominantToMongo(data.dominant_emotion);
          } catch (mongoErr) {
            console.error(mongoErr);
            setError((prev) =>
              prev
                ? `${prev}; Final DB sync: ${mongoErr.message}`
                : `Final DB sync: ${mongoErr.message}`
            );
          }
        }
        setStatus("Session ended — summary saved (same pipeline as upload).");
      } else {
        setStatus("Recording stopped.");
      }
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
      flushSessionBeacon();
      setStatus("Session end had errors (tried backup beacon).");
    } finally {
      stopMedia();
      sessionMetaRef.current = null;
      constantsRef.current = null;
      lastDominantEmotionRef.current = null;
      stopRequestedRef.current = false;
      setBusy(false);
    }
  }, [
    clearMongoInterval,
    endLiveSessionHttp,
    flushSessionBeacon,
    saveDominantToMongo,
    stopMedia,
    waitForProcessingIdle,
  ]);

  const processBucket = useCallback(async (timestampSec) => {
    if (stopRequestedRef.current) return;
    const video = videoRef.current;
    const meta = sessionMetaRef.current;
    if (!video || !meta || processingRef.current) return;
    processingRef.current = true;
    setStatus(`Analyzing (t=${timestampSec}s)…`);
    try {
      const jpeg_b64 = captureVideoFrameAsJpegBase64(video);
      if (!jpeg_b64) {
        throw new Error("Could not capture video frame (no dimensions yet).");
      }
      const res = await fetch(`${BACKEND_URL}/realtime/live-frame`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestamp_sec: timestampSec,
          student_id: meta.studentId,
          class_id: meta.classId,
          session_id: meta.sessionId,
          jpeg_b64,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data.detail === "string"
            ? data.detail
            : JSON.stringify(data.detail || data);
        throw new Error(msg || `${res.status} ${res.statusText}`);
      }
      if (data.fusion) {
        setLiveFusion(data.fusion);
      }
      if (data.dominant_emotion != null && data.dominant_emotion !== "") {
        lastDominantEmotionRef.current = data.dominant_emotion;
      }
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
    stopRequestedRef.current = false;
    lastDominantEmotionRef.current = null;
    clearMongoInterval();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraOk(false);
      setError(
        "This browser does not support camera access (getUserMedia is unavailable)."
      );
      setBusy(false);
      return;
    }

    if (!course || !user?.section) {
      setError("Missing course or student section for DB sync.");
      setBusy(false);
      return;
    }

    try {
      const constantsRes = await fetch(
        `${BACKEND_URL}/realtime/pipeline-constants`
      );
      if (!constantsRes.ok) {
        throw new Error(
          `Pipeline config failed: ${constantsRes.status} ${constantsRes.statusText}`
        );
      }
      const constants = await constantsRes.json();
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

      const studentId = String(user.sid);
      const classId = constants.default_class_id;
      const sessionId = `session_live_${Date.now()}`;
      sessionMetaRef.current = { sessionId, classId, studentId };

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

      mongoIntervalRef.current = setInterval(() => {
        const d = lastDominantEmotionRef.current;
        if (!d) return;
        saveDominantToMongo(d).catch((err) => {
          console.error("30s Mongo sync failed:", err);
        });
      }, MONGO_SYNC_INTERVAL_MS);

      setStatus("Recording…");
    } catch (e) {
      console.error(e);
      setError(e.message || String(e));
      stopMedia();
      sessionMetaRef.current = null;
      clearMongoInterval();
    } finally {
      setBusy(false);
    }
  }, [
    clearMongoInterval,
    flushSessionBeacon,
    processBucket,
    saveDominantToMongo,
    stopMedia,
    user.section,
    user.sid,
    course,
  ]);

  useEffect(() => {
    return () => {
      if (pagehideHandlerRef.current) {
        window.removeEventListener("pagehide", pagehideHandlerRef.current);
      }
      if (tickTimerRef.current) {
        clearInterval(tickTimerRef.current);
      }
      clearMongoInterval();
      flushSessionBeacon();
      stopMedia();
    };
  }, [clearMongoInterval, flushSessionBeacon, stopMedia]);

  const scores = liveFusion?.emotion_scores || null;

  return (
    <div>
      <h2>Live recording</h2>
      <p className="info">
        <strong>Student:</strong> {user.name} &nbsp;|&nbsp;{" "}
        <strong>Course:</strong> {course}
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
            <p style={{ marginTop: 12, marginBottom: 0, fontWeight: 600, color: "#b91c1c" }}>
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

      <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        {!recording ? (
          <button type="button" onClick={() => void startRecording()} disabled={busy}>
            {busy ? "Starting…" : "Start recording"}
          </button>
        ) : (
          <button
            type="button"
            className="btn-stop-recording"
            onClick={() => void stopRecording()}
            disabled={busy}
          >
            {busy ? "Stopping…" : "Stop recording"}
          </button>
        )}
      </div>
    </div>
  );
}
