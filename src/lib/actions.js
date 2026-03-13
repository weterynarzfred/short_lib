"use server";

import { revalidatePath } from "next/cache";

import addTags, { parseTagString, removeTags } from "@/lib/addTags";
import db from "@/lib/db";
import deletePost from "@/lib/deletePost";
import clearDeletedStorage from "@/lib/clearDeletedStorage";
import { deleteTagById, updateTagById } from "@/lib/manageTag";
import {
  getTagTypeOrderSql,
  setBlacklistedTags,
  setMediaSettings,
  setTagTypeOrder,
} from "@/lib/userSettings";

function normalizePostIds(postIds) {
  return Array.isArray(postIds)
    ? [...new Set(postIds.map(Number).filter(Number.isInteger))]
    : [];
}

export async function deletePostAction(postId) {
  await deletePost(postId);
  revalidatePath("/listing");
}

export async function deletePostsBulkAction(postIds) {
  const ids = normalizePostIds(postIds);
  if (!ids.length) return;

  for (const postId of ids) await deletePost(postId);
  revalidatePath("/listing");
}

export async function clearDeletedStorageAction() {
  const result = clearDeletedStorage();
  revalidatePath("/");
  return result;
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
  const ids = normalizePostIds(postIds);

  for (const postId of ids) addTags(postId, tags, { replace: false });
  revalidatePath("/listing");
}

export async function editPostTagsBulkAction(postIds, rawTagString) {
  const ids = normalizePostIds(postIds);
  if (!ids.length) return;

  const tokens = String(rawTagString ?? "")
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);

  const addTokens = [];
  const removeTokens = [];

  for (const token of tokens) {
    if (token.startsWith("-") && token.length > 1) {
      removeTokens.push(token.slice(1));
      continue;
    }

    addTokens.push(token);
  }

  const tagsToAdd = parseTagString(addTokens.join(" "));
  const tagsToRemove = parseTagString(removeTokens.join(" "));

  for (const postId of ids) {
    if (tagsToRemove.length) removeTags(postId, tagsToRemove);
    if (tagsToAdd.length) addTags(postId, tagsToAdd, { replace: false });
  }

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

export async function updatePostOriginalFilenameAction(postId, originalFilename) {
  const safePostId = Number(postId);
  if (!Number.isInteger(safePostId) || safePostId <= 0)
    throw new Error("Invalid media id");

  const nextOriginalFilename = typeof originalFilename === "string" ? originalFilename : "";

  db.prepare(`
    UPDATE media
    SET original_filename = ?
    WHERE id = ?
  `).run(nextOriginalFilename, safePostId);

  revalidatePath("/listing");
}

export async function getPostTagValuesAction(postIds) {
  const ids = normalizePostIds(postIds);
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
      ${getTagTypeOrderSql()},
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

export async function updateTagTypeOrderAction(rawTagTypeOrder) {
  const tagTypeOrder = setTagTypeOrder(rawTagTypeOrder);

  revalidatePath("/listing");
  revalidatePath("/settings");

  return {
    tagTypeOrder,
    tagTypeOrderValue: tagTypeOrder.join(" "),
  };
}
