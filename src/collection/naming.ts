const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/** `/pets/{petId}` -> `{{baseUrl}}/pets/:petId` — never an absolute URL (CONTEXT.md "Generated URL"). */
export function toBrunoUrl(path: string): string {
  return `{{baseUrl}}${path.replace(/\{([^}]+)\}/g, ":$1")}`;
}

/** First tag decides folder placement; untagged operations land at the collection root. */
export function folderNameForOperation(tags: string[]): string | null {
  return tags[0]?.trim() || null;
}

export function sanitizeFileName(name: string): string {
  return name.replace(INVALID_FILENAME_CHARS, "_").trim();
}

/**
 * Picks a request's on-disk file name from its summary (falling back to operationId),
 * mirroring Bruno's own generator. `usedNames` tracks names already taken within the same
 * folder so collisions get disambiguated instead of overwriting each other.
 */
export function requestFileName(
  op: { summary?: string; operationId: string; method: string },
  usedNames: Set<string>,
): string {
  const base = sanitizeFileName(op.summary?.trim() || op.operationId);

  let candidate = base;
  if (usedNames.has(candidate)) {
    candidate = `${base} (${op.method})`;
  }
  if (usedNames.has(candidate)) {
    candidate = `${base} (${op.operationId})`;
  }

  usedNames.add(candidate);
  return `${candidate}.yml`;
}
