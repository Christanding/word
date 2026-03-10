export const FIREWORK_ROUNDS = 3;
export const FIREWORK_ROUND_MS = 3000;
export const FIREWORK_FADE_MS = 1000;

export function getCelebrationTimings() {
  const celebrationMs = FIREWORK_ROUNDS * FIREWORK_ROUND_MS;
  return {
    celebrationMs,
    redirectMs: celebrationMs + FIREWORK_FADE_MS,
  };
}
