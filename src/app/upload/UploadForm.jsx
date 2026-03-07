"use client";

import { useState, useRef } from "react";
import classNames from "classnames";

import styles from "./UploadForm.module.scss";

export default function UploadForm() {
  const [uploads, setUploads] = useState([]);
  const [dragDepth, setDragDepth] = useState(0);
  const inputRef = useRef(null);

  function markFailed(id) {
    setUploads(prev =>
      prev.map(upload =>
        upload.id === id ? { ...upload, failed: true } : upload
      )
    );
  }

  function uploadFile(file) {
    const id = crypto.randomUUID();

    setUploads(prev => [
      ...prev,
      { id, name: file.name, progress: 0, done: false, failed: false }
    ]);

    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");

    xhr.upload.onprogress = e => {
      if (!e.lengthComputable) return;

      const progress = Math.round((e.loaded / e.total) * 100);

      setUploads(prev =>
        prev.map(upload =>
          upload.id === id ? { ...upload, progress } : upload
        )
      );
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        markFailed(id);
        return;
      }

      try {
        const res = JSON.parse(xhr.responseText);

        if (res.status === "Upload finished") {
          setUploads(prev =>
            prev.map(upload =>
              upload.id === id ?
                { ...upload, progress: 100, done: true } :
                upload
            )
          );
        } else markFailed(id);
      } catch { markFailed(id); }
    };

    xhr.onerror = () => markFailed(id);
    xhr.onabort = () => markFailed(id);
    xhr.send(form);
  }

  function onDrop(e) {
    e.preventDefault();
    [...e.dataTransfer.files].forEach(uploadFile);
    setDragDepth(0);
  }

  return (
    <div className={styles.UploadForm}>
      <div
        className={classNames(
          styles.dropzone,
          { [styles.dropzoneDragging]: dragDepth > 0 }
        )}
        onDragEnter={e => { e.preventDefault(); setDragDepth(d => d + 1); }}
        onDragLeave={e => { e.preventDefault(); setDragDepth(d => d - 1); }}
        onDragOver={e => { e.preventDefault(); }}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        drop files here or click to upload
      </div>

      <input ref={inputRef} type="file" multiple hidden />

      <div className={styles.uploadList}>
        {uploads.map(file =>
          <div key={file.id} className={classNames(styles.item, {
            [styles.itemDone]: file.done,
            [styles.itemFailed]: file.failed,
          })}>
            <div className={styles.progressWrapper}>
              {file.done && <div className={styles.progressDone}>✓</div>}
              {file.failed && <div className={styles.progressFailed}>✗</div>}
              <div className={styles.progress}>
                <div
                  className={styles.progressBar}
                  style={{ width: file.progress + "%" }}
                />
              </div>
            </div>
            <div>
              {file.name}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
