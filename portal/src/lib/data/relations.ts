export function relatedName(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;

  if (!row || typeof row !== "object" || !("name" in row)) {
    return null;
  }

  const name = (row as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name : null;
}
