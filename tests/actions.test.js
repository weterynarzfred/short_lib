import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  addTags: vi.fn(),
  removeTags: vi.fn(),
  parseTagString: vi.fn(),
  dbPrepare: vi.fn(),
  deletePost: vi.fn(),
  clearDeletedStorage: vi.fn(),
  updateTagById: vi.fn(),
  deleteTagById: vi.fn(),
  setBlacklistedTags: vi.fn(),
  setMediaSettings: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: hoisted.revalidatePath,
}));

vi.mock("@/lib/addTags", () => ({
  default: hoisted.addTags,
  removeTags: hoisted.removeTags,
  parseTagString: hoisted.parseTagString,
}));

vi.mock("@/lib/db", () => ({
  default: {
    prepare: hoisted.dbPrepare,
  },
}));

vi.mock("@/lib/deletePost", () => ({
  default: hoisted.deletePost,
}));

vi.mock("@/lib/clearDeletedStorage", () => ({
  default: hoisted.clearDeletedStorage,
}));

vi.mock("@/lib/manageTag", () => ({
  updateTagById: hoisted.updateTagById,
  deleteTagById: hoisted.deleteTagById,
}));

vi.mock("@/lib/userSettings", () => ({
  setBlacklistedTags: hoisted.setBlacklistedTags,
  setMediaSettings: hoisted.setMediaSettings,
}));

describe("server actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();

    hoisted.revalidatePath.mockReset();
    hoisted.addTags.mockReset();
    hoisted.removeTags.mockReset();
    hoisted.parseTagString.mockReset();
    hoisted.dbPrepare.mockReset();
    hoisted.deletePost.mockReset();
    hoisted.clearDeletedStorage.mockReset();
    hoisted.updateTagById.mockReset();
    hoisted.deleteTagById.mockReset();
    hoisted.setBlacklistedTags.mockReset();
    hoisted.setMediaSettings.mockReset();
  });

  it("updatePostNotesAction rejects invalid media id values", async () => {
    const { updatePostNotesAction } = await import("../src/lib/actions");

    await expect(updatePostNotesAction("abc", "notes")).rejects.toThrow("Invalid media id");
    expect(hoisted.dbPrepare).not.toHaveBeenCalled();
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });

  it("updatePostNotesAction writes sanitized notes and revalidates listing", async () => {
    const run = vi.fn();
    hoisted.dbPrepare.mockReturnValue({ run });

    const { updatePostNotesAction } = await import("../src/lib/actions");
    await updatePostNotesAction("7", null);

    expect(hoisted.dbPrepare).toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith("", 7);
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/listing");
  });

  it("deletePostsBulkAction deletes only integer ids and revalidates listing", async () => {
    const { deletePostsBulkAction } = await import("../src/lib/actions");
    await deletePostsBulkAction(["1", "nope", 2, "2", 2.5]);

    expect(hoisted.deletePost).toHaveBeenCalledTimes(2);
    expect(hoisted.deletePost).toHaveBeenNthCalledWith(1, 1);
    expect(hoisted.deletePost).toHaveBeenNthCalledWith(2, 2);
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/listing");
  });

  it("clearDeletedStorageAction clears deleted storage and revalidates home", async () => {
    hoisted.clearDeletedStorage.mockReturnValue({
      removedFiles: 4,
      removedBytes: 8192,
    });

    const { clearDeletedStorageAction } = await import("../src/lib/actions");
    const result = await clearDeletedStorageAction();

    expect(result).toEqual({ removedFiles: 4, removedBytes: 8192 });
    expect(hoisted.clearDeletedStorage).toHaveBeenCalledTimes(1);
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("addPostTagsBulkAction applies tags only to integer post ids", async () => {
    hoisted.parseTagString.mockReturnValue([{ name: "cat" }]);

    const { addPostTagsBulkAction } = await import("../src/lib/actions");
    await addPostTagsBulkAction(["1", "2.5", "x", 3], "cat");

    expect(hoisted.parseTagString).toHaveBeenCalledWith("cat");
    expect(hoisted.addTags).toHaveBeenCalledTimes(2);
    expect(hoisted.addTags).toHaveBeenNthCalledWith(1, 1, [{ name: "cat" }], { replace: false });
    expect(hoisted.addTags).toHaveBeenNthCalledWith(2, 3, [{ name: "cat" }], { replace: false });
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/listing");
  });

  it("editPostTagsBulkAction splits add/remove tokens and applies both", async () => {
    hoisted.parseTagString.mockImplementation(raw => {
      if (raw === "cat creator:bob") return [{ name: "cat" }, { name: "bob", type: "creator" }];
      if (raw === "dog meta:video") return [{ name: "dog" }, { name: "video", type: "meta" }];
      return [];
    });

    const { editPostTagsBulkAction } = await import("../src/lib/actions");
    await editPostTagsBulkAction([1, "2", "bad", 2], "cat -dog creator:bob -meta:video");

    expect(hoisted.parseTagString).toHaveBeenNthCalledWith(1, "cat creator:bob");
    expect(hoisted.parseTagString).toHaveBeenNthCalledWith(2, "dog meta:video");
    expect(hoisted.removeTags).toHaveBeenCalledTimes(2);
    expect(hoisted.removeTags).toHaveBeenNthCalledWith(1, 1, [{ name: "dog" }, { name: "video", type: "meta" }]);
    expect(hoisted.removeTags).toHaveBeenNthCalledWith(2, 2, [{ name: "dog" }, { name: "video", type: "meta" }]);
    expect(hoisted.addTags).toHaveBeenCalledTimes(2);
    expect(hoisted.addTags).toHaveBeenNthCalledWith(1, 1, [{ name: "cat" }, { name: "bob", type: "creator" }], { replace: false });
    expect(hoisted.addTags).toHaveBeenNthCalledWith(2, 2, [{ name: "cat" }, { name: "bob", type: "creator" }], { replace: false });
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/listing");
  });

  it("getPostTagValuesAction de-duplicates ids and formats typed tags", async () => {
    const all = vi.fn(() => ([
      { mediaId: 2, name: "nsfw", type: "meta" },
      { mediaId: 2, name: "cat", type: "general" },
      { mediaId: 3, name: "artist_name", type: "creator" },
      { mediaId: 3, name: "  ", type: "meta" },
    ]));
    hoisted.dbPrepare.mockReturnValue({ all });

    const { getPostTagValuesAction } = await import("../src/lib/actions");
    const result = await getPostTagValuesAction([2, "2", 3, "bad"]);

    expect(all).toHaveBeenCalledWith(2, 3);
    expect(result).toEqual([
      { mediaId: 2, tagsValue: "meta:nsfw cat" },
      { mediaId: 3, tagsValue: "creator:artist_name" },
    ]);
  });

  it("updateTagAction revalidates tags and listing and returns manager result", async () => {
    hoisted.updateTagById.mockReturnValue({ mode: "updated", id: 5 });

    const { updateTagAction } = await import("../src/lib/actions");
    const result = await updateTagAction(5, { name: "cat", type: "meta" });

    expect(result).toEqual({ mode: "updated", id: 5 });
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/tags");
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/listing");
  });

  it("deleteTagAction wraps deletion result and revalidates tags and listing", async () => {
    hoisted.deleteTagById.mockReturnValue(true);

    const { deleteTagAction } = await import("../src/lib/actions");
    const result = await deleteTagAction(7);

    expect(result).toEqual({ deleted: true });
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/tags");
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/listing");
  });
});
