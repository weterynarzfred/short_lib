export const TAG_TABLE_COLUMNS = [
  { key: "name", label: "tag" },
  { key: "type", label: "type" },
  { key: "count", label: "posts" },
  { key: "actions", label: "actions" },
];

export function nextOrder(currentOrder, columnKey) {
  const [currentKey, currentDir] = (currentOrder || "").split("_");
  if (currentKey !== columnKey) return `${columnKey}_desc`;
  return `${columnKey}_${currentDir === "asc" ? "desc" : "asc"}`;
}

export function buildDraft(tag) {
  return {
    name: tag.name,
    type: tag.type,
  };
}
