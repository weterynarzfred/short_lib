"use server";

import { revalidatePath } from "next/cache";

import addTags, { parseTagString, removeTags } from "@/lib/addTags";
import db from "@/lib/db";
import parseTagToken from "@/lib/parseTagToken";
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
import { markMediaFilenamesIndexDirty, markMediaNotesIndexDirty } from "@/lib/search";
import { clampScore } from "@/lib/score";

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

// Next redacts thrown server-action errors in production builds, leaving the client with
// an opaque digest, so failures are returned as data instead. Callers must check
// `ok === false` rather than relying on a rejection.
function failed(error) {
  return { ok: false, error: error?.message || "Action failed" };
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

// Takes ids already through normalizePostIds, and at least one.
function getTagsByMediaIds(ids) {
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
  try {
    await deletePost(postId);
  } catch (error) {
    return failed(error);
  }
  return { ok: true };
}

// Posts are deleted one by one, so a failure part way through still reports the ones that
// went, and the listing can drop exactly those.
export async function deletePostsBulkAction(postIds) {
  const deletedIds = [];
  try {
    for (const postId of normalizePostIds(postIds)) {
      await deletePost(postId);
      deletedIds.push(postId);
    }
  } catch (error) {
    return { ...failed(error), deletedIds };
  }
  return { ok: true, deletedIds };
}

export async function clearDeletedStorageAction() {
  const result = clearDeletedStorage();
  revalidatePath("/");
  return result;
}

export async function updatePostTagsAction(postId, rawTagString) {
  try {
    const safePostId = normalizePostId(postId);

    const tags = parseTagString(rawTagString);
    addTags(safePostId, tags, { replace: true });
    const tagsByMediaId = getTagsByMediaIds([safePostId]);

    return {
      ok: true,
      tags: tagsByMediaId.get(safePostId) ?? [],
    };
  } catch (error) {
    return failed(error);
  }
}

export async function addPostTagsBulkAction(postIds, rawTagString) {
  try {
    const tags = parseTagString(rawTagString);
    const ids = normalizePostIds(postIds);

    for (const postId of ids) addTags(postId, tags, { replace: false });
  } catch (error) {
    return failed(error);
  }

  revalidatePath("/listing");
  return { ok: true };
}

export async function editPostTagsBulkAction(postIds, rawTagString) {
  const ids = normalizePostIds(postIds);
  if (!ids.length) return { ok: true, updates: [] };

  const tokens = String(rawTagString ?? "").split(/\s+/).filter(Boolean).map(parseTagToken);
  const tagsToAdd = tokens.filter(t => !t.negated);
  const tagsToRemove = tokens.filter(t => t.negated);

  try {
    for (const postId of ids) {
      if (tagsToRemove.length) removeTags(postId, tagsToRemove);
      if (tagsToAdd.length) addTags(postId, tagsToAdd, { replace: false });
    }
  } catch (error) {
    return failed(error);
  }
  const tagsByMediaId = getTagsByMediaIds(ids);

  return {
    ok: true,
    updates: ids.map(mediaId => ({
      mediaId,
      tags: tagsByMediaId.get(mediaId) ?? [],
    })),
  };
}

export async function updatePostNotesAction(postId, notesMd) {
  try {
    const safePostId = normalizePostId(postId);

    const nextNotes = typeof notesMd === "string" ? notesMd : "";

    db.prepare(`
      UPDATE media
      SET notes_md = ?
      WHERE id = ?
    `).run(nextNotes, safePostId);
    markMediaNotesIndexDirty();

    return { ok: true, notes_md: nextNotes };
  } catch (error) {
    return failed(error);
  }
}

export async function updatePostOriginalFilenameAction(postId, originalFilename) {
  try {
    const safePostId = normalizePostId(postId);

    const nextOriginalFilename = typeof originalFilename === "string" ? originalFilename : "";

    db.prepare(`
      UPDATE media
      SET original_filename = ?
      WHERE id = ?
    `).run(nextOriginalFilename, safePostId);
    markMediaFilenamesIndexDirty();

    return { ok: true, original_filename: nextOriginalFilename };
  } catch (error) {
    return failed(error);
  }
}

export async function updatePostScoreAction(postId, score) {
  try {
    const safePostId = normalizePostId(postId);
    const nextScore = clampScore(score);

    db.prepare(`
      UPDATE media
      SET score = ?
      WHERE id = ?
    `).run(nextScore, safePostId);

    return { ok: true, score: nextScore };
  } catch (error) {
    return failed(error);
  }
}

export async function updatePostScoreBulkAction(postIds, score) {
  const ids = normalizePostIds(postIds);
  const nextScore = clampScore(score);
  if (!ids.length) return { ok: true, score: nextScore, postIds: [] };

  const placeholders = ids.map(() => "?").join(",");

  try {
    db.prepare(`
      UPDATE media
      SET score = ?
      WHERE id IN (${placeholders})
    `).run(nextScore, ...ids);
  } catch (error) {
    return failed(error);
  }

  return { ok: true, score: nextScore, postIds: ids };
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
  let result;
  try {
    result = updateTagById(tagId, nextTagData);
    if (nextTagData.description !== undefined)
      updateTagDescription(tagId, nextTagData.description);
  } catch (error) {
    return failed(error);
  }

  revalidatePath("/tags");
  revalidatePath("/listing");
  return { ok: true, ...result };
}

export async function deleteTagAction(tagId) {
  let deleted;
  try {
    deleted = deleteTagById(tagId);
  } catch (error) {
    return failed(error);
  }

  revalidatePath("/tags");
  revalidatePath("/listing");
  return { ok: true, deleted };
}

export async function addTagAliasAction(tagId, aliasName) {
  try {
    addTagAlias(tagId, aliasName);
  } catch (error) {
    return failed(error);
  }

  revalidatePath("/tags");
  return { ok: true };
}

export async function removeTagAliasAction(aliasName) {
  try {
    removeTagAlias(aliasName);
  } catch (error) {
    return failed(error);
  }

  revalidatePath("/tags");
  return { ok: true };
}

export async function addTagImplicationAction(tagId, impliedTagName) {
  let result;
  try {
    result = addTagImplicationByName(tagId, impliedTagName);
  } catch (error) {
    return failed(error);
  }

  revalidatePath("/tags");
  // The backfill can touch posts far from this tag, so the listing is stale too.
  revalidatePath("/listing");
  return { ok: true, ...result };
}

export async function removeTagImplicationAction(tagId, impliedTagId) {
  try {
    removeTagImplication(tagId, impliedTagId);
  } catch (error) {
    return failed(error);
  }

  revalidatePath("/tags");
  return { ok: true };
}

export async function updateMediaSettingsAction(partialSettings) {
  return setMediaSettings(partialSettings);
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
