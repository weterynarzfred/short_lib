"use server";

import { revalidatePath } from "next/cache";

import addTags, { parseTagString, removeTags } from "@/lib/addTags";
import db from "@/lib/db";
import deletePost from "@/lib/deletePost";
import clearDeletedStorage from "@/lib/clearDeletedStorage";
import {
  deleteTagById,
  updateTagById,
  updateTagDescription,
  addTagAlias,
  removeTagAlias,
  addTagImplicationByName,
  removeTagImplication,
} from "@/lib/manageTag";
import {
  getTagTypeOrderSql,
  setBlacklistedTags,
  setMediaSettings,
  setTagTypeColors,
  setTagTypeOrder,
} from "@/lib/userSettings";
import { markMediaNotesIndexDirty } from "@/lib/search";

function normalizePostIds(postIds) {
  return Array.isArray(postIds)
    ? [...new Set(postIds.map(Number).filter(id => Number.isInteger(id) && id > 0))]
    : [];
}

function normalizePostId(postId) {
  const safePostId = Number(postId);
  if (!Number.isInteger(safePostId) || safePostId <= 0)
    throw new Error("Invalid media id");

  return safePostId;
}

function normalizeTagRow(row) {
  const name = typeof row?.name === "string" ? row.name.trim() : "";
  if (!name) return null;

  return {
    id: row.id,
    name,
    type: typeof row?.type === "string" ? row.type.trim() : "",
  };
}

function getTagsByMediaIds(postIds) {
  const ids = normalizePostIds(postIds);
  if (!ids.length) return new Map();

  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT
      mt.media_id AS mediaId,
      t.id AS id,
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

  const tagsByMediaId = new Map(ids.map(id => [id, []]));
  for (const row of rows) {
    const tag = normalizeTagRow(row);
    if (!tag) continue;

    tagsByMediaId.get(row.mediaId)?.push(tag);
  }

  return tagsByMediaId;
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
  const safePostId = normalizePostId(postId);

  const tags = parseTagString(rawTagString);
  addTags(safePostId, tags, { replace: true });
  const tagsByMediaId = getTagsByMediaIds([safePostId]);

  return {
    tags: tagsByMediaId.get(safePostId) ?? [],
  };
}

export async function addPostTagsAction(postId, rawTagString) {
  const safePostId = normalizePostId(postId);
  const tags = parseTagString(rawTagString);
  addTags(safePostId, tags, { replace: false });
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
  if (!ids.length) return [];

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
  const tagsByMediaId = getTagsByMediaIds(ids);

  return ids.map(mediaId => ({
    mediaId,
    tags: tagsByMediaId.get(mediaId) ?? [],
  }));
}

export async function updatePostNotesAction(postId, notesMd) {
  const safePostId = normalizePostId(postId);

  const nextNotes = typeof notesMd === "string" ? notesMd : "";

  db.prepare(`
    UPDATE media
    SET notes_md = ?
    WHERE id = ?
  `).run(nextNotes, safePostId);
  markMediaNotesIndexDirty();

  return { notes_md: nextNotes };
}

export async function updatePostOriginalFilenameAction(postId, originalFilename) {
  const safePostId = normalizePostId(postId);

  const nextOriginalFilename = typeof originalFilename === "string" ? originalFilename : "";

  db.prepare(`
    UPDATE media
    SET original_filename = ?
    WHERE id = ?
  `).run(nextOriginalFilename, safePostId);

  return { original_filename: nextOriginalFilename };
}

export async function getPostTagValuesAction(postIds) {
  const ids = normalizePostIds(postIds);
  if (!ids.length) return [];
  const tagsByMediaId = getTagsByMediaIds(ids);

  return ids.map(mediaId => {
    const tags = tagsByMediaId.get(mediaId) ?? [];

    return {
      mediaId,
      tags,
      tagsValue: tags.map(tag => tag.name).join(" "),
    };
  });
}

export async function updateTagAction(tagId, nextTagData) {
  const result = updateTagById(tagId, nextTagData);
  if (nextTagData.description !== undefined)
    updateTagDescription(tagId, nextTagData.description);
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

export async function addTagAliasAction(tagId, aliasName) {
  addTagAlias(tagId, aliasName);
  revalidatePath("/tags");
}

export async function removeTagAliasAction(aliasName) {
  removeTagAlias(aliasName);
  revalidatePath("/tags");
}

export async function addTagImplicationAction(tagId, impliedTagName) {
  addTagImplicationByName(tagId, impliedTagName);
  revalidatePath("/tags");
}

export async function removeTagImplicationAction(tagId, impliedTagId) {
  removeTagImplication(tagId, impliedTagId);
  revalidatePath("/tags");
}

export async function updateMediaSettingsAction(partialSettings) {
  const media = setMediaSettings(partialSettings);
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

export async function updateTagTypeOrderAction(rawTagTypeOrder, rawTagTypeColors) {
  const tagTypeOrder = setTagTypeOrder(rawTagTypeOrder);
  const tagTypeColors = rawTagTypeColors === undefined
    ? undefined
    : setTagTypeColors(rawTagTypeColors);

  revalidatePath("/listing");
  revalidatePath("/settings");
  revalidatePath("/tags");
  revalidatePath("/upload");

  const result = {
    tagTypeOrder,
    tagTypeOrderValue: tagTypeOrder.join(" "),
  };

  if (tagTypeColors)
    result.tagTypeColors = tagTypeColors;

  return result;
}
