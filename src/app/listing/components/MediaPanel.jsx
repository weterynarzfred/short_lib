import { useCallback, useState, useTransition } from "react";
import classNames from "classnames";
import MediaPanelMeta from "./MediaPanelMeta";
import MediaPanelControls from "./MediaPanelControls";
import useMediaPanelSlideshow from "../lib/useMediaPanelSlideshow";
import MediaPreview from "../../../components/MediaPreview";
import { updateMediaSettingsAction } from "@/lib/actions";

import styles from "./MediaPanel.module.scss";

const DEFAULT_TOGGLES = {
  autoplay: false,
  loop: false,
  slideshow: false,
  muted: false,
  fullscreen: false
};

export default function MediaPanel({ post, close, prev, next, mediaRef, initialSettings }) {
  const [, startTransition] = useTransition();
  const [toggles, setToggles] = useState({
    ...DEFAULT_TOGGLES,
    ...initialSettings,
  });

  const toggleOption = useCallback((key) => {
    const nextValue = !toggles[key];
    setToggles(prev => ({ ...prev, [key]: nextValue }));

    startTransition(() => {
      updateMediaSettingsAction({ [key]: nextValue });
    });
  }, [startTransition, toggles]);

  const { handleMediaEnded } = useMediaPanelSlideshow({
    isSlideshowOn: toggles.slideshow,
    postId: post?.id,
    mimeType: post?.mime_type,
    onAdvance: next,
  });

  return (
    <div
      className={classNames(styles.mediaPanel, {
        [styles.fullscreen]: toggles.fullscreen,
      })}
    >
      <MediaPanelControls
        toggles={toggles}
        onToggle={toggleOption}
        onClose={close}
      />

      {Boolean(['video', 'image', 'audio'].includes(post?.mime_type.split("/")[0])) ? <MediaPreview
        src={post.file_path}
        mime_type={post.mime_type}
        mediaRef={mediaRef}
        settings={toggles}
        className={classNames(
          styles[`preview-${post?.mime_type.split("/")[0]}`],
          { [styles.previewFullscreen]: toggles.fullscreen }
        )}
        onEnded={handleMediaEnded}
      /> : null}

      <MediaPanelMeta
        post={post}
        prev={prev}
        next={next}
        isSlideshowOn={toggles.slideshow}
        className={classNames({
          [styles.metaFullscreen]: toggles.fullscreen,
        })}
      />
    </div>
  );
}
