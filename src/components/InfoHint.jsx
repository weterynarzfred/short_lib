"use client";

import useFieldHint from "@/lib/useFieldHint";

import styles from "./InfoHint.module.scss";

// A dedicated target for explanations rather than hanging them off the control itself: a
// card covering the field you are about to click is worse than no card at all.
//
// A real button, so it takes keyboard focus and the hint is reachable without a pointer.
export default function InfoHint({ content, label = "more information" }) {
  const fieldHint = useFieldHint();

  return (
    <button
      type="button"
      className={styles.infoHint}
      aria-label={label}
      // Nothing to do on click - hovering or focusing already shows it - but clicking
      // focuses the button, which opens it too.
      onClick={event => event.preventDefault()}
      {...fieldHint(content)}
    >i</button>
  );
}
