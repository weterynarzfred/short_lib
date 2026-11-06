import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import resolveStoragePath from "../src/lib/resolveStoragePath";

const STORAGE = path.resolve("storage-under-test");

describe("resolveStoragePath", () => {
  beforeEach(() => vi.stubEnv("STORAGE_DIR", STORAGE));
  afterEach(() => vi.unstubAllEnvs());

  it("resolves a file inside the folder", () => {
    expect(resolveStoragePath("full", "2025/01/a.jpg"))
      .toBe(path.join(STORAGE, "full", "2025", "01", "a.jpg"));
    expect(resolveStoragePath("thumbs", "2025", "01", "a.jpg"))
      .toBe(path.join(STORAGE, "thumbs", "2025", "01", "a.jpg"));
  });

  it("refuses anything that leaves the folder", () => {
    expect(resolveStoragePath("full", "../shortlib.db")).toBeNull();
    expect(resolveStoragePath("full", "2025/../../thumbs/a.jpg")).toBeNull();
    expect(resolveStoragePath("full", path.resolve("/etc/passwd"))).toBeNull();
    expect(resolveStoragePath("full", "..")).toBeNull();
  });

  it("refuses the folder itself", () => {
    expect(resolveStoragePath("full", "")).toBeNull();
    expect(resolveStoragePath("full", "2025/..")).toBeNull();
  });

  // A plain startsWith("..") check got this wrong: the name begins with two dots but the
  // file is inside the folder.
  it("allows names that merely start with two dots", () => {
    expect(resolveStoragePath("full", "..hidden.jpg")).toBe(path.join(STORAGE, "full", "..hidden.jpg"));
  });
});
