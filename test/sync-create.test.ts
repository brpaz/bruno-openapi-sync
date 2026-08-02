import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sync } from "../src/index.js";
import type { HttpRequest, OpenCollection, SyncState } from "../src/collection/types.js";

const FIXTURE_SPEC = fileURLToPath(new URL("./fixtures/specs/basic.yaml", import.meta.url));

let collectionDir: string;

beforeEach(async () => {
  collectionDir = await mkdtemp(path.join(tmpdir(), "bruno-openapi-sync-"));
});

afterEach(async () => {
  await rm(collectionDir, { recursive: true, force: true });
});

async function readYaml<T>(...segments: string[]): Promise<T> {
  const raw = await readFile(path.join(collectionDir, ...segments), "utf8");
  return load(raw) as T;
}

describe("sync — fresh collection creation", () => {
  it("bootstraps opencollection.yml", async () => {
    await sync(FIXTURE_SPEC, collectionDir);

    const root = await readYaml<OpenCollection>("opencollection.yml");
    expect(root.opencollection).toBe("1.0.0");
    expect(root.info?.name).toBe("Basic Test API");
  });

  it("creates one request file per operation, foldered by first tag", async () => {
    await sync(FIXTURE_SPEC, collectionDir);

    const petsDir = await readdir(path.join(collectionDir, "pets"));
    expect(petsDir.sort()).toEqual(
      ["Create a pet.yml", "Find pet by ID.yml", "List all pets.yml", "folder.yml"].sort(),
    );

    const rootDir = await readdir(collectionDir);
    expect(rootDir).toContain("Health check.yml");
  });

  it("writes folder.yml for tagged operations", async () => {
    await sync(FIXTURE_SPEC, collectionDir);

    const folder = await readYaml<{ info?: { name?: string; type?: string; seq?: number } }>(
      "pets",
      "folder.yml",
    );
    expect(folder.info?.name).toBe("pets");
    expect(folder.info?.type).toBe("folder");
    expect(folder.info?.seq).toBe(1);
  });

  it("generates method/url/name correctly, using {{baseUrl}} and : path params", async () => {
    await sync(FIXTURE_SPEC, collectionDir);

    const request = await readYaml<HttpRequest>("pets", "Find pet by ID.yml");
    expect(request.info?.name).toBe("Find pet by ID");
    expect(request.http?.method).toBe("GET");
    expect(request.http?.url).toBe("{{baseUrl}}/pets/:petId");
    expect(request.http?.params).toEqual([
      { name: "petId", value: "", type: "path", description: "ID of pet to return" },
    ]);
  });

  it("seeds http.auth from the spec's security scheme", async () => {
    await sync(FIXTURE_SPEC, collectionDir);

    const request = await readYaml<HttpRequest>("pets", "List all pets.yml");
    expect(request.http?.auth).toEqual({
      type: "apikey",
      key: "X-Api-Key",
      value: "{{X-Api-Key}}",
      placement: "header",
    });
  });

  it("omits auth for an operation that overrides security to none", async () => {
    await sync(FIXTURE_SPEC, collectionDir);

    const request = await readYaml<HttpRequest>("Health check.yml");
    expect(request.http?.auth).toBeUndefined();
  });

  it("seeds an example JSON http.body from the request schema", async () => {
    await sync(FIXTURE_SPEC, collectionDir);

    const request = await readYaml<HttpRequest>("pets", "Create a pet.yml");
    expect(request.http?.body).toEqual({
      type: "json",
      data: JSON.stringify({ name: "", tag: "" }, null, 2),
    });
  });

  it("assigns info.seq in spec order starting from an empty collection", async () => {
    await sync(FIXTURE_SPEC, collectionDir);

    const listPets = await readYaml<HttpRequest>("pets", "List all pets.yml");
    const createPet = await readYaml<HttpRequest>("pets", "Create a pet.yml");
    const getPetById = await readYaml<HttpRequest>("pets", "Find pet by ID.yml");
    const health = await readYaml<HttpRequest>("Health check.yml");

    expect([listPets.info?.seq, createPet.info?.seq, getPetById.info?.seq, health.info?.seq]).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it("generates one environment file per server", async () => {
    await sync(FIXTURE_SPEC, collectionDir);

    const files = await readdir(path.join(collectionDir, "environments"));
    expect(files).toEqual(["Production.yml"]);

    const env = await readYaml<{ name: string; variables: Array<{ name: string; value: string }> }>(
      "environments",
      "Production.yml",
    );
    expect(env.name).toBe("Production");
    expect(env.variables).toEqual([{ name: "baseUrl", value: "https://api.example.com/v1" }]);
  });

  it("records every operation in the sync state sidecar, not in the request files", async () => {
    await sync(FIXTURE_SPEC, collectionDir);

    const state = await readYaml<SyncState>(".bruno-openapi-sync", "state.yml");
    expect(state.version).toBe(1);
    expect(state.operations.getPetById?.filePath).toBe(path.join("pets", "Find pet by ID.yml"));
    expect(Object.keys(state.operations).sort()).toEqual(
      ["listPets", "createPet", "getPetById", "getHealth"].sort(),
    );

    const request = await readYaml<Record<string, unknown>>("pets", "Find pet by ID.yml");
    expect(request).not.toHaveProperty("operationId");
    expect((request.info as Record<string, unknown> | undefined)?.operationId).toBeUndefined();
  });

  it("rejects a spec with a missing or duplicate operationId before writing anything", async () => {
    const badSpecPath = fileURLToPath(
      new URL("./fixtures/specs/duplicate-operation-id.yaml", import.meta.url),
    );

    await expect(sync(badSpecPath, collectionDir)).rejects.toThrow(/operationId/i);
    await expect(readdir(collectionDir)).resolves.toEqual([]);
  });

  it("rejects a Swagger 2.0 spec before any processing", async () => {
    const swagger2Path = fileURLToPath(new URL("./fixtures/specs/swagger2.yaml", import.meta.url));

    await expect(sync(swagger2Path, collectionDir)).rejects.toThrow(/Swagger 2\.0/i);
    await expect(readdir(collectionDir)).resolves.toEqual([]);
  });
});
