export function makeResolveAlias(alias) {
  if (alias && typeof alias === "object") {
    if (Array.isArray(alias)) {
      return alias.map((item) =>
        typeof item === "string" ? { find: item, replacement: item } : item
      );
    }
    return Object.entries(alias).map(([key, value]) => ({
      find: key,
      replacement: value,
    }));
  }
  return [];
}
