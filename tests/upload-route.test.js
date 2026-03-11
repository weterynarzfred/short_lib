import { beforeEach, describe, expect, it, vi } from "vitest";

describe("upload route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns uploaded media metadata from addMediaToDb", async () => {
    const fileData = new Map([["a", { filepath: "tmp-a", checksum: "abc" }]]);
    const parseUploadForm = vi.fn(async () => fileData);
    const generateMediaDerivatives = vi.fn(async () => undefined);
    const addMediaToDb = vi.fn(async () => [
      {
        id: 7,
        originalFilename: "a.jpg",
        filePath: "2026/03/a.jpg",
        mimeType: "image/jpeg",
        tags: [{ name: "image", type: "meta" }],
      },
    ]);
    const findExistingChecksums = vi.fn(() => { });

    vi.doMock("../src/app/api/upload/parseUploadForm", () => ({ default: parseUploadForm }));
    vi.doMock("../src/app/api/upload/generateMediaDerivatives", () => ({ default: generateMediaDerivatives }));
    vi.doMock("../src/app/api/upload/addMediaToDb", () => ({ default: addMediaToDb }));
    vi.doMock("../src/lib/mediaChecksums", () => ({ findExistingChecksums }));

    const { POST } = await import("../src/app/api/upload/route");
    const req = new Request("http://localhost/api/upload", { method: "POST" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(parseUploadForm).toHaveBeenCalledWith(req);
    expect(findExistingChecksums).toHaveBeenCalledWith(["abc"]);
    expect(generateMediaDerivatives).toHaveBeenCalledWith(fileData);
    expect(addMediaToDb).toHaveBeenCalledWith(fileData);
    expect(body).toEqual({
      status: "Upload finished",
      uploaded: [
        {
          id: 7,
          originalFilename: "a.jpg",
          filePath: "2026/03/a.jpg",
          mimeType: "image/jpeg",
          tags: [{ name: "image", type: "meta" }],
        },
      ],
    });
  });

  it("returns 409 when duplicate checksum is found", async () => {
    const fileData = new Map([["a", { filepath: "tmp-a", checksum: "dup" }]]);
    const parseUploadForm = vi.fn(async () => fileData);
    const generateMediaDerivatives = vi.fn(async () => undefined);
    const addMediaToDb = vi.fn(async () => []);
    const existingPost = { id: 9, checksum: "dup", file_path: "2026/03/x.jpg" };
    const findExistingChecksums = vi.fn(() => existingPost);

    vi.doMock("../src/app/api/upload/parseUploadForm", () => ({ default: parseUploadForm }));
    vi.doMock("../src/app/api/upload/generateMediaDerivatives", () => ({ default: generateMediaDerivatives }));
    vi.doMock("../src/app/api/upload/addMediaToDb", () => ({ default: addMediaToDb }));
    vi.doMock("../src/lib/mediaChecksums", () => ({ findExistingChecksums }));

    const { POST } = await import("../src/app/api/upload/route");
    const req = new Request("http://localhost/api/upload", { method: "POST" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body).toEqual({
      error: "Duplicate file",
      existingPost,
    });
    expect(generateMediaDerivatives).not.toHaveBeenCalled();
    expect(addMediaToDb).not.toHaveBeenCalled();
  });

  it("returns 500 for invalid parser output shape", async () => {
    const parseUploadForm = vi.fn(async () => ({ notMap: true }));
    const generateMediaDerivatives = vi.fn(async () => undefined);
    const addMediaToDb = vi.fn(async () => []);
    const findExistingChecksums = vi.fn(() => undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => { });

    vi.doMock("../src/app/api/upload/parseUploadForm", () => ({ default: parseUploadForm }));
    vi.doMock("../src/app/api/upload/generateMediaDerivatives", () => ({ default: generateMediaDerivatives }));
    vi.doMock("../src/app/api/upload/addMediaToDb", () => ({ default: addMediaToDb }));
    vi.doMock("../src/lib/mediaChecksums", () => ({ findExistingChecksums }));

    const { POST } = await import("../src/app/api/upload/route");
    const req = new Request("http://localhost/api/upload", { method: "POST" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "Upload failed" });
    expect(generateMediaDerivatives).not.toHaveBeenCalled();
    expect(addMediaToDb).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });

  it("returns 500 when derivative generation throws", async () => {
    const fileData = new Map([["a", { filepath: "tmp-a", checksum: "abc" }]]);
    const parseUploadForm = vi.fn(async () => fileData);
    const generateMediaDerivatives = vi.fn(async () => {
      throw new Error("boom");
    });
    const addMediaToDb = vi.fn(async () => []);
    const findExistingChecksums = vi.fn(() => undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => { });

    vi.doMock("../src/app/api/upload/parseUploadForm", () => ({ default: parseUploadForm }));
    vi.doMock("../src/app/api/upload/generateMediaDerivatives", () => ({ default: generateMediaDerivatives }));
    vi.doMock("../src/app/api/upload/addMediaToDb", () => ({ default: addMediaToDb }));
    vi.doMock("../src/lib/mediaChecksums", () => ({ findExistingChecksums }));

    const { POST } = await import("../src/app/api/upload/route");
    const req = new Request("http://localhost/api/upload", { method: "POST" });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "Upload failed" });
    expect(addMediaToDb).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });
});
