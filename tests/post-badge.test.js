import { describe, expect, it } from "vitest";

import getPostBadgeLabel, { getFileExtension } from "@/app/listing/lib/postBadge";

describe("getFileExtension", () => {
  it("reads the extension from the stored path", () => {
    expect(getFileExtension({ file_path: "2026/03/abc.JPG" })).toBe("jpg");
    expect(getFileExtension({ file_path: "2026/03/abc.tar.gz" })).toBe("gz");
  });

  it("falls back when there is no usable extension", () => {
    expect(getFileExtension({ file_path: "2026/03/abc" })).toBe("file");
    expect(getFileExtension({ file_path: "2026/03/abc." })).toBe("file");
    expect(getFileExtension({})).toBe("file");
    expect(getFileExtension()).toBe("file");
  });
});

describe("getPostBadgeLabel", () => {
  it("shows duration, megapixels, and extension for video", () => {
    expect(getPostBadgeLabel({
      file_path: "2026/03/a.mp4",
      mime_type: "video/mp4",
      duration_ms: 94_000,
      width: 1920,
      height: 1080,
    })).toBe("1:34 · 2.1MP · MP4");
  });

  it("shows megapixels and extension for images, with no duration", () => {
    expect(getPostBadgeLabel({
      file_path: "2026/03/a.jpg",
      mime_type: "image/jpeg",
      width: 1920,
      height: 1080,
    })).toBe("2.1MP · JPG");
  });

  it("shows duration and extension for audio, with no megapixels", () => {
    expect(getPostBadgeLabel({
      file_path: "2026/03/a.mp3",
      mime_type: "audio/mpeg",
      duration_ms: 185_000,
      width: null,
      height: null,
    })).toBe("3:05 · MP3");
  });

  it("drops parts whose data is missing rather than showing placeholders", () => {
    // A video whose ffprobe pass yielded neither duration nor dimensions.
    expect(getPostBadgeLabel({
      file_path: "2026/03/a.mkv",
      mime_type: "video/x-matroska",
      duration_ms: null,
      width: null,
      height: null,
    })).toBe("MKV");

    expect(getPostBadgeLabel({
      file_path: "2026/03/a.webm",
      mime_type: "video/webm",
      duration_ms: 5_000,
      width: null,
      height: null,
    })).toBe("0:05 · WEBM");
  });

  it("falls back to the extension alone for unrecognised types", () => {
    expect(getPostBadgeLabel({
      file_path: "2026/03/a.pdf",
      mime_type: "application/pdf",
      width: 800,
      height: 600,
    })).toBe("PDF");
  });

  it("survives an empty post", () => {
    expect(getPostBadgeLabel({})).toBe("FILE");
  });
});
