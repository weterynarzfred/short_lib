"use server";

import { revalidatePath } from "next/cache";

import addTags, { parseTagString } from "@/lib/addTags";
import db from "@/lib/db";
import deletePost from "@/lib/deletePost";
import { deleteTagById, updateTagById } from "@/lib/manageTag";
import { setBlacklistedTags, setMediaSettings } from "@/lib/userSettings";
import { TAG_ORDER_SQL } from "@/app/listing/lib/buildQuery";

export async function deletePostAction(postId) {
  await deletePost(postId);
  revalidatePath("/listing");
}

export async function updatePostTagsAction(postId, rawTagString) {
  const tags = parseTagString(rawTagString);
  addTags(postId, tags, { replace: true });
  revalidatePath("/listing");
}

export async function addPostTagsAction(postId, rawTagString) {
  const tags = parseTagString(rawTagString);
  addTags(postId, tags, { replace: false });
  revalidatePath("/listing");
}

export async function addPostTagsBulkAction(postIds, rawTagString) {
  const tags = parseTagString(rawTagString);
  const ids = Array.isArray(postIds)
    ? postIds
      .map(Number)
      .filter(Number.isInteger)
    : [];

  for (const postId of ids) addTags(postId, tags, { replace: false });
  revalidatePath("/listing");
}

export async function updatePostNotesAction(postId, notesMd) {
  const safePostId = Number(postId);
  if (!Number.isInteger(safePostId) || safePostId <= 0)
    throw new Error("Invalid media id");

  const nextNotes = typeof notesMd === "string" ? notesMd : "";

  db.prepare(`
    UPDATE media
    SET notes_md = ?
    WHERE id = ?
  `).run(nextNotes, safePostId);

  revalidatePath("/listing");
}

export async function getPostTagValuesAction(postIds) {
  const ids = Array.isArray(postIds)
    ? [...new Set(postIds.map(Number).filter(Number.isInteger))]
    : [];
  if (!ids.length) return [];

  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT
      mt.media_id AS mediaId,
      t.name AS name,
      t.type AS type
    FROM media_tags mt
    JOIN tags t ON t.id = mt.tag_id
    WHERE mt.media_id IN (${placeholders})
    ORDER BY
      mt.media_id,
      ${TAG_ORDER_SQL},
      t.name COLLATE NOCASE
  `).all(...ids);

  const byMediaId = new Map(ids.map(id => [id, []]));
  for (const row of rows) {
    const type = typeof row.type === "string" ? row.type.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!name) continue;

    byMediaId.get(row.mediaId)?.push(
      type && type !== "general" ? `${type}:${name}` : name
    );
  }

  return ids.map(mediaId => ({
    mediaId,
    tagsValue: byMediaId.get(mediaId)?.join(" ") ?? "",
  }));
}

export async function updateTagAction(tagId, nextTagData) {
  const result = updateTagById(tagId, nextTagData);
  revalidatePath("/tags");
  revalidatePath("/listing");
  return result;
}

export async function deleteTagAction(tagId) {
  const deleted = deleteTagById(tagId);
  revalidatePath("/tags");
  revalidatePath("/listing");
  return { deleted };
}

export async function updateMediaSettingsAction(partialSettings) {
  const media = setMediaSettings(partialSettings);
  revalidatePath("/listing");
  return media;
}

export async function updateBlacklistedTagsAction(rawTagString) {
  const tags = setBlacklistedTags(rawTagString);

  revalidatePath("/listing");

  return {
    tags,
    tagsValue: tags.join(" "),
  };
}
