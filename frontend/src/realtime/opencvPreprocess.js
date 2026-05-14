import { u8ToB64 } from "./u8ToB64.js";

const CASCADE_FACE =
  "https://raw.githubusercontent.com/opencv/opencv/4.x/data/haarcascades/haarcascade_frontalface_default.xml";
const CASCADE_EYE =
  "https://raw.githubusercontent.com/opencv/opencv/4.x/data/haarcascades/haarcascade_eye.xml";

function loadFileToFs(cv, url, fsPath) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.responseType = "arraybuffer";
    xhr.onload = () => {
      if (xhr.status !== 200) {
        reject(new Error(`Failed to load ${url}: ${xhr.status}`));
        return;
      }
      const data = new Uint8Array(xhr.response);
      cv.FS_createDataFile("/", fsPath, data, true, false, false);
      resolve();
    };
    xhr.onerror = () => reject(new Error(`Network error loading ${url}`));
    xhr.send();
  });
}

let cascadesReady = null;

export function ensureHaarCascades(cv) {
  if (cascadesReady) return cascadesReady;
  cascadesReady = (async () => {
    await loadFileToFs(cv, CASCADE_FACE, "haarcascade_frontalface_default.xml");
    await loadFileToFs(cv, CASCADE_EYE, "haarcascade_eye.xml");
  })();
  return cascadesReady;
}

function matToGrayUint8(matGray224) {
  const rows = matGray224.rows;
  const cols = matGray224.cols;
  const out = new Uint8Array(rows * cols);
  let o = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out[o++] = matGray224.ucharPtr(r, c)[0];
    }
  }
  return out;
}

function matBGRToUint8(matBgr) {
  const rows = matBgr.rows;
  const cols = matBgr.cols;
  const out = new Uint8Array(rows * cols * 3);
  let o = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = matBgr.ucharPtr(r, c);
      out[o++] = p[0];
      out[o++] = p[1];
      out[o++] = p[2];
    }
  }
  return out;
}

/**
 * Mirrors client/inference/gaze_inference.py::_extract_eye_region and
 * client/inference/posture_inference.py::_detect_person + crop.
 * @param {*} cv OpenCV runtime (window.cv)
 * @param {HTMLVideoElement|HTMLCanvasElement} source
 * @param {object} constants from pipeline_public_constants.json
 */
export async function extractGazeAndPostureCrops(cv, source, constants) {
  await ensureHaarCascades(cv);

  const gazeResize = constants.gaze_eye_resize;
  const eyeTargetH = constants.gaze_eye_target_height;

  const src = cv.imread(source);
  const gray = new cv.Mat();
  const bgr = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
  cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR, 0);

  const faceCascade = new cv.CascadeClassifier();
  faceCascade.load("haarcascade_frontalface_default.xml");
  const eyeCascade = new cv.CascadeClassifier();
  eyeCascade.load("haarcascade_eye.xml");

  const faces = new cv.RectVector();
  const minSize = new cv.Size(0, 0);
  const maxSize = new cv.Size(0, 0);
  faceCascade.detectMultiScale(gray, faces, 1.3, 5, 0, minSize, maxSize);

  let gazePayload = { ok: false };
  if (faces.size() > 0) {
    const f = faces.get(0);
    const faceRoiGray = gray.roi(f);
    const eyes = new cv.RectVector();
    eyeCascade.detectMultiScale(faceRoiGray, eyes, 1.3, 5, 0, minSize, maxSize);

    if (eyes.size() > 0) {
      const eyeMats = [];
      const maxEyes = Math.min(2, eyes.size());
      for (let i = 0; i < maxEyes; i++) {
        const e = eyes.get(i);
        const eyeCrop = faceRoiGray.roi(e);
        const ew = eyeCrop.cols;
        const eh = eyeCrop.rows;
        const resized = new cv.Mat();
        cv.resize(eyeCrop, resized, new cv.Size(ew, eyeTargetH), 0, 0, cv.INTER_LINEAR);
        eyeMats.push(resized);
        eyeCrop.delete();
      }

      let eyeRegion;
      if (eyeMats.length === 2) {
        eyeRegion = new cv.Mat();
        cv.hconcat(eyeMats[0], eyeMats[1], eyeRegion);
        eyeMats[0].delete();
        eyeMats[1].delete();
      } else {
        eyeRegion = eyeMats[0];
      }

      const eye224 = new cv.Mat();
      cv.resize(
        eyeRegion,
        eye224,
        new cv.Size(gazeResize, gazeResize),
        0,
        0,
        cv.INTER_LINEAR
      );
      eyeRegion.delete();

      const grayBytes = matToGrayUint8(eye224);
      gazePayload = { ok: true, eye_gray_u8_b64: u8ToB64(grayBytes) };
      eye224.delete();
    }
    eyes.delete();
    faceRoiGray.delete();
  }

  const hog = new cv.HOGDescriptor();
  let posturePayload = { ok: false };
  const found = new cv.RectVector();
  try {
    hog.setSVMDetector(cv.HOGDescriptor_getDefaultPeopleDetector());
    const winStride = new cv.Size(8, 8);
    const padding = new cv.Size(8, 8);
    hog.detectMultiScale(bgr, found, 0, winStride, padding, 1.05, 2.0);

    if (found.size() > 0) {
      let best = found.get(0);
      let bestArea = best.width * best.height;
      for (let i = 1; i < found.size(); i++) {
        const r = found.get(i);
        const a = r.width * r.height;
        if (a > bestArea) {
          best = r;
          bestArea = a;
        }
      }
      const crop = bgr.roi(best);
      const w = crop.cols;
      const h = crop.rows;
      const bytes = matBGRToUint8(crop);
      crop.delete();
      posturePayload = {
        ok: true,
        width: w,
        height: h,
        person_bgr_u8_b64: u8ToB64(bytes),
      };
    }
  } catch (e) {
    console.warn("posture HOG preprocessing failed:", e);
  }
  hog.delete();
  found.delete();

  src.delete();
  gray.delete();
  bgr.delete();
  faces.delete();
  faceCascade.delete();
  eyeCascade.delete();

  return { gaze: gazePayload, posture: posturePayload };
}

export function loadOpenCv() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OpenCV must load in browser"));
  }
  if (window.cv && window.cv.Mat) {
    return Promise.resolve(window.cv);
  }
  if (!window.__opencvLoadPromise) {
    window.__opencvLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.dataset.opencv = "1";
      script.async = true;
      script.src = "https://docs.opencv.org/4.8.0/opencv.js";
      script.onerror = () => reject(new Error("Failed to load opencv.js"));
      script.onload = () => {
        window.cv = window.cv || globalThis.cv;
        window.cv["onRuntimeInitialized"] = () => resolve(window.cv);
      };
      document.body.appendChild(script);
    });
  }
  return window.__opencvLoadPromise;
}
