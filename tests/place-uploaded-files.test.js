import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  rename: vi.fn(),
  unlink: vi.fn(),
  extractMetadata: vi.fn(),
  getFinalPath: vi.fn(),
}));

vi.mock("fs/promises", () => ({
  default: { rename: hoisted.rename, unlink: hoisted.unlink },
}));

vi.mock("../src/app/api/upload/extractMetadata", () => ({
  default: hoisted.extractMetadata,
}));

vi.mock("@/app/api/upload/path_helpers", () => ({
  getFinalPath: hoisted.getFinalPath,
}));

const CHECKSUM = "a".repeat(64);
const TEMP_PATH = "C:\\storage\\tmp\\temp-upload.jpg";
const FINAL_PATH = `C:\\storage\\full\\2026\\03\\${CHECKSUM}.jpg`;

const parsedUpload = () => new Map([["temp-upload.jpg", {
  filepath: TEMP_PATH,
  originalFilename: "original.jpg",
  mimetype: "image/jpeg",
  checksum: CHECKSUM,
  uploadDate: new Date(2026, 2, 1),
}]]);

describe("placeUploadedFiles", () => {
  beforeEach(() => {
    vi.resetModules();
    hoisted.rename.mockReset().mockResolvedValue();
    hoisted.unlink.mockReset().mockResolvedValue();
    hoisted.getFinalPath.mockReset().mockImplementation((file, ext) =>
      `C:\\storage\\full\\2026\\03\\${file.checksum}${ext}`);
    hoisted.extractMetadata.mockReset().mockResolvedValue({
      size: 123,
      mimetype: "image/jpeg",
      type: "image",
      dimensions: { width: 10, height: 20 },
      duration: null,
      hasAudio: false,
    });
  });

  it("moves the file into full/, handles EEXIST collisions, and enriches metadata", async () => {
    hoisted.rename.mockRejectedValueOnce(
      Object.assign(new Error("already exists"), { code: "EEXIST" })
    );

    const { default: placeUploadedFiles } = await import("../src/app/api/upload/placeUploadedFiles");
    const fileData = parsedUpload();
    await placeUploadedFiles(fileData);

    const file = [...fileData.values()][0];
    expect(hoisted.rename).toHaveBeenCalledWith(TEMP_PATH, FINAL_PATH);
    expect(hoisted.unlink).toHaveBeenCalledWith(TEMP_PATH);
    expect(hoisted.extractMetadata).toHaveBeenCalledWith(FINAL_PATH, { fallbackMimeType: "image/jpeg" });
    expect(file.filepath).toBe(FINAL_PATH);
    expect(file.size).toBe(123);
    expect(file.type).toBe("image");
    expect(file.dimensions).toEqual({ width: 10, height: 20 });
    expect(file.duration).toBeNull();
    expect(file.hasAudio).toBe(false);
  });

  it("rethrows rename errors other than EEXIST", async () => {
    hoisted.rename.mockRejectedValueOnce(new Error("permission denied"));

    const { default: placeUploadedFiles } = await import("../src/app/api/upload/placeUploadedFiles");

    await expect(placeUploadedFiles(parsedUpload())).rejects.toThrow("permission denied");
    expect(hoisted.unlink).not.toHaveBeenCalled();
  });
});
