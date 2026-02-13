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
      filters.limit = Math.min(Number(token.slice(6)) || 100, 500);
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
