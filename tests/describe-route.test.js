import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDb, destroyTempDb } from "./helpers/tempDb";

const hoisted = vi.hoisted(() => ({ describeImage: vi.fn() }));

vi.mock("@/lib/describeImage", () => ({ default: hoisted.describeImage }));

describe("describe route", () => {
  let db;
  let tempDir;
  let storageDir;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    hoisted.describeImage.mockReset();
    ({ db, tempDir } = createTempDb("short-lib-describe-"));

    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "short-lib-describe-storage-"));
    vi.stubEnv("STORAGE_DIR", storageDir);
    vi.doMock("@/lib/db", () => ({ default: db }));
  });

  afterEach(() => {
    destroyTempDb({ db, tempDir });
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  function addMedia(mimeType, { withFile = true } = {}) {
    const relativePath = `2026/03/${mimeType.replace("/", "-")}.bin`;
    if (withFile) {
      const filePath = path.join(storageDir, "full", relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, "x");
    }

    return db.prepare(`
      INSERT INTO media (file_path, created_at, mime_type) VALUES (?, ?, ?)
    `).run(relativePath, Date.now(), mimeType).lastInsertRowid;
  }

  async function post(body) {
    const { POST } = await import("@/app/api/describe/route");
    const request = new Request("http://localhost/api/describe", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const response = await POST(request);

    return { status: response.status, body: await response.json() };
  }

  it("describes an image with the configured prompt", async () => {
    hoisted.describeImage.mockResolvedValue("a cat, sitting");
    const id = addMedia("image/jpeg");

    const { status, body } = await post({ id });

    expect(status).toBe(200);
    expect(body).toEqual({ text: "a cat, sitting" });
    // The prompt is a setting, so it has to be read per request rather than baked in.
    expect(hoisted.describeImage.mock.calls[0][1]).toContain("searchable media library");
  });

  it("refuses anything that is not an image", async () => {
    const { status, body } = await post({ id: addMedia("video/mp4") });

    expect(status).toBe(400);
    expect(body.error).toBe("Only images can be described");
    expect(hoisted.describeImage).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed id, and an unknown post", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ id: "12" })).status).toBe(400);
    expect((await post({ id: 4321 })).status).toBe(404);
  });

  it("reports a file that is recorded but gone", async () => {
    const { status, body } = await post({ id: addMedia("image/png", { withFile: false }) });

    expect(status).toBe(404);
    expect(body.error).toBe("The file is missing from storage");
  });

  // The common failure by far: the manager could not get the model up in time.
  it("explains an unreachable model rather than leaking the error", async () => {
    const failure = new Error("fetch failed");
    failure.cause = { code: "ECONNREFUSED" };
    hoisted.describeImage.mockRejectedValue(failure);

    const { status, body } = await post({ id: addMedia("image/jpeg") });

    expect(status).toBe(502);
    expect(body.error).toContain("did not respond");
  });

  it("passes a model-side failure through so it can be acted on", async () => {
    hoisted.describeImage.mockRejectedValue(new Error("the model returned nothing"));

    const { body } = await post({ id: addMedia("image/jpeg") });

    expect(body.error).toBe("Describing failed: the model returned nothing");
  });
});
