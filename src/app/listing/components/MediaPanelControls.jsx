import { useState } from "react";
import classNames from "classnames";

import styles from "./MediaPanel.module.scss";

const TOGGLE_OPTIONS = ["autoplay", "loop", "slideshow", "muted"];

export default function MediaPanelControls({ toggles, onToggle, onClose }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={styles.controls}>
      <button
        type="button"
        className={classNames(styles.fullscreenToggle, {
          [styles.buttonActive]: toggles.fullscreen,
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
            [styles.buttonActive]: toggles.info,
          })}
          aria-label="Toggle info panel"
          onClick={() => onToggle("info")}
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
          {TOGGLE_OPTIONS.map(key => (
            <label key={key}>
              <input
                type="checkbox"
                checked={toggles[key]}
                onChange={() => onToggle(key)}
              />
              <div className={styles.toggleButton}>{key}</div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
