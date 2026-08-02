/** Best-effort placeholder generator for seeding an initial JSON request body from a schema. */
export function exampleFromSchema(schema: unknown, depth = 0): unknown {
  if (!schema || typeof schema !== "object" || depth > 6) return null;
  const s = schema as Record<string, unknown>;

  if ("example" in s) return s.example;
  if ("default" in s) return s.default;
  if (Array.isArray(s.enum) && s.enum.length > 0) return s.enum[0];

  switch (s.type) {
    case "object": {
      const result: Record<string, unknown> = {};
      const properties = (s.properties ?? {}) as Record<string, unknown>;
      for (const [key, propSchema] of Object.entries(properties)) {
        result[key] = exampleFromSchema(propSchema, depth + 1);
      }
      return result;
    }
    case "array":
      return [exampleFromSchema(s.items, depth + 1)];
    case "string":
      return "";
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    default:
      return s.properties ? exampleFromSchema({ ...s, type: "object" }, depth) : null;
  }
}
