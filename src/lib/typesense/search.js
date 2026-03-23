import db from "@/lib/db";
import { getTypesenseClient, isTypesenseConfigured } from "@/lib/typesense/client";

const TAGS_COLLECTION = "short_lib_tags";
const MEDIA_NOTES_COLLECTION = "short_lib_media_notes";

const TAGS_SCHEMA = {
  name: TAGS_COLLECTION,
  fields: [
    { name: "name", type: "string", infix: true },
    { name: "type", type: "string" },
    { name: "post_count", type: "int32" },
  ],
  default_sorting_field: "post_count",
};

const MEDIA_NOTES_SCHEMA = {
  name: MEDIA_NOTES_COLLECTION,
  fields: [
    { name: "media_id", type: "int32" },
    { name: "notes_md", type: "string" },
  ],
  default_sorting_field: "media_id",
};

let tagsDirty = true;
let mediaNotesDirty = true;
let tagsSyncPromise = null;
let mediaNotesSyncPromise = null;

function splitTerms(raw = "") {
  return String(raw)
    .trim()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean);
}

function makeNotFoundCheck(error) {
  const status = error?.httpStatus ?? error?.status;
  if (status === 404) return true;
  return /404|Not Found/i.test(String(error?.message ?? ""));
}

async function recreateCollection(client, schema) {
  try {
    await client.collections(schema.name).delete();
  } catch (error) {
    if (!makeNotFoundCheck(error)) throw error;
  }

  await client.collections().create(schema);
}

async function importDocuments(client, collectionName, docs) {
  if (!Array.isArray(docs) || docs.length === 0) return;
  await client.collections(collectionName).documents().import(docs, { action: "create" });
}

async function rebuildTagsCollection(client) {
  await recreateCollection(client, TAGS_SCHEMA);

  const rows = db.prepare(`
    SELECT id, name, type, post_count
    FROM tags
    WHERE TRIM(COALESCE(name, '')) <> ''
    ORDER BY id ASC
  `).all();

  const docs = rows.map(row => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    type: String(row.type ?? "general"),
    post_count: Number(row.post_count) || 0,
  }));

  await importDocuments(client, TAGS_COLLECTION, docs);
}

async function rebuildMediaNotesCollection(client) {
  await recreateCollection(client, MEDIA_NOTES_SCHEMA);

  const rows = db.prepare(`
    SELECT id, notes_md
    FROM media
    WHERE TRIM(COALESCE(notes_md, '')) <> ''
    ORDER BY id ASC
  `).all();

  const docs = rows.map(row => ({
    id: String(row.id),
    media_id: Number(row.id),
    notes_md: String(row.notes_md ?? ""),
  }));

  await importDocuments(client, MEDIA_NOTES_COLLECTION, docs);
}

async function ensureTagsIndexSynced() {
  if (!tagsDirty) return;
  if (tagsSyncPromise) return tagsSyncPromise;

  tagsSyncPromise = (async () => {
    const client = getTypesenseClient();
    await rebuildTagsCollection(client);
    tagsDirty = false;
  })();

  try {
    await tagsSyncPromise;
  } finally {
    tagsSyncPromise = null;
  }
}

async function ensureMediaNotesIndexSynced() {
  if (!mediaNotesDirty) return;
  if (mediaNotesSyncPromise) return mediaNotesSyncPromise;

  mediaNotesSyncPromise = (async () => {
    const client = getTypesenseClient();
    await rebuildMediaNotesCollection(client);
    mediaNotesDirty = false;
  })();

  try {
    await mediaNotesSyncPromise;
  } finally {
    mediaNotesSyncPromise = null;
  }
}

function fallbackTagSuggestions(prefix, limit = 16) {
  const safePrefix = String(prefix ?? "").trim();
  if (!safePrefix) return [];

  return db.prepare(`
    SELECT
      t.id,
      t.name,
      t.type,
      t.post_count
    FROM tags t
    WHERE t.name LIKE ? || '%'
    ORDER BY t.post_count DESC, t.id ASC
    LIMIT ?
  `)
    .all(safePrefix, limit)
    .map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      postCount: row.post_count,
    }));
}

function fallbackNotesSearch(query, limit = 5000) {
  const terms = splitTerms(query);
  if (!terms.length) return [];

  const where = [];
  const params = [];

  for (const term of terms) {
    where.push("LOWER(COALESCE(notes_md, '')) LIKE ?");
    params.push(`%${term.toLowerCase()}%`);
  }

  const rows = db.prepare(`
    SELECT id
    FROM media
    WHERE ${where.join(" AND ")}
    ORDER BY id ASC
    LIMIT ?
  `).all(...params, limit);

  return rows.map(row => Number(row.id)).filter(Number.isInteger);
}

export function markTagsIndexDirty() {
  tagsDirty = true;
}

export function markMediaNotesIndexDirty() {
  mediaNotesDirty = true;
}

export async function searchTagSuggestions(query, { limit = 16 } = {}) {
  const safeQuery = String(query ?? "").trim();
  if (!safeQuery) return [];
  if (!/[\p{L}\p{N}]/u.test(safeQuery)) return [];

  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 100) : 16;

  if (!isTypesenseConfigured()) return fallbackTagSuggestions(safeQuery, safeLimit);

  try {
    await ensureTagsIndexSynced();

    const client = getTypesenseClient();
    const result = await client.collections(TAGS_COLLECTION).documents().search({
      q: safeQuery,
      query_by: "name",
      prefix: true,
      infix: "always",
      per_page: safeLimit,
      page: 1,
      sort_by: "_text_match:desc,post_count:desc",
    });

    const hits = Array.isArray(result?.hits) ? result.hits : [];

    return hits
      .map(hit => hit?.document)
      .filter(Boolean)
      .map(doc => ({
        id: Number(doc.id),
        name: doc.name,
        type: doc.type,
        postCount: doc.post_count,
      }))
      .filter(tag => Number.isInteger(tag.id) && typeof tag.name === "string" && tag.name.trim());
  } catch (error) {
    console.warn("Typesense tag suggestion search failed, using SQLite fallback.", error);
    return fallbackTagSuggestions(safeQuery, safeLimit);
  }
}

export async function searchMediaIdsByNotes(query, { limit = 5000 } = {}) {
  const safeQuery = String(query ?? "").trim();
  if (!safeQuery) return [];

  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 10000) : 5000;

  if (!isTypesenseConfigured()) return fallbackNotesSearch(safeQuery, safeLimit);

  try {
    await ensureMediaNotesIndexSynced();

    const client = getTypesenseClient();
    const ids = [];
    let page = 1;

    while (ids.length < safeLimit) {
      const perPage = Math.min(250, safeLimit - ids.length);
      const result = await client.collections(MEDIA_NOTES_COLLECTION).documents().search({
        q: safeQuery,
        query_by: "notes_md",
        prefix: false,
        per_page: perPage,
        page,
      });

      const hits = Array.isArray(result?.hits) ? result.hits : [];
      if (!hits.length) break;

      for (const hit of hits) {
        const mediaId = Number(hit?.document?.media_id);
        if (Number.isInteger(mediaId)) ids.push(mediaId);
        if (ids.length >= safeLimit) break;
      }

      if (hits.length < perPage) break;
      page += 1;
    }

    return [...new Set(ids)];
  } catch (error) {
    console.warn("Typesense notes search failed, using SQLite fallback.", error);
    return fallbackNotesSearch(safeQuery, safeLimit);
  }
}
