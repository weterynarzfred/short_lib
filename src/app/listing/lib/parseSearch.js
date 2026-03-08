export default function parseSearch(searchString = "") {
  const tokens = searchString.trim().split(/\s+/).filter(Boolean);

  const includeTags = [];
  const excludeTags = [];

  const filters = {
    order: "m.created_at DESC",
    limit: 100
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

    if (token.startsWith("-")) {
      excludeTags.push(token.slice(1));
      continue;
    }

    includeTags.push(token);
  }

  return { includeTags, excludeTags, filters };
}
