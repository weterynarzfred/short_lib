import { useCallback, useEffect, useState, useTransition } from "react";
import classNames from "classnames";
import MediaPanelMeta from "./MediaPanelMeta";
import MediaPanelControls from "./MediaPanelControls";
import useMediaPanelSlideshow from "../lib/useMediaPanelSlideshow";
import MediaPreview from "../../../components/MediaPreview";
import mimetypeToType from "@/app/api/upload/mimetypeToType";
import { updateMediaSettingsAction } from "@/lib/actions";

import styles from "./MediaPanel.module.scss";

const DEFAULT_TOGGLES = {
  autoplay: false,
  loop: false,
  slideshow: false,
  muted: false,
  fullscreen: false
};

export default function MediaPanel({
  post,
  close,
  prev,
  next,
  mediaRef,
  initialSettings,
  onPatchPost,
  onSettingsChange,
}) {
  const [, startTransition] = useTransition();
  const [toggles, setToggles] = useState({
    ...DEFAULT_TOGGLES,
    ...initialSettings,
  });
  const [isMetaPanelOpen, setIsMetaPanelOpen] = useState(true);

  const toggleOption = useCallback((key) => {
    const nextValue = !toggles[key];
    const nextToggles = {
      ...toggles,
      [key]: nextValue,
    };
    setToggles(nextToggles);
    onSettingsChange?.(nextToggles);

    startTransition(() => {
      updateMediaSettingsAction({ [key]: nextValue });
    });
  }, [onSettingsChange, startTransition, toggles]);

  useEffect(() => {
    const handleKeydown = event => {
      if (event.repeat) return;
      if (!event.altKey || event.key !== "Enter") return;

      event.preventDefault();
      toggleOption("fullscreen");
    };

    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [toggleOption]);

  const { handleMediaEnded } = useMediaPanelSlideshow({
    isSlideshowOn: toggles.slideshow,
    postId: post?.id,
    mimeType: typeof post?.mime_type === "string" ? post.mime_type : "",
    onAdvance: next,
  });

  const mimeType = typeof post?.mime_type === "string"
    ? post.mime_type
    : "";
  const mediaType = mimetypeToType(mimeType);
  const canPreview = ["video", "image", "audio", "text"].includes(mediaType);

  if (toggles.fullscreen) {
    return (
      <div className={classNames(styles.mediaPanel, styles.fullscreen)}>
        <div className={styles.fullscreenMedia}>
          <MediaPanelControls
            toggles={toggles}
            onToggle={toggleOption}
            onClose={close}
            isMetaPanelOpen={isMetaPanelOpen}
            onToggleMeta={() => setIsMetaPanelOpen(v => !v)}
          />
          {canPreview ? <MediaPreview
            src={post.file_path}
            mime_type={mimeType}
            mediaRef={mediaRef}
            settings={toggles}
            className={classNames(
              styles[`preview-${mediaType}`],
              styles.previewFullscreen,
            )}
            onEnded={handleMediaEnded}
          /> : <div className={styles.previewNull}></div>}
        </div>

        {isMetaPanelOpen && (
          <div className={styles.fullscreenSidePanel}>
            <MediaPanelMeta
              post={post}
              prev={prev}
              next={next}
              onPatchPost={onPatchPost}
              isSlideshowOn={toggles.slideshow}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.mediaPanel}>
      <MediaPanelControls
        toggles={toggles}
        onToggle={toggleOption}
        onClose={close}
      />

      {canPreview ? <MediaPreview
        src={post.file_path}
        mime_type={mimeType}
        mediaRef={mediaRef}
        settings={toggles}
        className={styles[`preview-${mediaType}`]}
        onEnded={handleMediaEnded}
      /> : <div className={styles.previewNull}></div>}

      <MediaPanelMeta
        post={post}
        prev={prev}
        next={next}
        onPatchPost={onPatchPost}
        isSlideshowOn={toggles.slideshow}
      />
    </div>
  );
}
