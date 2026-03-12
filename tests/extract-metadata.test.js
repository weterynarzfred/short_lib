import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  ffprobe: vi.fn(),
  fileTypeFromFile: vi.fn(),
  stat: vi.fn(),
  sharp: vi.fn(),
  sharpMetadata: vi.fn(),
}));

vi.mock("../src/app/api/upload/ffprobe", () => ({
  default: hoisted.ffprobe,
}));

vi.mock("file-type", () => ({
  fileTypeFromFile: hoisted.fileTypeFromFile,
}));

vi.mock("fs/promises", () => ({
  stat: hoisted.stat,
}));

vi.mock("sharp", () => ({
  default: hoisted.sharp,
}));

describe("extractMetadata", () => {
  beforeEach(() => {
    vi.resetModules();
    hoisted.ffprobe.mockReset();
    hoisted.fileTypeFromFile.mockReset();
    hoisted.stat.mockReset();
    hoisted.sharp.mockReset();
    hoisted.sharpMetadata.mockReset();

    hoisted.stat.mockResolvedValue({ size: 123 });
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
});
