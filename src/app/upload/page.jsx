"use client";

import Nav from "@/components/Nav";
import UploadForm from "./components/UploadForm";

export default function UploadPage() {
  // TODO: add a tagging panel under each successful upload and another one for all entries
  return (
    <>
      <Nav />
      <div className="content">
        <UploadForm />
      </div>
    </>
  );
}
