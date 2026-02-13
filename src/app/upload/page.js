"use client";

import Nav from "@/components/Nav";

export default function UploadPage() {
  async function handleUpload(e) {
    const form = new FormData();
    [...e.target.files].forEach(file => {
      form.append("file", file);
    });

    await fetch("/api/upload", {
      method: "POST",
      body: form,
    });

    alert("Uploaded");
  }

  return (
    <div>
      <Nav />
      <input type="file" onChange={handleUpload} multiple />
    </div>
  );
}
