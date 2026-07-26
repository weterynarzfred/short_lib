export default function tokenizeSearchString(searchString = "") {
  const tokens = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < searchString.length; i++) {
    const char = searchString[i];

    if (char === "\\") {
      const next = searchString[i + 1];
      if (next === "\"" || next === "\\" || next === "(" || next === ")") {
        current += next;
        i++;
        continue;
      }
    }

    if (char === "\"") {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && (char === "(" || char === ")")) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      tokens.push(char);
      continue;
    }

    if (!inQuotes && /\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) tokens.push(current);
  return tokens;
}
