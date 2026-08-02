import type { Operation, OperationParam, ResolvedSecurityScheme } from "../spec/operations.js";
import { toBrunoUrl } from "../collection/naming.js";
import { exampleFromSchema } from "./example-body.js";
import type { Auth, HttpRequest, HttpRequestHeader, HttpRequestParam, RawBody } from "../collection/types.js";

export type SyncMode = "normal" | "overwrite";

/**
 * Encodes the generated/seeded/user-owned field rules from CONTEXT.md in one place so
 * creation and update never fork. `seq` is only used on creation — an update always
 * preserves the existing file's `info.seq` (CONTEXT.md "Seeded field").
 */
export function reconcileRequest(
  op: Operation,
  existing: HttpRequest | null,
  mode: SyncMode,
  seq: number,
): HttpRequest {
  return existing === null ? createRequest(op, seq) : updateRequest(op, existing, mode, seq);
}

function createRequest(op: Operation, seq: number): HttpRequest {
  const auth = seedAuth(op.securityScheme);
  const body = seedBody(op);

  const request: HttpRequest = {
    info: {
      name: op.summary?.trim() || op.operationId,
      type: "http",
      seq,
      ...(op.tags.length > 0 ? { tags: op.tags } : {}),
    },
    http: {
      method: op.method,
      url: toBrunoUrl(op.path),
      ...(op.headers.length > 0 ? { headers: op.headers.map(toHeaderEntry) } : {}),
      ...(op.params.length > 0 ? { params: op.params.map(toParamEntry) } : {}),
      ...(auth ? { auth } : {}),
      ...(body ? { body } : {}),
    },
  };

  if (op.description) request.docs = op.description;
  return request;
}

/**
 * Normal mode regenerates `info.name`, `info.tags`, `http.method`, `http.url`, and each
 * spec-matched `http.params`/`http.headers` entry — the fields CONTEXT.md marks
 * generated. Everything else (`info.seq`, `http.auth`, `http.body`, unmatched
 * (user-added) param/header entries, `runtime`, `settings`, `docs`, and any custom
 * keys the user added) is carried over verbatim via object spread, so it round-trips
 * byte-for-byte when nothing changed.
 *
 * Overwrite mode (CONTEXT.md "Overwrite mode") suspends all of that: `info.seq` is
 * reassigned, `http.auth`/`http.body` are reseeded from the spec, and
 * `http.params`/`http.headers` are replaced wholesale instead of per-entry diffed — the
 * spec wins everywhere, unconditionally, including wiping a user-added header.
 */
function updateRequest(op: Operation, existing: HttpRequest, mode: SyncMode, seq: number): HttpRequest {
  const info = { ...existing.info, name: op.summary?.trim() || op.operationId, type: "http" as const };
  if (op.tags.length > 0) {
    info.tags = op.tags;
  } else {
    delete info.tags;
  }
  if (mode === "overwrite") info.seq = seq;

  const headers =
    mode === "overwrite"
      ? op.headers.map(toHeaderEntry)
      : reconcileEntries(existing.http?.headers, op.headers, toHeaderEntry);
  const params =
    mode === "overwrite"
      ? op.params.map(toParamEntry)
      : reconcileEntries(existing.http?.params, op.params, toParamEntry);

  const http = { ...existing.http, method: op.method, url: toBrunoUrl(op.path) };
  if (headers.length > 0) http.headers = headers;
  else delete http.headers;
  if (params.length > 0) http.params = params;
  else delete http.params;

  if (mode === "overwrite") {
    const auth = seedAuth(op.securityScheme);
    if (auth) http.auth = auth;
    else delete http.auth;

    const body = seedBody(op);
    if (body) http.body = body;
    else delete http.body;
  }

  return { ...existing, info, http };
}

/**
 * Per-entry diff for `http.params`/`http.headers` (CONTEXT.md "Param/header entry"):
 * an existing entry whose name matches a spec param/header is regenerated in place;
 * an existing entry with no spec match (user-added) is kept verbatim; a spec
 * param/header with no existing entry is appended.
 */
function reconcileEntries<T extends { name: string }>(
  existingEntries: T[] | undefined,
  specEntries: OperationParam[],
  toEntry: (p: OperationParam) => T,
): T[] {
  const specByName = new Map(specEntries.map((p) => [p.name, p]));
  const existingNames = new Set((existingEntries ?? []).map((e) => e.name));

  const result = (existingEntries ?? []).map((entry) => {
    const specParam = specByName.get(entry.name);
    return specParam ? toEntry(specParam) : entry;
  });

  for (const specParam of specEntries) {
    if (!existingNames.has(specParam.name)) {
      result.push(toEntry(specParam));
    }
  }

  return result;
}

function toParamEntry(param: Operation["params"][number]): HttpRequestParam {
  return {
    name: param.name,
    value: "",
    type: param.location === "path" ? "path" : "query",
    ...(param.description ? { description: param.description } : {}),
  };
}

function toHeaderEntry(param: Operation["params"][number]): HttpRequestHeader {
  return {
    name: param.name,
    value: "",
    ...(param.description ? { description: param.description } : {}),
  };
}

/** Best-effort `http.auth` default from the operation's security scheme (seeded once). */
function seedAuth(scheme: ResolvedSecurityScheme | undefined): Auth | undefined {
  if (!scheme) return undefined;

  if (scheme.type === "apiKey" && scheme.paramName) {
    return {
      type: "apikey",
      key: scheme.paramName,
      value: `{{${scheme.paramName}}}`,
      placement: scheme.location === "query" ? "query" : "header",
    };
  }

  if (scheme.type === "http" && scheme.location === "bearer") {
    return { type: "bearer", token: "{{bearerToken}}" };
  }

  if (scheme.type === "http" && scheme.location === "basic") {
    return { type: "basic", username: "{{username}}", password: "{{password}}" };
  }

  // oauth2/openIdConnect/digest/etc. are too configuration-heavy to default sensibly.
  return undefined;
}

const JSON_CONTENT_TYPE = /json/i;

/** Best-effort example `http.body` from the request schema (seeded once, JSON bodies only). */
function seedBody(op: Operation): RawBody | undefined {
  if (!op.requestBodySchema || !op.requestBodyContentType) return undefined;
  if (!JSON_CONTENT_TYPE.test(op.requestBodyContentType)) return undefined;

  const example = exampleFromSchema(op.requestBodySchema);
  return { type: "json", data: JSON.stringify(example, null, 2) };
}
