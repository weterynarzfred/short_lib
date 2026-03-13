import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  unlink: vi.fn(),
  spawn: vi.fn(),
  processImage: vi.fn(),
  getTempPath: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: {
    unlink: hoisted.unlink,
  },
  unlink: hoisted.unlink,
}));

vi.mock("child_process", () => ({
  spawn: hoisted.spawn,
}));

vi.mock("../src/app/api/upload/processImage", () => ({
  default: hoisted.processImage,
}));

vi.mock("@/app/api/upload/path_helpers", () => ({
  getTempPath: hoisted.getTempPath,
}));

function ffmpegCloseEmitter(code) {
  return {
    on: (event, handler) => {
      if (event === "close") handler(code);
    },
  };
}

describe("processVideo", () => {
  beforeEach(() => {
    vi.resetModules();
    hoisted.unlink.mockReset();
    hoisted.spawn.mockReset();
    hoisted.processImage.mockReset();
    hoisted.getTempPath.mockReset();

    hoisted.getTempPath.mockReturnValue("C:\\storage\\tmp\\abc-frame.jpg");
    hoisted.unlink.mockResolvedValue();
    hoisted.spawn.mockReturnValue(ffmpegCloseEmitter(0));
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
