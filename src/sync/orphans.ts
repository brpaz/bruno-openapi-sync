import type { ExistingRequestFile } from "../collection/scan.js";
import type { Auth } from "../collection/types.js";

export interface OrphanClassification {
  hasUserOwnedContent: boolean;
  reasons: string[];
}

/**
 * Classifies a request file whose operation no longer exists in the spec (CONTEXT.md
 * "Orphaned request"). Three signals count as user-owned content: a non-empty `runtime`
 * block, `http.auth` customized beyond its seeded placeholder default, or any
 * param/header entry that isn't in the last-known set of spec-generated names (i.e. was
 * user-added). With no live spec operation left to diff against, the persisted
 * `generatedParamNames`/`generatedHeaderNames` from the last successful sync are the only
 * way to tell a generated entry apart from a user-added one.
 */
export function classifyOrphan(entry: ExistingRequestFile): OrphanClassification {
  const reasons: string[] = [];
  const { request } = entry;

  if (hasNonEmptyRuntime(request)) {
    reasons.push("has a runtime block (scripts/tests/assertions/variables)");
  }

  if (request.http?.auth && !isUnmodifiedSeededAuth(request.http.auth)) {
    reasons.push("http.auth was customized beyond its seeded default");
  }

  const generatedParamNames = new Set(entry.generatedParamNames ?? []);
  const generatedHeaderNames = new Set(entry.generatedHeaderNames ?? []);
  const userAddedParams = (request.http?.params ?? []).some((p) => !generatedParamNames.has(p.name));
  const userAddedHeaders = (request.http?.headers ?? []).some((h) => !generatedHeaderNames.has(h.name));
  if (userAddedParams || userAddedHeaders) {
    reasons.push("has user-added param/header entries");
  }

  return { hasUserOwnedContent: reasons.length > 0, reasons };
}

function hasNonEmptyRuntime(request: ExistingRequestFile["request"]): boolean {
  const runtime = request.runtime;
  if (!runtime) return false;
  return Boolean(
    runtime.scripts?.length ||
    runtime.assertions?.length ||
    runtime.actions?.length ||
    runtime.variables?.length,
  );
}

const PLACEHOLDER_PATTERN = /^\{\{.+\}\}$/;

function looksLikePlaceholder(value: string | undefined): boolean {
  return typeof value === "string" && PLACEHOLDER_PATTERN.test(value);
}

/** True if `auth` still looks like whatever `seedAuth()` in sync/fields.ts would produce. */
function isUnmodifiedSeededAuth(auth: Auth): boolean {
  if (auth === "inherit") return true;

  switch (auth.type) {
    case "apikey":
      return looksLikePlaceholder(auth.value);
    case "bearer":
      return looksLikePlaceholder(auth.token);
    case "basic":
      return looksLikePlaceholder(auth.username) && looksLikePlaceholder(auth.password);
    default:
      // Any other auth type (oauth2, digest, wsse, ntlm, awsv4, ...) is never seeded by
      // this tool, so its mere presence means the user configured it themselves.
      return false;
  }
}
