import { beforeEach, describe, expect, it, vi } from "vitest";

describe("upload route", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns uploaded media metadata from addMediaToDb", async () => {
    const fileData = new Map([["a", { filepath: "tmp-a" }]]);
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
    const findExistingChecksums = vi.fn(() => []);

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
    expect(findExistingChecksums).toHaveBeenCalledWith([]);
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
});
