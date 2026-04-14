import { useState } from "react";
import classNames from "classnames";

import styles from "./MediaPanel.module.scss";

const TOGGLE_OPTIONS = [
  { key: "autoplay", label: "autoplay" },
  { key: "loop", label: "loop" },
  { key: "slideshow", label: "slideshow" },
  { key: "muted", label: "muted" },
];

export default function MediaPanelControls({ toggles, onToggle, onClose, isMetaPanelOpen, onToggleMeta }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={styles.controls}>
      <button
        type="button"
        className={classNames(styles.fullscreenToggle, {
          [styles.buttonActive]: Boolean(toggles.fullscreen),
        })}
        aria-label="Toggle fullscreen"
        onClick={() => onToggle("fullscreen")}
      >
        fullscreen
      </button>

      {toggles.fullscreen && (
        <button
          type="button"
          className={classNames(styles.fullscreenToggle, {
            [styles.buttonActive]: isMetaPanelOpen,
          })}
          aria-label="Toggle info panel"
          onClick={onToggleMeta}
        >
          info
        </button>
      )}

      <button
        type="button"
        className={styles.menuToggle}
        aria-label="Toggle media panel menu"
        onClick={() => setMenuOpen(value => !value)}
      >
        {"\u2630"}
      </button>

      <button
        type="button"
        className={styles.closeButton}
        aria-label="Close media panel"
        onClick={onClose}
      >
        {"\u00d7"}
      </button>

      {menuOpen && (
        <div className={styles.menu}>
          {TOGGLE_OPTIONS.map(({ key, label }) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={Boolean(toggles[key])}
                onChange={() => onToggle(key)}
              />
              <div className={styles.toggleButton}>{label}</div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
