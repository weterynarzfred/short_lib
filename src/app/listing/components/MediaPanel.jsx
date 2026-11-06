import { useEffect, useState, useTransition } from "react";
import classNames from "classnames";
import MediaPanelMeta from "./MediaPanelMeta";
import MediaPanelControls from "./MediaPanelControls";
import useMediaPanelSlideshow from "../lib/useMediaPanelSlideshow";
import useSwipeNavigation from "../lib/useSwipeNavigation";
import MediaPreview from "../../../components/MediaPreview";
import mimetypeToType from "@/lib/mimetypeToType";
import { updateMediaSettingsAction } from "@/lib/actions";

import styles from "./MediaPanel.module.scss";

export default function MediaPanel({
  post,
  close,
  prev,
  next,
  mediaRef,
  initialSettings,
  onPatchPost,
  onRemovePosts,
  onSettingsChange,
}) {
  const [, startTransition] = useTransition();
  const [toggles, setToggles] = useState(initialSettings);

  const toggleOption = key => {
    const nextValue = !toggles[key];
    const nextToggles = { ...toggles, [key]: nextValue };
    setToggles(nextToggles);
    onSettingsChange(nextToggles);

    startTransition(() => {
      updateMediaSettingsAction({ [key]: nextValue });
    });
  };

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

  const mimeType = post.mime_type;

  const { handleMediaEnded } = useMediaPanelSlideshow({
    isSlideshowOn: toggles.slideshow,
    postId: post.id,
    mimeType,
    onAdvance: next,
  });

  const swipe = useSwipeNavigation({ prev, next });

  const mediaType = mimetypeToType(mimeType);
  const canPreview = ["video", "image", "audio", "text"].includes(mediaType);

  if (toggles.fullscreen) {
    return (
      <div className={classNames(styles.mediaPanel, styles.fullscreen)}>
        <div
          className={styles.fullscreenMedia}
          onTouchStart={swipe.onTouchStart}
          onTouchEnd={swipe.onTouchEnd}
        >
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
            className={classNames(
              styles[`preview-${mediaType}`],
              styles.previewFullscreen,
            )}
            onEnded={handleMediaEnded}
          /> : <div className={styles.previewNull}></div>}
        </div>

        {toggles.info && (
          <div className={styles.fullscreenSidePanel}>
            <MediaPanelMeta
              post={post}
              prev={prev}
              next={next}
              onPatchPost={onPatchPost}
              onRemovePosts={onRemovePosts}
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

      <div className={styles.media} onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd}>
        {canPreview ? <MediaPreview
          src={post.file_path}
          mime_type={mimeType}
          mediaRef={mediaRef}
          settings={toggles}
          className={styles[`preview-${mediaType}`]}
          onEnded={handleMediaEnded}
        /> : <div className={styles.previewNull}></div>}
      </div>

      <MediaPanelMeta
        post={post}
        prev={prev}
        next={next}
        onPatchPost={onPatchPost}
        onRemovePosts={onRemovePosts}
        isSlideshowOn={toggles.slideshow}
      />
    </div>
  );
}
