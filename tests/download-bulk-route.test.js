import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const hoisted = vi.hoisted(() => ({
  rows: [],
}));

vi.mock("@/lib/db", () => ({
  default: {
    prepare: () => ({ all: () => hoisted.rows }),
  },
}));

function postForm(postIds) {
  const body = new FormData();
  body.set("postIds", postIds);
  return new Request("http://localhost/api/download/bulk", { method: "POST", body });
}

// The end-of-central-directory record closes every zip; its entry count is at offset 10.
function zipEntryCount(buffer) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  return buffer.readUInt16LE(eocd + 10);
}

describe("bulk download route", () => {
  let storageDir;

  beforeEach(() => {
    vi.resetModules();
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "shortlib-bulk-"));
    fs.mkdirSync(path.join(storageDir, "full", "2025", "01"), { recursive: true });
    fs.writeFileSync(path.join(storageDir, "full", "2025", "01", "a.jpg"), "first");
    fs.writeFileSync(path.join(storageDir, "full", "2025", "01", "b.jpg"), "second");
    vi.stubEnv("STORAGE_DIR", storageDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  it("streams a stored zip whose length matches Content-Length", async () => {
    hoisted.rows = [
      { id: 1, file_path: "2025/01/a.jpg", original_filename: "cat.jpg" },
      { id: 2, file_path: "2025/01/b.jpg", original_filename: "cat.jpg" },
    ];
    const { POST } = await import("../src/app/api/download/bulk/route");

    const res = await POST(postForm("1,2"));
    const body = Buffer.from(await res.arrayBuffer());

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe(String(body.length));
    expect(zipEntryCount(body)).toBe(2);
    expect(body.includes("cat.jpg")).toBe(true);
    expect(body.includes("cat (1).jpg")).toBe(true);
    expect(body.includes("second")).toBe(true);
  });

  it("skips files missing from disk and 404s when none are left", async () => {
    hoisted.rows = [{ id: 1, file_path: "2025/01/gone.jpg", original_filename: "" }];
    const { POST } = await import("../src/app/api/download/bulk/route");

    expect((await POST(postForm("1"))).status).toBe(404);
  });

  it("rejects a selection with no valid ids", async () => {
    const { POST } = await import("../src/app/api/download/bulk/route");

    expect((await POST(postForm("x,-1"))).status).toBe(400);
  });
});
