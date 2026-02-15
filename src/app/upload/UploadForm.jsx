"use client";
import { useState, useRef } from "react";
import classNames from "classnames";

import styles from "./UploadForm.module.scss";

export default function UploadForm() {
  const [uploads, setUploads] = useState([]);
  const [dragDepth, setDragDepth] = useState(0);
  const inputRef = useRef(null);

  function uploadFile(file) {
    const id = crypto.randomUUID();

    setUploads(prev => [...prev, { id, name: file.name, progress: 0 }]);

    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");

    xhr.upload.onprogress = e => {
      if (!e.lengthComputable) return;

      const percent = Math.round((e.loaded / e.total) * 100);

      setUploads(prev =>
        prev.map(u => (u.id === id ? { ...u, progress: percent } : u))
      );
    };

    xhr.onload = () => {
      setUploads(prev =>
        prev.map(u => (u.id === id ? { ...u, progress: 100 } : u))
      );
    };

    xhr.send(form);
  }

  function onDrop(e) {
    e.preventDefault();
    [...e.dataTransfer.files].forEach(uploadFile);
    setDragDepth(0);
  }

  function onDragEnter(e) {
    e.preventDefault();
    setDragDepth(d => d + 1);
  }

  function onDragLeave(e) {
    e.preventDefault();
    setDragDepth(d => d - 1);
  }

  function onDragOver(e) {
    e.preventDefault();
  }

  return (
    <div className={styles.UploadForm}>
      <div
        className={classNames(
          styles.dropzone,
          { [styles["dropzone--dragging"]]: dragDepth > 0 }
        )}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        drop files here or click to upload
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
      />

      <div className={styles.uploadList}>
        {uploads.map(file => (
          <div key={file.id} className={styles.uploadList__item}>
            <div className={styles.uploadList__progress}>
              <div
                className={styles.uploadList__progressBar}
                style={{ width: file.progress + '%' }}
              ></div>
            </div>
            <div>{file.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
