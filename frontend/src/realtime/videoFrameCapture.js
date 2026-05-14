/**
 * Encode current video frame as JPEG base64 (no data URL prefix) for the
 * server-side pipeline (cv2.imdecode), matching OpenCV BGR frame from video.
 *
 * @param {HTMLVideoElement} video
 * @param {number} [quality=0.88] JPEG quality 0–1
 * @returns {string | null}
 */
export function captureVideoFrameAsJpegBase64(video, quality = 0.88) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const prefix = "data:image/jpeg;base64,";
  if (!dataUrl.startsWith(prefix)) return null;
  return dataUrl.slice(prefix.length);
}
