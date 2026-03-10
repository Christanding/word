function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const TARGET_CONFIDENCE = 0.95;
const BASELINE_CONFIDENCE = 0.5;
const MAX_RELATIVE_MARGIN = 0.12;
const TARGET_RELATIVE_MARGIN = 0.008;
const MIN_MARGIN = 80;
const MAX_MARGIN = 3000;

export function estimateVocabMargin(estimatedVocab: number, confidence: number): number {
  const vocab = Math.max(0, estimatedVocab);
  const normalizedConfidence = clamp(
    (confidence - BASELINE_CONFIDENCE) / (TARGET_CONFIDENCE - BASELINE_CONFIDENCE),
    0,
    1
  );
  const uncertainty = (1 - normalizedConfidence) ** 2;
  const relativeMargin =
    TARGET_RELATIVE_MARGIN + (MAX_RELATIVE_MARGIN - TARGET_RELATIVE_MARGIN) * uncertainty;

  const rawMargin = Math.round(vocab * relativeMargin);
  return clamp(rawMargin, MIN_MARGIN, MAX_MARGIN);
}
