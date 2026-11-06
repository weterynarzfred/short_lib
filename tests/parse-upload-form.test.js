import { beforeEach, describe, expect, it, vi } from "vitest";
import { Writable } from "stream";

const hoisted = vi.hoisted(() => ({
  createWriteStream: vi.fn(),
  rename: vi.fn(),
  rm: vi.fn(),
  formidable: vi.fn(),
  getTempPath: vi.fn(),
}));

vi.mock("fs", () => ({
  createWriteStream: hoisted.createWriteStream,
}));

vi.mock("fs/promises", () => ({
  default: {
    rename: hoisted.rename,
    rm: hoisted.rm,
  },
  rename: hoisted.rename,
  rm: hoisted.rm,
}));

vi.mock("formidable", () => ({
  default: hoisted.formidable,
}));

vi.mock("@/app/api/upload/path_helpers", () => ({
  getTempPath: hoisted.getTempPath,
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
    hoisted.rm.mockReset();
    hoisted.formidable.mockReset();
    hoisted.getTempPath.mockReset();

    hoisted.createWriteStream.mockImplementation(() => new Writable({
      write(_chunk, _enc, cb) {
        cb();
      },
    }));

    hoisted.getTempPath.mockImplementation(filename => `C:\\storage\\tmp\\${filename}`);

    hoisted.rename.mockResolvedValue();
    hoisted.rm.mockResolvedValue();
  });

  it("computes the checksum and leaves the file in tmp/ for the duplicate check", async () => {
    setupSingleFileForm();

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
    expect(file.filepath).toBe("C:\\storage\\tmp\\temp-upload.jpg");
    expect(file.hash).toBeUndefined();
    expect(file.finished).toBeUndefined();
    expect(hoisted.rename).not.toHaveBeenCalled();
  });

  it("destroys the write stream and removes the temp file when parsing fails", async () => {
    hoisted.formidable.mockImplementationOnce(options => ({
      parse: async () => {
        const stream = options.fileWriteStreamHandler({
          newFilename: "temp-upload.mp4",
          originalFilename: "original.mp4",
          mimetype: "video/mp4",
        });
        stream.write(Buffer.from("partial"));
        throw new Error("aborted");
      },
    }));

    const { default: parseUploadForm } = await import("../src/app/api/upload/parseUploadForm");
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=----x",
        "content-length": "1",
      },
      body: "x",
    });

    await expect(parseUploadForm(req)).rejects.toThrow("aborted");

    const writeStream = hoisted.createWriteStream.mock.results[0].value;
    expect(writeStream.destroyed).toBe(true);
    expect(hoisted.rm).toHaveBeenCalledWith("C:\\storage\\tmp\\temp-upload.mp4", { force: true });
    expect(hoisted.rename).not.toHaveBeenCalled();
  });
});
