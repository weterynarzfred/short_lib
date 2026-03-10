import parseComparable from "@/app/listing/lib/parseComparable";
import parseImageRatio from "@/app/listing/lib/parseImageRatio";
import tokenizeSearchString from "@/app/listing/lib/tokenizeSearchString";

// TODO: add an option to reverse order, probably with operators like
// order:file_size_asc
export default function parseSearch(searchString = "") {
  const tokens = tokenizeSearchString(searchString);

  const includeTags = [];
  const excludeTags = [];

  const ORDER_BY = {
    age: "m.created_at DESC",
    duration: "m.duration_ms DESC",
    file_size: "m.file_size DESC",
    pixelcount: "(COALESCE(m.width, 0) * COALESCE(m.height, 0)) DESC",
    image_ratio: `
      CASE
        WHEN m.width IS NOT NULL AND m.height IS NOT NULL AND m.height > 0
          THEN CAST(m.width AS REAL) / m.height
        ELSE NULL
      END DESC
    `,
    tag_count: "tag_count DESC",
  };

  const FILE_SIZE_RE = /^(<=|>=|<|>|=)?(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/i;
  const AGE_RE = /^(<=|>=|<|>|=)?(\d+(?:\.\d+)?)(s|m|h|d|w|y)?$/i;
  const DURATION_RE = /^(<=|>=|<|>|=)?(\d+(?:\.\d+)?)(ms|s|m|h)?$/i;
  const MPIXELS_RE = /^(<=|>=|<|>|=)?(\d+(?:\.\d+)?)$/i;
  const FILE_SIZE_UNITS = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
  };
  const AGE_UNITS = {
    s: 1,
    m: 60,
    h: 60 * 60,
    d: 60 * 60 * 24,
    w: 60 * 60 * 24 * 7,
    y: 60 * 60 * 24 * 365,
  };
  const DURATION_UNITS = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
  };

  const filters = {
    orderBy: ORDER_BY.age,
    limit: 100,
    mimeTypes: [],
    fileSize: null,
    age: null,
    mpixels: null,
    duration: null,
    imageRatio: null,
    notes: null,
  };

  function toNotesFtsTerm(rawValue) {
    const trimmed = rawValue.trim();
    if (!trimmed) return null;
    return trimmed.replace(/(^"|"$)/, "");
  }

  for (const token of tokens) {
    if (token.startsWith("limit:")) {
      const parsedLimit = Number(token.slice(6));
      if (Number.isFinite(parsedLimit) && parsedLimit > 0)
        filters.limit = Math.min(Math.floor(parsedLimit), 500);
      else
        filters.limit = 100;
      continue;
    }

    if (token.startsWith("order:")) {
      const orderKey = token.slice(6);
      if (ORDER_BY[orderKey]) filters.orderBy = ORDER_BY[orderKey];
      continue;
    }

    if (token.startsWith("mime_type:")) {
      const mimeType = token.slice("mime_type:".length).trim().toLowerCase();
      if (mimeType) filters.mimeTypes.push(mimeType);
      continue;
    }

    if (token.startsWith("file_size:")) {
      const parsed = parseComparable(
        token.slice("file_size:".length),
        FILE_SIZE_RE,
        FILE_SIZE_UNITS,
        "b"
      );
      if (parsed) filters.fileSize = parsed;
      continue;
    }

    if (token.startsWith("age:")) {
      const parsed = parseComparable(
        token.slice("age:".length),
        AGE_RE,
        AGE_UNITS,
        "d"
      );
      if (parsed) filters.age = parsed;
      continue;
    }

    if (token.startsWith("mpixels:")) {
      const parsed = parseComparable(
        token.slice("mpixels:".length),
        MPIXELS_RE,
        { value: 1_000_000 },
        "value",
        { integer: false }
      );
      if (parsed) filters.mpixels = parsed;
      continue;
    }

    if (token.startsWith("duration:")) {
      const parsed = parseComparable(
        token.slice("duration:".length),
        DURATION_RE,
        DURATION_UNITS,
        "ms"
      );
      if (parsed) filters.duration = parsed;
      continue;
    }

    if (token.startsWith("image_ratio:")) {
      const parsed = parseImageRatio(token.slice("image_ratio:".length));
      if (parsed) filters.imageRatio = parsed;
      continue;
    }

    if (token.startsWith("notes:")) {
      const term = toNotesFtsTerm(token.slice("notes:".length));
      if (term) filters.notes = filters.notes ? `${filters.notes} ${term}` : term;
      continue;
    }

    if (token.startsWith("-")) {
      excludeTags.push(token.slice(1));
      continue;
    }

    includeTags.push(token);
  }

  return { includeTags, excludeTags, filters };
}
