/**
 * Mirrors client/fusion/cue_to_affect.py CueToAffectMapper.
 */
const NEUTRAL_DIST = {
  interested: 0.0,
  bored: 0.0,
  confused: 0.0,
  frustrated: 0.0,
  neutral: 1.0,
};

export class CueToAffectMapper {
  constructor(cueToEmotionConfig) {
    this.cueToEmotion = cueToEmotionConfig;
  }

  map(cueOutput) {
    const cueName = cueOutput.cue;
    const prediction = cueOutput.prediction;

    let emotionDistribution = { ...NEUTRAL_DIST };

    if (
      !this.cueToEmotion[cueName] ||
      !this.cueToEmotion[cueName][prediction]
    ) {
      return {
        ...cueOutput,
        emotion_distribution: emotionDistribution,
        mapping_quality: "fallback_neutral",
      };
    }

    emotionDistribution = JSON.parse(
      JSON.stringify(this.cueToEmotion[cueName][prediction])
    );

    return {
      ...cueOutput,
      emotion_distribution: emotionDistribution,
      mapping_quality: "mapped",
    };
  }
}
