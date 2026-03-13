import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setupDbModule() {
  const pragma = vi.fn();
  const exec = vi.fn();
  const mkdirSync = vi.fn();
  const constructor = vi.fn(function DatabaseMock() {
    this.pragma = pragma;
    this.exec = exec;
  });

  vi.doMock("better-sqlite3", () => ({ default: constructor }));
  vi.doMock("fs", () => ({ default: { mkdirSync } }));

  return { constructor, mkdirSync };
}

describe("db path resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stores shortlib.db in STORAGE_DIR when configured", async () => {
    vi.stubEnv("STORAGE_DIR", "./storage");
    const { constructor, mkdirSync } = setupDbModule();

    await import("../src/lib/db");

    const storageRoot = path.resolve("./storage");
    expect(mkdirSync).toHaveBeenCalledWith(storageRoot, { recursive: true });
    expect(constructor).toHaveBeenCalledWith(path.join(storageRoot, "shortlib.db"));
  });

  it("falls back to project root when STORAGE_DIR is not configured", async () => {
    vi.stubEnv("STORAGE_DIR", "");
    const { constructor, mkdirSync } = setupDbModule();

    await import("../src/lib/db");

    const projectRoot = process.cwd();
    expect(mkdirSync).toHaveBeenCalledWith(projectRoot, { recursive: true });
    expect(constructor).toHaveBeenCalledWith(path.join(projectRoot, "shortlib.db"));
  });
});
