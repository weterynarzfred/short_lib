import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDb, destroyTempDb } from "./helpers/tempDb";

describe("child posts", () => {
  let db;
  let tempDir;
  let ids;
  let setPostChildren;
  let getPostsPage;

  beforeEach(async () => {
    vi.resetModules();
    ({ db, tempDir } = createTempDb());
    vi.doMock("@/lib/db", () => ({ default: db }));

    const insertMedia = db.prepare(`
      INSERT INTO media (file_path, created_at, variants, checksum) VALUES (?, ?, ?, ?)
    `);
    // Newest first by default, so a plain listing reads 6, 5, 4, 3, 2, 1.
    ids = [1, 2, 3, 4, 5, 6].map(n => Number(insertMedia.run(
      `2026/03/${n}.jpg`,
      n * 1000,
      JSON.stringify({ thumb: { width: 10, height: n } }),
      `sum-${n}`
    ).lastInsertRowid));

    ({ default: setPostChildren } = await import("../src/lib/postChildren"));
    ({ getPostsPage } = await import("../src/lib/listingQuery/getPosts"));
  });

  afterEach(() => {
    destroyTempDb({ db, tempDir });
  });

  const listIds = async (search, options) =>
    (await getPostsPage(search, options)).posts.map(post => post.id);

  it("lists a set with parent:, parent first and children in the given order", async () => {
    const [parent, a, b, c] = ids;
    setPostChildren(parent, [c, a, b]);

    expect(await listIds(`parent:${parent}`)).toEqual([parent, c, a, b]);
    expect(await listIds(`parent:${parent} order:date`)).toEqual([c, b, a, parent]);
  });

  it("returns each post's parent and children with thumbnails", async () => {
    const [parent, a] = ids;
    const { updates } = setPostChildren(parent, [a]);

    expect(updates).toEqual(expect.arrayContaining([
      { id: parent, parent_id: null, children: [{ id: a, file_path: "2026/03/2.jpg", thumb: { width: 10, height: 2 } }] },
      { id: a, parent_id: parent, children: [] },
    ]));

    const posts = (await getPostsPage(`parent:${parent}`)).posts;
    expect(posts[0].children).toEqual([{ id: a, file_path: "2026/03/2.jpg", thumb: { width: 10, height: 2 } }]);
    expect(posts[1].parent_id).toBe(parent);
  });

  it("hides children through a has:parent blacklist entry, unless the search asks", async () => {
    const [parent, a, b] = ids;
    setPostChildren(parent, [a, b]);
    const options = { blacklist: ["has:parent"] };

    expect(await listIds("", options)).toEqual([6, 5, 4, parent]);
    expect(await listIds("has:parent", options)).toEqual([b, a]);
    expect(await listIds("-has:parent", options)).toEqual([6, 5, 4, parent]);
    expect(await listIds(`parent:${parent}`, options)).toEqual([parent, a, b]);
    expect(await listIds("has:children", options)).toEqual([parent]);
  });

  it("asks before moving a child from another parent", () => {
    const [first, second, child] = ids;
    setPostChildren(first, [child]);

    const asked = setPostChildren(second, [child]);
    expect(asked).toEqual({ conflicts: [{ id: child, parentId: first }], updates: [] });
    expect(db.prepare("SELECT parent_id FROM media WHERE id = ?").get(child).parent_id).toBe(first);

    const moved = setPostChildren(second, [child], { reassign: true });
    expect(moved.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first, children: [] }),
      expect.objectContaining({ id: child, parent_id: second }),
    ]));
  });

  it("releases children left out of the new list", async () => {
    const [parent, a, b] = ids;
    setPostChildren(parent, [a, b]);
    const { updates } = setPostChildren(parent, [b]);

    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: a, parent_id: null }),
    ]));
    expect(await listIds(`parent:${parent}`)).toEqual([parent, b]);
  });

  it("keeps sets one level deep", () => {
    const [parent, child, grandchild] = ids;
    setPostChildren(parent, [child]);

    expect(() => setPostChildren(child, [grandchild])).toThrow(`post ${child} is a child of ${parent}`);
    expect(() => setPostChildren(grandchild, [parent])).toThrow(`post ${parent} has children of its own`);
    expect(() => setPostChildren(parent, [parent])).toThrow("a post cannot be its own child");
    expect(() => setPostChildren(parent, [999])).toThrow("post 999 does not exist");
  });

  it("frees the children when their parent is deleted", () => {
    const [parent, child] = ids;
    setPostChildren(parent, [child]);

    db.prepare("DELETE FROM media WHERE id = ?").run(parent);
    expect(db.prepare("SELECT parent_id FROM media WHERE id = ?").get(child).parent_id).toBeNull();
  });
});
