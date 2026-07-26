import path from "path";
import { describe, expect, it } from "vitest";

import resolveDbPath from "@/lib/dbPath";

describe("db path resolution", () => {
  it("stores shortlib.db in STORAGE_DIR when configured", () => {
    expect(resolveDbPath("./storage"))
      .toBe(path.join(path.resolve("./storage"), "shortlib.db"));
  });

  it("trims surrounding whitespace from STORAGE_DIR", () => {
    expect(resolveDbPath("  ./storage  "))
      .toBe(path.join(path.resolve("./storage"), "shortlib.db"));
  });

  it("falls back to project root when STORAGE_DIR is not configured", () => {
    const expected = path.join(process.cwd(), "shortlib.db");

    expect(resolveDbPath("")).toBe(expected);
    expect(resolveDbPath(undefined)).toBe(expected);
  });
});
