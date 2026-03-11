import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";

const fsHoisted = vi.hoisted(() => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  createReadStream: vi.fn(),
}));

const mimeHoisted = vi.hoisted(() => ({
  lookup: vi.fn(),
}));

vi.mock("fs", () => ({
  default: fsHoisted,
}));

vi.mock("mime-types", () => ({
  default: mimeHoisted,
}));

function emptyStream() {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

const CHECKSUM = "a".repeat(64);

describe("media route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    fsHoisted.existsSync.mockReset();
    fsHoisted.statSync.mockReset();
    fsHoisted.createReadStream.mockReset();
    mimeHoisted.lookup.mockReset();

    vi.stubEnv("STORAGE_DIR", "C:\\storage");
    fsHoisted.existsSync.mockReturnValue(true);
    fsHoisted.statSync.mockReturnValue({ size: 1000 });
    fsHoisted.createReadStream.mockReturnValue(emptyStream());
    mimeHoisted.lookup.mockReturnValue("video/mp4");
  });

  it("returns 400 for invalid date params", async () => {
    const { GET } = await import("../src/app/api/media/[year]/[month]/[file]/route");
    const req = new Request("http://localhost/api/media/2026/99/file.mp4");

    const res = await GET(req, {
      params: Promise.resolve({ year: "20a6", month: "03", file: "a.mp4" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 400 for path traversal-like file params", async () => {
    const { GET } = await import("../src/app/api/media/[year]/[month]/[file]/route");
    const req = new Request("http://localhost/api/media/2026/03/..%2Fsecret");

    const res = await GET(req, {
      params: Promise.resolve({ year: "2026", month: "03", file: "../secret.txt" }),
    });

    expect(res.status).toBe(400);
  });

  it("returns 404 when file does not exist", async () => {
    fsHoisted.existsSync.mockReturnValue(false);
    const { GET } = await import("../src/app/api/media/[year]/[month]/[file]/route");
    const req = new Request("http://localhost/api/media/2026/03/file.mp4");

    const res = await GET(req, {
      params: Promise.resolve({
        year: "2026",
        month: "03",
        file: `${CHECKSUM}.mp4`,
      }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 200 and full-file headers when no range is requested", async () => {
    const { GET } = await import("../src/app/api/media/[year]/[month]/[file]/route");
    const req = new Request("http://localhost/api/media/2026/03/file.mp4");

    const res = await GET(req, {
      params: Promise.resolve({
        year: "2026",
        month: "03",
        file: `${CHECKSUM}.mp4`,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect(res.headers.get("Content-Length")).toBe("1000");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(fsHoisted.createReadStream).toHaveBeenCalledWith(
      path.join("C:\\storage", "full", "2026", "03", `${CHECKSUM}.mp4`)
    );
  });

  it("serves thumbnail variants when size=thumb", async () => {
    const { GET } = await import("../src/app/api/media/[year]/[month]/[file]/route");
    const req = new Request("http://localhost/api/media/2026/03/file.mp4?size=thumb");

    const res = await GET(req, {
      params: Promise.resolve({
        year: "2026",
        month: "03",
        file: `${CHECKSUM}.mp4`,
      }),
    });

    expect(res.status).toBe(200);
    expect(fsHoisted.createReadStream).toHaveBeenCalledWith(
      path.join("C:\\storage", "thumbs", "2026", "03", `${CHECKSUM}.jpg`)
    );
  });

  it("serves preview variants when size=prev", async () => {
    const { GET } = await import("../src/app/api/media/[year]/[month]/[file]/route");
    const req = new Request("http://localhost/api/media/2026/03/file.mp4?size=prev");

    const res = await GET(req, {
      params: Promise.resolve({
        year: "2026",
        month: "03",
        file: `${CHECKSUM}.mp4`,
      }),
    });

    expect(res.status).toBe(200);
    expect(fsHoisted.createReadStream).toHaveBeenCalledWith(
      path.join("C:\\storage", "prevs", "2026", "03", `${CHECKSUM}.jpg`)
    );
  });

  it("returns 206 for valid byte range requests", async () => {
    const { GET } = await import("../src/app/api/media/[year]/[month]/[file]/route");
    const req = new Request("http://localhost/api/media/2026/03/file.mp4", {
      headers: { range: "bytes=0-9" },
    });

    const res = await GET(req, {
      params: Promise.resolve({
        year: "2026",
        month: "03",
        file: `${CHECKSUM}.mp4`,
      }),
    });

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-9/1000");
  });

  it("returns 206 for suffix byte ranges", async () => {
    const { GET } = await import("../src/app/api/media/[year]/[month]/[file]/route");
    const req = new Request("http://localhost/api/media/2026/03/file.mp4", {
      headers: { range: "bytes=-10" },
    });

    const res = await GET(req, {
      params: Promise.resolve({
        year: "2026",
        month: "03",
        file: `${CHECKSUM}.mp4`,
      }),
    });

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 990-999/1000");
    expect(fsHoisted.createReadStream).toHaveBeenCalledWith(
      path.join("C:\\storage", "full", "2026", "03", `${CHECKSUM}.mp4`),
      { start: 990, end: 999 }
    );
  });

  it("returns 206 for open-ended byte ranges", async () => {
    const { GET } = await import("../src/app/api/media/[year]/[month]/[file]/route");
    const req = new Request("http://localhost/api/media/2026/03/file.mp4", {
      headers: { range: "bytes=10-" },
    });

    const res = await GET(req, {
      params: Promise.resolve({
        year: "2026",
        month: "03",
        file: `${CHECKSUM}.mp4`,
      }),
    });

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 10-999/1000");
    expect(fsHoisted.createReadStream).toHaveBeenCalledWith(
      path.join("C:\\storage", "full", "2026", "03", `${CHECKSUM}.mp4`),
      { start: 10, end: 999 }
    );
  });

  it("returns 416 for malformed range requests", async () => {
    const { GET } = await import("../src/app/api/media/[year]/[month]/[file]/route");
    const req = new Request("http://localhost/api/media/2026/03/file.mp4", {
      headers: { range: "bytes=abc-def" },
    });

    const res = await GET(req, {
      params: Promise.resolve({
        year: "2026",
        month: "03",
        file: `${CHECKSUM}.mp4`,
      }),
    });

    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */1000");
  });
});
