import { NextResponse } from "next/server";

import db from "@/lib/db";
import { resolveTagName } from "@/lib/tagAliases";

const selectTagByName = db.prepare(`
  SELECT
    t.id,
    t.name,
    t.type,
    t.post_count AS postCount,
    t.description
  FROM tags t
  WHERE t.name = ?
`);

const selectAliases = db.prepare(`
  SELECT name FROM tag_aliases WHERE tag_id = ? ORDER BY name
`);

const selectImplications = db.prepare(`
  SELECT t.name
  FROM tag_implications ti
  JOIN tags t ON t.id = ti.implied_tag_id
  WHERE ti.tag_id = ?
  ORDER BY t.name
`);

// Looked up by name rather than id because the callers are hover targets in text - an
// editor token or a suggestion - which only ever know the name.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const requested = (searchParams.get("name") ?? "").trim();
  if (!requested) return NextResponse.json({ tag: null });

  // Hovering an alias should describe the tag it points at.
  const canonical = resolveTagName(requested);
  const tag = selectTagByName.get(canonical);
  if (!tag) return NextResponse.json({ tag: null });

  return NextResponse.json({
    tag: {
      ...tag,
      description: tag.description ?? "",
      aliases: selectAliases.all(tag.id).map(row => row.name),
      implications: selectImplications.all(tag.id).map(row => row.name),
      // Lets the tooltip say "you hovered an alias of this".
      matchedAlias: canonical !== requested ? requested : null,
    },
  });
}
