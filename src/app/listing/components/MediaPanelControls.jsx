import { useState } from "react";

import styles from "./MediaPanel.module.scss";
import classNames from "classnames";

const TOGGLE_OPTIONS = [
  { key: "autoplay", label: "autoplay" },
  { key: "loop", label: "loop" },
  { key: "slideshow", label: "slideshow" },
  { key: "muted", label: "muted" },
];

export default function MediaPanelControls({ toggles, onToggle, onClose }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={styles.MediaPanel__controls}>
      <button
        type="button"
        className={classNames(styles.MediaPanel__fullscreen, {
          [styles.active]: Boolean(toggles['fullscreen'])
        })}
        aria-label="Toggle fullscreen"
        onClick={() => onToggle('fullscreen')}
      >fullscreen</button>

      <button
        type="button"
        className={styles.MediaPanel__burger}
        aria-label="Toggle media panel menu"
        onClick={() => setMenuOpen(value => !value)}
      >☰</button>

      <button
        type="button"
        className={styles.MediaPanel__close}
        aria-label="Close media panel"
        onClick={onClose}
      >×</button>

      {menuOpen && (
        <div className={styles.MediaPanel__menu}>
          {TOGGLE_OPTIONS.map(({ key, label }) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={Boolean(toggles[key])}
                onChange={() => onToggle(key)}
              />
              <div className={styles.button}>{label}</div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
