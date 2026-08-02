import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dump, load } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sync } from "../src/index.js";
import type { HttpRequest, SyncState } from "../src/collection/types.js";

const BASIC = fileURLToPath(new URL("./fixtures/specs/basic.yaml", import.meta.url));
const WITHOUT_HEALTH = fileURLToPath(new URL("./fixtures/specs/basic-without-health.yaml", import.meta.url));

let collectionDir: string;

beforeEach(async () => {
  collectionDir = await mkdtemp(path.join(tmpdir(), "bruno-openapi-sync-"));
});

afterEach(async () => {
  await rm(collectionDir, { recursive: true, force: true });
});

async function exists(...segments: string[]): Promise<boolean> {
  try {
    await access(path.join(collectionDir, ...segments));
    return true;
  } catch {
    return false;
  }
}

async function readYaml<T>(...segments: string[]): Promise<T> {
  const raw = await readFile(path.join(collectionDir, ...segments), "utf8");
  return load(raw) as T;
}

describe("sync — orphan handling", () => {
  it("deletes an orphaned request that has no user-owned content", async () => {
    await sync(BASIC, collectionDir);
    expect(await exists("Health check.yml")).toBe(true);

    const result = await sync(WITHOUT_HEALTH, collectionDir);

    expect(await exists("Health check.yml")).toBe(false);
    expect(result.plan.deletes).toEqual([{ operationId: "getHealth", filePath: "Health check.yml" }]);

    const state = await readYaml<SyncState>(".bruno-openapi-sync", "state.yml");
    expect(state.operations.getHealth).toBeUndefined();
  });

  it("keeps an orphaned request with a hand-written runtime block, and warns", async () => {
    await sync(BASIC, collectionDir);

    const filePath = path.join(collectionDir, "Health check.yml");
    const request = load(await readFile(filePath, "utf8")) as HttpRequest;
    request.runtime = { scripts: [{ type: "tests", code: "expect(res.status).toBe(200);" }] };
    await writeFile(filePath, dump(request), "utf8");
    const beforeContent = await readFile(filePath, "utf8");

    const result = await sync(WITHOUT_HEALTH, collectionDir);

    expect(await exists("Health check.yml")).toBe(true);
    expect(await readFile(filePath, "utf8")).toBe(beforeContent);

    expect(result.plan.skips).toHaveLength(1);
    expect(result.plan.skips[0]?.operationId).toBe("getHealth");
    expect(result.plan.warnings.some((w) => w.includes("getHealth") && w.includes("runtime"))).toBe(true);

    const state = await readYaml<SyncState>(".bruno-openapi-sync", "state.yml");
    expect(state.operations.getHealth?.filePath).toBe("Health check.yml");
  });

  it("keeps an orphaned request whose auth was hand-customized beyond its seeded default", async () => {
    await sync(BASIC, collectionDir);

    // getPetById has no auth scheme override, but listPets/createPet inherit the global
    // apiKey scheme. Simulate a customized auth on an operation, then remove it from the spec.
    const filePath = path.join(collectionDir, "pets", "List all pets.yml");
    const request = load(await readFile(filePath, "utf8")) as HttpRequest;
    request.http = {
      ...request.http,
      auth: { type: "apikey", key: "X-Api-Key", value: "sk_live_12345", placement: "header" },
    };
    await writeFile(filePath, dump(request), "utf8");

    const specWithoutListPets = fileURLToPath(
      new URL("./fixtures/specs/basic-without-list-pets.yaml", import.meta.url),
    );
    const result = await sync(specWithoutListPets, collectionDir);

    expect(await exists("pets", "List all pets.yml")).toBe(true);
    expect(result.plan.warnings.some((w) => w.includes("listPets") && w.includes("auth"))).toBe(true);
  });
});
