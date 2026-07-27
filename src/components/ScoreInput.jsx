"use client";

import classNames from "classnames";

import { MAX_SCORE } from "@/lib/score";

import styles from "./ScoreInput.module.scss";

const STARS = Array.from({ length: MAX_SCORE }, (_, index) => index + 1);

// A circle for "unrated" followed by five stars. The circle is a real option rather than
// an empty state, so clearing a score is one click and not a hunt for how to undo it.
export default function ScoreInput({
  value = 0,
  onChange,
  disabled = false,
  label = "score",
}) {
  const score = Number(value) || 0;

  return (
    <div className={styles.scoreInput} role="radiogroup" aria-label={label}>
      <button
        type="button"
        role="radio"
        aria-checked={score === 0}
        aria-label="unrated"
        title="unrated"
        className={classNames(styles.item, styles.clear, {
          [styles.clearActive]: score === 0,
        })}
        disabled={disabled}
        onClick={() => onChange?.(0)}
      >{"●"}</button>

      {STARS.map(star => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={score === star}
          aria-label={star === 1 ? "1 star" : `${star} stars`}
          title={star === 1 ? "1 star" : `${star} stars`}
          className={classNames(styles.item, styles.star, {
            [styles.starFilled]: star <= score,
          })}
          disabled={disabled}
          onClick={() => onChange?.(star)}
        >{"★"}</button>
      ))}
    </div>
  );
}
