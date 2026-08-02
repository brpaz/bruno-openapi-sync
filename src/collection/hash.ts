import { createHash } from "node:crypto";

/** Stable hash of a request-body JSON schema, used to detect changes across syncs. */
export function hashSchema(schema: unknown): string | undefined {
  if (schema === undefined) return undefined;
  return createHash("sha1").update(JSON.stringify(schema)).digest("hex");
}
