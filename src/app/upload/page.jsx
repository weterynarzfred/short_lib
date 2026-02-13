"use client";

import Nav from "@/components/Nav";
import UploadForm from "./UploadForm";

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
