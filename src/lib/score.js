export const MAX_SCORE = 5;

// 0 means unrated - there is deliberately no separate "unset" state, so anything
// unparseable clamps to 0 rather than becoming null.
export function clampScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;

  return Math.min(Math.max(Math.round(score), 0), MAX_SCORE);
}
