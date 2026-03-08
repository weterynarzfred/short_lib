export default function parseSearch(searchString = "") {
  const tokens = searchString.trim().split(/\s+/).filter(Boolean);

  const includeTags = [];
  const excludeTags = [];

  const ORDER_BY = {
    age: "m.created_at DESC",
    duration: "m.duration_ms DESC",
    file_size: "m.file_size DESC",
  };

  const FILE_SIZE_RE = /^(<=|>=|<|>|=)?(\d+(?:\.\d+)?)(b|kb|mb|gb)?$/i;
  const AGE_RE = /^(<=|>=|<|>|=)?(\d+(?:\.\d+)?)(s|m|h|d|w|y)?$/i;
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

  function parseComparable(rawValue, regex, units, defaultUnit) {
    const match = regex.exec(rawValue.trim());
    if (!match) return null;

    const [, opRaw, numRaw, unitRaw] = match;
    const unit = (unitRaw || defaultUnit).toLowerCase();
    const multiplier = units[unit];
    if (!multiplier) return null;

    const parsedNumber = Number(numRaw);
    if (!Number.isFinite(parsedNumber) || parsedNumber < 0) return null;

    return {
      op: opRaw || "=",
      value: Math.floor(parsedNumber * multiplier),
    };
  }

  const filters = {
    orderBy: ORDER_BY.age,
    limit: 100,
    mimeTypes: [],
    fileSize: null,
    age: null,
  };

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

    if (token.startsWith("-")) {
      excludeTags.push(token.slice(1));
      continue;
    }

    includeTags.push(token);
  }

  return { includeTags, excludeTags, filters };
}
