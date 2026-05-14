/**
 * Mirrors client/temporal/temporal_smoothing.py TemporalSmoother.
 */
export class TemporalSmoother {
  constructor(windowSize = 3, confidenceThreshold = 0.0) {
    this.windowSize = windowSize;
    this.confidenceThreshold = confidenceThreshold;
    this.buffers = new Map();
  }

  _initBuffer(cueName) {
    this.buffers.set(cueName, []);
  }

  update(cueOutput) {
    const cueName = cueOutput.cue;
    if (!this.buffers.has(cueName)) {
      this._initBuffer(cueName);
    }

    if (
      cueOutput.confidence < this.confidenceThreshold ||
      cueOutput.quality !== "good"
    ) {
      return cueOutput;
    }

    const buf = this.buffers.get(cueName);
    buf.push(cueOutput);
    while (buf.length > this.windowSize) {
      buf.shift();
    }

    return this._smooth(cueName);
  }

  _smooth(cueName) {
    const buffer = this.buffers.get(cueName);
    const predictions = buffer.map((item) => item.prediction);
    const counts = new Map();
    for (const p of predictions) {
      counts.set(p, (counts.get(p) || 0) + 1);
    }
    let mostCommon = predictions[0];
    let best = 0;
    for (const [p, c] of counts.entries()) {
      if (c > best) {
        best = c;
        mostCommon = p;
      }
    }

    const majorityConfs = buffer
      .filter((item) => item.prediction === mostCommon)
      .map((item) => item.confidence);
    const majorityConf =
      majorityConfs.reduce((a, b) => a + b, 0) / majorityConfs.length;

    const smoothedOutput = { ...buffer[buffer.length - 1] };
    smoothedOutput.prediction = mostCommon;
    smoothedOutput.confidence = majorityConf;
    smoothedOutput.window_size = buffer.length;
    smoothedOutput.temporal_smoothed = true;
    return smoothedOutput;
  }
}
