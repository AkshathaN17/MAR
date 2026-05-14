/**
 * Mirrors client/fusion/fusion_engine.py FusionEngine.
 */
export class FusionEngine {
  constructor(config) {
    this.config = config;
    this.cueWeights = config.cue_weights;
    this.cueToEmotion = config.cue_to_emotion;
    this.emotions = config.emotions;
    this.confidenceThreshold = config.confidence_threshold ?? 0.2;
  }

  fuse(cues, timestampSec) {
    const emotionScores = {};
    const contributingCues = [];

    for (const [cueName, cueData] of Object.entries(cues)) {
      if (!this.cueWeights[cueName]) continue;
      if (cueData.confidence < this.confidenceThreshold) continue;

      const weight = this.cueWeights[cueName];
      const confidence = cueData.confidence;
      const cuePrediction = cueData.prediction;

      if (!this.cueToEmotion[cueName]?.[cuePrediction]) continue;

      const emotionDistribution = this.cueToEmotion[cueName][cuePrediction];

      for (const [emotion, prob] of Object.entries(emotionDistribution)) {
        emotionScores[emotion] =
          (emotionScores[emotion] || 0) + weight * confidence * prob;
      }

      contributingCues.push(cueName);
    }

    if (Object.keys(emotionScores).length === 0) {
      return this._neutralOutput(timestampSec);
    }

    let finalEmotion = Object.keys(emotionScores)[0];
    for (const e of Object.keys(emotionScores)) {
      if (emotionScores[e] > emotionScores[finalEmotion]) {
        finalEmotion = e;
      }
    }
    const finalConfidence = emotionScores[finalEmotion];

    return {
      timestamp_sec: timestampSec,
      final_emotion: finalEmotion,
      confidence: Math.round(finalConfidence * 10000) / 10000,
      emotion_scores: emotionScores,
      contributing_cues: contributingCues,
      fusion_type: "weighted_majority_voting",
    };
  }

  _neutralOutput(timestampSec) {
    const emotionScores = {};
    for (const e of this.emotions) {
      emotionScores[e] = 0.0;
    }
    return {
      timestamp_sec: timestampSec,
      final_emotion: "neutral",
      confidence: 0.0,
      emotion_scores: emotionScores,
      contributing_cues: [],
      fusion_type: "fallback_neutral",
    };
  }
}
