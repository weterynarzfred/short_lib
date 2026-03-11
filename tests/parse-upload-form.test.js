import { beforeEach, describe, expect, it, vi } from "vitest";
import { Writable } from "stream";

const hoisted = vi.hoisted(() => ({
  createWriteStream: vi.fn(),
  rename: vi.fn(),
  unlink: vi.fn(),
  formidable: vi.fn(),
  extractMetadata: vi.fn(),
  getTempPath: vi.fn(),
  getFinalPath: vi.fn(),
}));

vi.mock("fs", () => ({
  createWriteStream: hoisted.createWriteStream,
}));

vi.mock("fs/promises", () => ({
  default: {
    rename: hoisted.rename,
    unlink: hoisted.unlink,
  },
  rename: hoisted.rename,
  unlink: hoisted.unlink,
}));

vi.mock("formidable", () => ({
  default: hoisted.formidable,
}));

vi.mock("../src/app/api/upload/extractMetadata", () => ({
  default: hoisted.extractMetadata,
}));

vi.mock("@/app/api/upload/path_helpers", () => ({
  getTempPath: hoisted.getTempPath,
  getFinalPath: hoisted.getFinalPath,
}));

function setupSingleFileForm({
  newFilename = "temp-upload.jpg",
  originalFilename = "original.jpg",
  mimetype = "image/jpeg",
  chunk = Buffer.from("abc"),
} = {}) {
  hoisted.formidable.mockImplementationOnce(options => ({
    parse: async () => {
      const stream = options.fileWriteStreamHandler({
        newFilename,
        originalFilename,
        mimetype,
      });
      stream.write(chunk);
      stream.end();
    },
  }));
}

describe("parseUploadForm", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    hoisted.createWriteStream.mockReset();
    hoisted.rename.mockReset();
    hoisted.unlink.mockReset();
    hoisted.formidable.mockReset();
    hoisted.extractMetadata.mockReset();
    hoisted.getTempPath.mockReset();
    hoisted.getFinalPath.mockReset();

    hoisted.createWriteStream.mockImplementation(() => new Writable({
      write(_chunk, _enc, cb) {
        cb();
      },
    }));

    hoisted.getTempPath.mockImplementation(filename => `C:\\storage\\tmp\\${filename}`);
    hoisted.getFinalPath.mockImplementation((file, ext) =>
      `C:\\storage\\full\\2026\\03\\${file.checksum}${ext}`);

    hoisted.rename.mockResolvedValue();
    hoisted.unlink.mockResolvedValue();
    hoisted.extractMetadata.mockResolvedValue({
      size: 123,
      mimetype: "image/jpeg",
      type: "image",
      dimensions: { width: 10, height: 20 },
      duration: null,
    });
  });

  it("computes checksum, handles EEXIST rename collisions, and enriches metadata", async () => {
    setupSingleFileForm();
    hoisted.rename.mockRejectedValueOnce(
      Object.assign(new Error("already exists"), { code: "EEXIST" })
    );

    const { default: parseUploadForm } = await import("../src/app/api/upload/parseUploadForm");
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=----x",
        "content-length": "1",
      },
      body: "x",
    });

    const fileData = await parseUploadForm(req);

    expect(fileData.size).toBe(1);
    const file = [...fileData.values()][0];

    expect(hoisted.createWriteStream).toHaveBeenCalledWith("C:\\storage\\tmp\\temp-upload.jpg");
    expect(file.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(file.uploadDate instanceof Date).toBe(true);
    expect(file.filepath).toBe(`C:\\storage\\full\\2026\\03\\${file.checksum}.jpg`);
    expect(file.size).toBe(123);
    expect(file.mimetype).toBe("image/jpeg");
    expect(file.type).toBe("image");
    expect(file.dimensions).toEqual({ width: 10, height: 20 });
    expect(file.duration).toBeNull();
    expect(file.hash).toBeUndefined();
    expect(file.finished).toBeUndefined();

    expect(hoisted.rename).toHaveBeenCalledWith(
      "C:\\storage\\tmp\\temp-upload.jpg",
      `C:\\storage\\full\\2026\\03\\${file.checksum}.jpg`
    );
    expect(hoisted.unlink).toHaveBeenCalledWith("C:\\storage\\tmp\\temp-upload.jpg");
    expect(hoisted.extractMetadata).toHaveBeenCalledWith(`C:\\storage\\full\\2026\\03\\${file.checksum}.jpg`);
  });

  it("rethrows rename errors other than EEXIST", async () => {
    setupSingleFileForm();
    hoisted.rename.mockRejectedValueOnce(new Error("permission denied"));

    const { default: parseUploadForm } = await import("../src/app/api/upload/parseUploadForm");
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=----x",
        "content-length": "1",
      },
      body: "x",
    });

    await expect(parseUploadForm(req)).rejects.toThrow("permission denied");
    expect(hoisted.unlink).not.toHaveBeenCalled();
  });
});
