import { access, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sync } from "../src/index.js";
import type { HttpRequest, SyncState } from "../src/collection/types.js";

const BASIC = fileURLToPath(new URL("./fixtures/specs/basic.yaml", import.meta.url));
const RETAGGED = fileURLToPath(new URL("./fixtures/specs/basic-retagged.yaml", import.meta.url));
const UNTAGGED = fileURLToPath(new URL("./fixtures/specs/basic-untagged-pet.yaml", import.meta.url));

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

describe("sync — folder placement follows tag changes", () => {
  it("moves a request from one folder to another when its first tag changes", async () => {
    await sync(BASIC, collectionDir);
    expect(await exists("pets", "Find pet by ID.yml")).toBe(true);

    const result = await sync(RETAGGED, collectionDir);

    expect(result.plan.moves).toEqual([
      {
        operationId: "getPetById",
        fromPath: path.join("pets", "Find pet by ID.yml"),
        toPath: path.join("animals", "Find pet by ID.yml"),
      },
    ]);
    expect(await exists("pets", "Find pet by ID.yml")).toBe(false);
    expect(await exists("animals", "Find pet by ID.yml")).toBe(true);
    expect(await exists("animals", "folder.yml")).toBe(true);

    const request = await readYaml<HttpRequest>("animals", "Find pet by ID.yml");
    expect(request.info?.tags).toEqual(["animals"]);
    expect(request.info?.name).toBe("Find pet by ID");

    const state = await readYaml<SyncState>(".bruno-openapi-sync", "state.yml");
    expect(state.operations.getPetById?.filePath).toBe(path.join("animals", "Find pet by ID.yml"));

    // old folder still has the other pets requests — untouched, not deleted just because
    // one file moved out of it.
    const petsDir = await readdir(path.join(collectionDir, "pets"));
    expect(petsDir).toContain("folder.yml");
  });

  it("moves a request from a folder to the collection root when it becomes untagged", async () => {
    await sync(BASIC, collectionDir);

    const result = await sync(UNTAGGED, collectionDir);

    expect(result.plan.moves).toEqual([
      {
        operationId: "getPetById",
        fromPath: path.join("pets", "Find pet by ID.yml"),
        toPath: "Find pet by ID.yml",
      },
    ]);
    expect(await exists("pets", "Find pet by ID.yml")).toBe(false);
    expect(await exists("Find pet by ID.yml")).toBe(true);

    const request = await readYaml<HttpRequest>("Find pet by ID.yml");
    expect(request.info?.tags).toBeUndefined();
  });

  it("is stable after a move: re-syncing the same (retagged) spec produces no further move", async () => {
    await sync(BASIC, collectionDir);
    await sync(RETAGGED, collectionDir);

    const result = await sync(RETAGGED, collectionDir);

    expect(result.plan.moves).toEqual([]);
    expect(await exists("animals", "Find pet by ID.yml")).toBe(true);
  });

  it("does not rewrite an already-existing folder.yml for a folder nothing moved into", async () => {
    await sync(BASIC, collectionDir);
    const petsFolderBefore = await readFile(path.join(collectionDir, "pets", "folder.yml"), "utf8");

    await sync(RETAGGED, collectionDir);

    const petsFolderAfter = await readFile(path.join(collectionDir, "pets", "folder.yml"), "utf8");
    expect(petsFolderAfter).toBe(petsFolderBefore);
  });
});
