import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  unlink: vi.fn(),
  runFfmpeg: vi.fn(),
  processImage: vi.fn(),
  getTempPath: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: {
    unlink: hoisted.unlink,
  },
  unlink: hoisted.unlink,
}));

vi.mock("@/lib/ffmpeg", () => ({
  runFfmpeg: hoisted.runFfmpeg,
}));

vi.mock("../src/app/api/upload/processImage", () => ({
  default: hoisted.processImage,
}));

vi.mock("@/app/api/upload/path_helpers", () => ({
  getTempPath: hoisted.getTempPath,
}));



describe("processVideo", () => {
  beforeEach(() => {
    vi.resetModules();
    hoisted.unlink.mockReset();
    hoisted.runFfmpeg.mockReset();
    hoisted.processImage.mockReset();
    hoisted.getTempPath.mockReset();

    hoisted.getTempPath.mockReturnValue("C:\\storage\\tmp\\abc-frame.jpg");
    hoisted.unlink.mockResolvedValue();
    hoisted.runFfmpeg.mockReturnValue({ closed: Promise.resolve() });
  });

  it("removes temp frame even when image processing fails", async () => {
    hoisted.processImage.mockRejectedValue(new Error("image failed"));

    const { default: processVideo } = await import("../src/app/api/upload/processVideo");
    const metadata = {
      checksum: "abc",
      filepath: "C:\\storage\\full\\2026\\03\\abc.mp4",
      duration: 4000,
      uploadDate: new Date("2026-03-13T00:00:00.000Z"),
    };

    await expect(processVideo(metadata)).rejects.toThrow("image failed");
    expect(hoisted.unlink).toHaveBeenCalledWith("C:\\storage\\tmp\\abc-frame.jpg");
  });
});
