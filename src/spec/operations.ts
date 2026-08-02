import type { OpenAPIV3 } from "openapi-types";
import type { OpenApiDocument } from "./load.js";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

export type ParamLocation = "query" | "path" | "header";

export interface OperationParam {
  name: string;
  location: ParamLocation;
  required: boolean;
  description?: string;
}

export interface ResolvedSecurityScheme {
  type: "apiKey" | "http";
  /** apiKey: the header/query param name. http: unused. */
  paramName?: string;
  /** apiKey: header|query. http: the auth scheme (bearer/basic/...). */
  location?: string;
}

export interface Operation {
  operationId: string;
  method: string;
  path: string;
  tags: string[];
  summary?: string;
  description?: string;
  params: OperationParam[];
  headers: OperationParam[];
  requestBodyContentType?: string;
  requestBodySchema?: unknown;
  securityScheme?: ResolvedSecurityScheme;
}

/**
 * Flattens a dereferenced OpenAPI document into one Operation per path+method.
 * Throws if any operation is missing `operationId` or two collide — sync must never
 * proceed without a reliable match key (see CONTEXT.md "Match key").
 */
export function flattenOperations(doc: OpenApiDocument): Operation[] {
  const document = doc as unknown as OpenAPIV3.Document;
  // Spec is dereferenced before this runs, so no $ref objects survive despite the static type.
  const securitySchemes = (document.components?.securitySchemes ?? {}) as Record<
    string,
    OpenAPIV3.SecuritySchemeObject
  >;

  const operations: Operation[] = [];
  const locationsByOperationId = new Map<string, string[]>();
  const missing: string[] = [];

  for (const [urlPath, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathItem) continue;
    const pathLevelParams = (pathItem as OpenAPIV3.PathItemObject).parameters ?? [];

    for (const method of HTTP_METHODS) {
      const op = (pathItem as unknown as Record<string, OpenAPIV3.OperationObject | undefined>)[method];
      if (!op) continue;

      const label = `${method.toUpperCase()} ${urlPath}`;
      if (!op.operationId) {
        missing.push(label);
        continue;
      }

      const locations = locationsByOperationId.get(op.operationId) ?? [];
      locations.push(label);
      locationsByOperationId.set(op.operationId, locations);

      const allParams = [...pathLevelParams, ...(op.parameters ?? [])] as OpenAPIV3.ParameterObject[];
      const params: OperationParam[] = [];
      const headers: OperationParam[] = [];
      for (const param of allParams) {
        const entry: OperationParam = {
          name: param.name,
          location: param.in as ParamLocation,
          required: Boolean(param.required),
          ...(param.description ? { description: param.description } : {}),
        };
        if (param.in === "header") headers.push(entry);
        else if (param.in === "query" || param.in === "path") params.push(entry);
      }

      const content = op.requestBody && "content" in op.requestBody ? op.requestBody.content : undefined;
      const requestBodyContentType = content ? Object.keys(content)[0] : undefined;
      const requestBodySchema =
        requestBodyContentType && content ? content[requestBodyContentType]?.schema : undefined;

      operations.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path: urlPath,
        tags: op.tags ?? [],
        ...(op.summary ? { summary: op.summary } : {}),
        ...(op.description ? { description: op.description } : {}),
        params,
        headers,
        ...(requestBodyContentType ? { requestBodyContentType } : {}),
        ...(requestBodySchema ? { requestBodySchema } : {}),
        ...(resolveSecurityScheme(op.security ?? document.security, securitySchemes)
          ? { securityScheme: resolveSecurityScheme(op.security ?? document.security, securitySchemes) }
          : {}),
      });
    }
  }

  const duplicates = [...locationsByOperationId.entries()].filter(([, locations]) => locations.length > 1);
  const errors: string[] = [];
  if (missing.length > 0) {
    errors.push(`missing operationId: ${missing.join(", ")}`);
  }
  if (duplicates.length > 0) {
    const detail = duplicates
      .map(([id, locations]) => `"${id}" used by ${locations.join(" and ")}`)
      .join("; ");
    errors.push(`duplicate operationId: ${detail}`);
  }
  if (errors.length > 0) {
    throw new Error(`Spec has operationId problems — ${errors.join("; ")}.`);
  }

  return operations;
}

/**
 * Best-effort resolution of the first security requirement to a concrete scheme, used to
 * seed `http.auth` on creation (see CONTEXT.md "Seeded field"). OAuth2/OpenID Connect are
 * not resolved — too configuration-heavy to default sensibly, so auth is left unseeded.
 */
function resolveSecurityScheme(
  requirements: OpenAPIV3.SecurityRequirementObject[] | undefined,
  schemes: Record<string, OpenAPIV3.SecuritySchemeObject>,
): ResolvedSecurityScheme | undefined {
  const firstRequirement = requirements?.[0];
  if (!firstRequirement) return undefined;

  const schemeName = Object.keys(firstRequirement)[0];
  if (!schemeName) return undefined;

  const scheme = schemes[schemeName];
  if (!scheme) return undefined;

  if (scheme.type === "apiKey") {
    return { type: "apiKey", paramName: scheme.name, location: scheme.in };
  }
  if (scheme.type === "http") {
    return { type: "http", location: scheme.scheme };
  }
  return undefined;
}
