import SwaggerParser from "@apidevtools/swagger-parser";
import type { OpenAPIV3, OpenAPIV3_1 } from "openapi-types";

export type OpenApiDocument = OpenAPIV3.Document | OpenAPIV3_1.Document;

const SUPPORTED_VERSION = /^3\.[01]\./;

/**
 * Loads and dereferences an OpenAPI spec from a local file path or an http(s):// URL —
 * swagger-parser resolves both transparently. Only validates the `openapi` version field;
 * full semantic spec validation is intentionally not performed here.
 */
export async function loadSpec(specPathOrUrl: string): Promise<OpenApiDocument> {
  const api = (await SwaggerParser.dereference(specPathOrUrl)) as OpenApiDocument & {
    swagger?: string;
  };

  const version = api.openapi;
  if (!version || !SUPPORTED_VERSION.test(version)) {
    const found = version ?? (api.swagger ? `Swagger ${api.swagger}` : "unknown");
    throw new Error(
      `Unsupported spec version in "${specPathOrUrl}": ${found}. ` +
        `Only OpenAPI 3.0.x and 3.1.x are supported (Swagger 2.0 is not).`,
    );
  }

  return api;
}
