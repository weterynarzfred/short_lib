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
  setTagTypeColors: vi.fn(),
  setTagTypeOrder: vi.fn(),
  getTagTypeOrderSql: vi.fn(),
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
  setTagTypeColors: hoisted.setTagTypeColors,
  setTagTypeOrder: hoisted.setTagTypeOrder,
  getTagTypeOrderSql: hoisted.getTagTypeOrderSql,
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
    hoisted.setTagTypeColors.mockReset();
    hoisted.setTagTypeOrder.mockReset();
    hoisted.getTagTypeOrderSql.mockReset();
    hoisted.getTagTypeOrderSql.mockReturnValue("CASE WHEN 'general' THEN 0 ELSE 1 END");
  });

  it("updatePostNotesAction rejects invalid media id values", async () => {
    const { updatePostNotesAction } = await import("../src/lib/actions");

    await expect(updatePostNotesAction("abc", "notes")).rejects.toThrow("Invalid media id");
    expect(hoisted.dbPrepare).not.toHaveBeenCalled();
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });

  it("updatePostNotesAction writes sanitized notes without listing revalidation", async () => {
    const run = vi.fn();
    hoisted.dbPrepare.mockReturnValue({ run });

    const { updatePostNotesAction } = await import("../src/lib/actions");
    await updatePostNotesAction("7", null);

    expect(hoisted.dbPrepare).toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith("", 7);
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });

  it("updatePostOriginalFilenameAction rejects invalid media id values", async () => {
    const { updatePostOriginalFilenameAction } = await import("../src/lib/actions");

    await expect(updatePostOriginalFilenameAction("abc", "name.jpg"))
      .rejects
      .toThrow("Invalid media id");
    expect(hoisted.dbPrepare).not.toHaveBeenCalled();
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });

  it("updatePostOriginalFilenameAction writes sanitized filename without listing revalidation", async () => {
    const run = vi.fn();
    hoisted.dbPrepare.mockReturnValue({ run });

    const { updatePostOriginalFilenameAction } = await import("../src/lib/actions");
    await updatePostOriginalFilenameAction("7", null);

    expect(hoisted.dbPrepare).toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith("", 7);
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
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

  it("updatePostTagsAction replaces tags, normalizes output, and skips listing revalidation", async () => {
    hoisted.parseTagString.mockReturnValue([{ name: "cat" }, { name: "bob", type: "creator" }]);
    const all = vi.fn(() => ([
      { mediaId: 7, id: 101, name: "  cat  ", type: "general" },
      { mediaId: 7, id: 102, name: "bob", type: " creator " },
      { mediaId: 7, id: 103, name: "   ", type: "meta" },
    ]));
    hoisted.dbPrepare.mockReturnValue({ all });

    const { updatePostTagsAction } = await import("../src/lib/actions");
    const result = await updatePostTagsAction("7", "cat creator:bob");

    expect(hoisted.parseTagString).toHaveBeenCalledWith("cat creator:bob");
    expect(hoisted.addTags).toHaveBeenCalledWith(
      7,
      [{ name: "cat" }, { name: "bob", type: "creator" }],
      { replace: true }
    );
    expect(all).toHaveBeenCalledWith(7);
    expect(result).toEqual({
      tags: [
        { id: 101, name: "cat", type: "general" },
        { id: 102, name: "bob", type: "creator" },
      ],
    });
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });

  it("editPostTagsBulkAction splits add/remove tokens, applies both, and skips listing revalidation", async () => {
    hoisted.parseTagString.mockImplementation(raw => {
      if (raw === "cat creator:bob") return [{ name: "cat" }, { name: "bob", type: "creator" }];
      if (raw === "dog meta:video") return [{ name: "dog" }, { name: "video", type: "meta" }];
      return [];
    });
    const all = vi.fn(() => ([
      { mediaId: 1, id: 11, name: "cat", type: "general" },
      { mediaId: 1, id: 12, name: "bob", type: "creator" },
      { mediaId: 2, id: 21, name: "cat", type: "general" },
      { mediaId: 2, id: 22, name: "bob", type: "creator" },
    ]));
    hoisted.dbPrepare.mockReturnValue({ all });

    const { editPostTagsBulkAction } = await import("../src/lib/actions");
    const result = await editPostTagsBulkAction([1, "2", "bad", 2], "cat -dog creator:bob -meta:video");

    expect(hoisted.parseTagString).toHaveBeenNthCalledWith(1, "cat creator:bob");
    expect(hoisted.parseTagString).toHaveBeenNthCalledWith(2, "dog meta:video");
    expect(hoisted.removeTags).toHaveBeenCalledTimes(2);
    expect(hoisted.removeTags).toHaveBeenNthCalledWith(1, 1, [{ name: "dog" }, { name: "video", type: "meta" }]);
    expect(hoisted.removeTags).toHaveBeenNthCalledWith(2, 2, [{ name: "dog" }, { name: "video", type: "meta" }]);
    expect(hoisted.addTags).toHaveBeenCalledTimes(2);
    expect(hoisted.addTags).toHaveBeenNthCalledWith(1, 1, [{ name: "cat" }, { name: "bob", type: "creator" }], { replace: false });
    expect(hoisted.addTags).toHaveBeenNthCalledWith(2, 2, [{ name: "cat" }, { name: "bob", type: "creator" }], { replace: false });
    expect(all).toHaveBeenCalledWith(1, 2);
    expect(result).toEqual([
      {
        mediaId: 1,
        tags: [
          { id: 11, name: "cat", type: "general" },
          { id: 12, name: "bob", type: "creator" },
        ],
      },
      {
        mediaId: 2,
        tags: [
          { id: 21, name: "cat", type: "general" },
          { id: 22, name: "bob", type: "creator" },
        ],
      },
    ]);
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });

  it("getPostTagValuesAction de-duplicates ids and normalizes to bare names", async () => {
    const all = vi.fn(() => ([
      { mediaId: 2, id: 21, name: "nsfw", type: "meta" },
      { mediaId: 2, id: 22, name: "cat", type: "general" },
      { mediaId: 3, id: 31, name: "artist_name", type: "creator" },
      { mediaId: 3, id: 32, name: "  ", type: "meta" },
    ]));
    hoisted.dbPrepare.mockReturnValue({ all });

    const { getPostTagValuesAction } = await import("../src/lib/actions");
    const result = await getPostTagValuesAction([2, "2", 3, "bad"]);

    expect(all).toHaveBeenCalledWith(2, 3);
    expect(result).toEqual([
      {
        mediaId: 2,
        tags: [
          { id: 21, name: "nsfw", type: "meta" },
          { id: 22, name: "cat", type: "general" },
        ],
        tagsValue: "nsfw cat",
      },
      {
        mediaId: 3,
        tags: [
          { id: 31, name: "artist_name", type: "creator" },
        ],
        tagsValue: "artist_name",
      },
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

  it("updateTagTypeOrderAction stores order and revalidates listing/settings", async () => {
    hoisted.setTagTypeOrder.mockReturnValue(["meta", "creator", "general"]);

    const { updateTagTypeOrderAction } = await import("../src/lib/actions");
    const result = await updateTagTypeOrderAction("meta creator general");

    expect(hoisted.setTagTypeOrder).toHaveBeenCalledWith("meta creator general");
    expect(hoisted.setTagTypeColors).not.toHaveBeenCalled();
    expect(result).toEqual({
      tagTypeOrder: ["meta", "creator", "general"],
      tagTypeOrderValue: "meta creator general",
    });
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/listing");
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/settings");
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/tags");
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/upload");
  });

  it("updateTagTypeOrderAction stores optional colors payload", async () => {
    hoisted.setTagTypeOrder.mockReturnValue(["meta", "creator", "general"]);
    hoisted.setTagTypeColors.mockReturnValue({
      meta: "#FF0000",
      creator: "#00FF00",
      general: "#EEEEEE",
    });

    const { updateTagTypeOrderAction } = await import("../src/lib/actions");
    const result = await updateTagTypeOrderAction("meta creator general", {
      meta: "#ff0000",
      creator: "#00ff00",
    });

    expect(hoisted.setTagTypeOrder).toHaveBeenCalledWith("meta creator general");
    expect(hoisted.setTagTypeColors).toHaveBeenCalledWith({
      meta: "#ff0000",
      creator: "#00ff00",
    });
    expect(result).toEqual({
      tagTypeOrder: ["meta", "creator", "general"],
      tagTypeOrderValue: "meta creator general",
      tagTypeColors: {
        meta: "#FF0000",
        creator: "#00FF00",
        general: "#EEEEEE",
      },
    });
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/listing");
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/settings");
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/tags");
    expect(hoisted.revalidatePath).toHaveBeenCalledWith("/upload");
  });
});
