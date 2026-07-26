import { describe, expect, it } from "vitest";

import { isUploadSettled } from "@/app/upload/lib/useUploadQueue";

describe("isUploadSettled", () => {
  it("treats finished and failed uploads as settled", () => {
    expect(isUploadSettled({ done: true, failed: false })).toBe(true);
    expect(isUploadSettled({ done: false, failed: true })).toBe(true);
  });

  // The whole point of the reset behaviour: a transfer in progress is never dropped.
  it("does not treat a transfer in progress as settled", () => {
    expect(isUploadSettled({ done: false, failed: false, progress: 0 })).toBe(false);
    expect(isUploadSettled({ done: false, failed: false, progress: 42 })).toBe(false);
  });

  it("survives missing input", () => {
    expect(isUploadSettled(undefined)).toBe(false);
    expect(isUploadSettled(null)).toBe(false);
    expect(isUploadSettled({})).toBe(false);
  });

  it("keeps exactly the in-flight entries when filtering a queue", () => {
    const uploads = [
      { id: "a", done: true, failed: false },
      { id: "b", done: false, failed: true },
      { id: "c", done: false, failed: false, progress: 42 },
      { id: "d", done: false, failed: false, progress: 0 },
    ];

    expect(uploads.filter(upload => !isUploadSettled(upload)).map(u => u.id))
      .toEqual(["c", "d"]);
  });
});
