// Predicates now live as terms in the parsed expression rather than as flat fields on
// `filters`, so tests reach them through the tree.
export function findTerms(node, kind, found = []) {
  if (!node) return found;

  if (node.type === "TERM") {
    if (!kind || node.kind === kind) found.push(node);
    return found;
  }

  findTerms(node.left, kind, found);
  findTerms(node.right, kind, found);

  return found;
}

export function findTerm(parsed, kind) {
  return findTerms(parsed.expression, kind)[0] ?? null;
}

// Compact shape of the whole tree, for asserting structure without the noise.
export function simplify(node) {
  if (!node) return null;

  if (node.type === "TERM") {
    const label = node.kind === "tag" ? node.name : `${node.kind}:${node.value ?? ""}`;
    return node.negated ? `-${label}` : label;
  }

  return [node.type, simplify(node.left), simplify(node.right)];
}
