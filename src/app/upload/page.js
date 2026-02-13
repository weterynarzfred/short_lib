"use client";

import Nav from "@/components/Nav";
import UploadForm from "@/components/UploadForm";

export default function UploadPage() {
  return (
    <>
      <Nav />
      <div className="content">
        <UploadForm />
      </div>
    </>
  );
}
