import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  ffprobe: vi.fn(),
  fileTypeFromFile: vi.fn(),
  lookupMimeType: vi.fn(),
  isText: vi.fn(),
  stat: vi.fn(),
  open: vi.fn(),
  openRead: vi.fn(),
  openClose: vi.fn(),
  sharp: vi.fn(),
  sharpMetadata: vi.fn(),
}));

vi.mock("../src/app/api/upload/ffprobe", () => ({
  default: hoisted.ffprobe,
}));

vi.mock("file-type", () => ({
  fileTypeFromFile: hoisted.fileTypeFromFile,
}));

vi.mock("mime-types", () => ({
  lookup: hoisted.lookupMimeType,
}));

vi.mock("istextorbinary", () => ({
  isText: hoisted.isText,
}));

vi.mock("fs/promises", () => ({
  stat: hoisted.stat,
  open: hoisted.open,
}));

vi.mock("sharp", () => ({
  default: hoisted.sharp,
}));

describe("extractMetadata", () => {
  beforeEach(() => {
    vi.resetModules();
    hoisted.ffprobe.mockReset();
    hoisted.fileTypeFromFile.mockReset();
    hoisted.lookupMimeType.mockReset();
    hoisted.isText.mockReset();
    hoisted.stat.mockReset();
    hoisted.open.mockReset();
    hoisted.openRead.mockReset();
    hoisted.openClose.mockReset();
    hoisted.sharp.mockReset();
    hoisted.sharpMetadata.mockReset();

    hoisted.lookupMimeType.mockReturnValue(false);
    hoisted.isText.mockReturnValue(null);
    hoisted.stat.mockResolvedValue({ size: 123 });
    hoisted.openRead.mockResolvedValue({ bytesRead: 0 });
    hoisted.openClose.mockResolvedValue(undefined);
    hoisted.open.mockResolvedValue({
      read: hoisted.openRead,
      close: hoisted.openClose,
    });
    hoisted.sharp.mockImplementation(() => ({
      metadata: hoisted.sharpMetadata,
    }));
  });

  it("marks hasAudio when a video contains an audio stream", async () => {
    hoisted.fileTypeFromFile.mockResolvedValue({ mime: "video/mp4" });
    hoisted.ffprobe.mockResolvedValue({
      streams: [
        { codec_type: "video", width: 1280, height: 720 },
        { codec_type: "audio" },
      ],
      format: { duration: "4.2" },
    });

    const { default: extractMetadata } = await import("../src/app/api/upload/extractMetadata");
    const metadata = await extractMetadata("C:\\storage\\full\\2026\\03\\abc.mp4");

    expect(metadata).toMatchObject({
      mimetype: "video/mp4",
      type: "video",
      size: 123,
      dimensions: { width: 1280, height: 720 },
      duration: 4200,
      hasAudio: true,
    });
  });

  it("keeps hasAudio false when a video has no audio stream", async () => {
    hoisted.fileTypeFromFile.mockResolvedValue({ mime: "video/mp4" });
    hoisted.ffprobe.mockResolvedValue({
      streams: [{ codec_type: "video", width: 1920, height: 1080 }],
      format: { duration: "2" },
    });

    const { default: extractMetadata } = await import("../src/app/api/upload/extractMetadata");
    const metadata = await extractMetadata("C:\\storage\\full\\2026\\03\\no-audio.mp4");

    expect(metadata.hasAudio).toBe(false);
    expect(metadata.dimensions).toEqual({ width: 1920, height: 1080 });
    expect(metadata.duration).toBe(2000);
  });

  it("uses fallback mime type when detector cannot identify the file", async () => {
    hoisted.fileTypeFromFile.mockResolvedValue(null);

    const { default: extractMetadata } = await import("../src/app/api/upload/extractMetadata");
    const metadata = await extractMetadata(
      "C:\\storage\\full\\2026\\03\\note.bin",
      { fallbackMimeType: "text/plain" }
    );

    expect(metadata.mimetype).toBe("text/plain");
    expect(metadata.type).toBe("text");
    expect(metadata.hasAudio).toBe(false);
  });

  it("falls back to extension mime and then application/octet-stream", async () => {
    hoisted.fileTypeFromFile.mockResolvedValue(null);
    hoisted.lookupMimeType.mockReturnValueOnce("text/plain");

    const { default: extractMetadata } = await import("../src/app/api/upload/extractMetadata");

    const fromExtension = await extractMetadata("C:\\storage\\full\\2026\\03\\note.txt");
    expect(fromExtension.mimetype).toBe("text/plain");
    expect(fromExtension.type).toBe("text");

    hoisted.lookupMimeType.mockReturnValueOnce(false);
    const defaulted = await extractMetadata("C:\\storage\\full\\2026\\03\\note");
    expect(defaulted.mimetype).toBe("application/octet-stream");
    expect(defaulted.type).toBe("other");
  });

  it("prefers extension mime over generic upload fallback", async () => {
    hoisted.fileTypeFromFile.mockResolvedValue(null);
    hoisted.lookupMimeType.mockReturnValueOnce("text/markdown");

    const { default: extractMetadata } = await import("../src/app/api/upload/extractMetadata");
    const metadata = await extractMetadata(
      "C:\\storage\\full\\2026\\03\\readme.md",
      { fallbackMimeType: "application/octet-stream" }
    );

    expect(metadata.mimetype).toBe("text/markdown");
    expect(metadata.type).toBe("text");
    expect(hoisted.isText).not.toHaveBeenCalled();
  });

  it("ignores generic fallback mime and upgrades known text by extension detection", async () => {
    hoisted.fileTypeFromFile.mockResolvedValue(null);
    hoisted.lookupMimeType.mockReturnValue(false);
    hoisted.isText.mockReturnValueOnce(true);

    const { default: extractMetadata } = await import("../src/app/api/upload/extractMetadata");
    const metadata = await extractMetadata(
      "C:\\storage\\full\\2026\\03\\README.md",
      { fallbackMimeType: "application/octet-stream" }
    );

    expect(metadata.mimetype).toBe("text/plain");
    expect(metadata.type).toBe("text");
    expect(hoisted.open).not.toHaveBeenCalled();
  });

  it("falls back to buffer-based text detection for unknown extensions", async () => {
    hoisted.fileTypeFromFile.mockResolvedValue(null);
    hoisted.lookupMimeType.mockReturnValue(false);
    hoisted.isText
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(true);
    hoisted.openRead.mockImplementation(async buffer => {
      const source = Buffer.from("plain text content");
      source.copy(buffer);
      return { bytesRead: source.length };
    });

    const { default: extractMetadata } = await import("../src/app/api/upload/extractMetadata");
    const metadata = await extractMetadata(
      "C:\\storage\\full\\2026\\03\\file.unknown",
      { fallbackMimeType: "application/octet-stream" }
    );

    expect(metadata.mimetype).toBe("text/plain");
    expect(metadata.type).toBe("text");
    expect(hoisted.open).toHaveBeenCalledWith("C:\\storage\\full\\2026\\03\\file.unknown", "r");
    expect(hoisted.openClose).toHaveBeenCalledTimes(1);
  });
});
