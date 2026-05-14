/**
 * Mirrors client/packaging/data_packager.py DataPackager.
 */
export class DataPackager {
  constructor(studentId, classId, sessionId) {
    this.student_id = studentId;
    this.class_id = classId;
    this.session_id = sessionId;
    this.start_time = Date.now() / 1000;
    this.emotion_history = [];
    this.emotion_counter = {};
  }

  addFusionResult(fusionOutput) {
    const emotion = fusionOutput.final_emotion;
    this.emotion_counter[emotion] = (this.emotion_counter[emotion] || 0) + 1;
    this.emotion_history.push(fusionOutput);
  }

  buildWindowPayload(fusionOutput) {
    return {
      type: "window_update",
      class_id: this.class_id,
      student_id: this.student_id,
      session_id: this.session_id,
      timestamp_sec: fusionOutput.timestamp_sec,
      emotion: fusionOutput.final_emotion,
      confidence: fusionOutput.confidence,
      emotion_scores: fusionOutput.emotion_scores,
      fusion_type: fusionOutput.fusion_type,
    };
  }

  buildSummaryPayload() {
    const totalWindows = this.emotion_history.length;
    if (totalWindows === 0) return {};

    const emotionDistribution = {};
    for (const [emotion, count] of Object.entries(this.emotion_counter)) {
      emotionDistribution[emotion] = Math.round((count / totalWindows) * 1000) / 1000;
    }

    let dominantEmotion = Object.keys(emotionDistribution)[0];
    for (const e of Object.keys(emotionDistribution)) {
      if (emotionDistribution[e] > emotionDistribution[dominantEmotion]) {
        dominantEmotion = e;
      }
    }

    return {
      type: "session_summary",
      class_id: this.class_id,
      student_id: this.student_id,
      session_id: this.session_id,
      duration_sec: Math.floor(Date.now() / 1000 - this.start_time),
      total_windows: totalWindows,
      emotion_distribution: emotionDistribution,
      dominant_emotion: dominantEmotion,
    };
  }

  buildFinalPayload() {
    const summary = this.buildSummaryPayload();
    return {
      ...summary,
      type: "session_final",
      ended_at: Math.floor(Date.now() / 1000),
    };
  }
}
