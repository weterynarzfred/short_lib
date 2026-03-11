import { beforeEach, describe, expect, it, vi } from "vitest";

describe("mediaChecksums", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns undefined and skips DB query when checksum input is empty", async () => {
    const db = { prepare: vi.fn() };
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { findExistingChecksums } = await import("../src/lib/mediaChecksums");
    const found = findExistingChecksums([null, "", 123]);

    expect(found).toBeUndefined();
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it("de-duplicates checksum parameters and returns first valid DB match", async () => {
    const all = vi.fn(() => [
      { id: 1, checksum: "" },
      { id: 2, checksum: "abc" },
      { id: 3, checksum: "def" },
    ]);
    const db = {
      prepare: vi.fn(() => ({ all })),
    };
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { findExistingChecksums } = await import("../src/lib/mediaChecksums");
    const found = findExistingChecksums(["abc", "abc", null, "def", ""]);

    expect(db.prepare).toHaveBeenCalledTimes(1);
    expect(db.prepare.mock.calls[0][0]).toContain("WHERE checksum IN (?,?)");
    expect(all).toHaveBeenCalledWith("abc", "def");
    expect(found).toEqual({ id: 2, checksum: "abc" });
  });

  it("returns undefined when query rows contain no usable checksums", async () => {
    const all = vi.fn(() => [
      { id: 1, checksum: null },
      { id: 2, checksum: "" },
    ]);
    const db = {
      prepare: vi.fn(() => ({ all })),
    };
    vi.doMock("@/lib/db", () => ({ default: db }));

    const { findExistingChecksums } = await import("../src/lib/mediaChecksums");
    const found = findExistingChecksums(["abc"]);

    expect(found).toBeUndefined();
  });
});
