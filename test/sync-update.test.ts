import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dump, load } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sync } from "../src/index.js";
import type { HttpRequest, SyncState } from "../src/collection/types.js";

const FIXTURE_SPEC = fileURLToPath(new URL("./fixtures/specs/basic.yaml", import.meta.url));

let collectionDir: string;

beforeEach(async () => {
  collectionDir = await mkdtemp(path.join(tmpdir(), "bruno-openapi-sync-"));
});

afterEach(async () => {
  await rm(collectionDir, { recursive: true, force: true });
});

async function snapshot(): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  await walk(collectionDir, "");
  return files;

  async function walk(dir: string, relative: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else {
        files.set(rel, await readFile(abs, "utf8"));
      }
    }
  }
}

async function readYaml<T>(...segments: string[]): Promise<T> {
  const raw = await readFile(path.join(collectionDir, ...segments), "utf8");
  return load(raw) as T;
}

describe("sync — re-sync against an already-synced collection", () => {
  it("is idempotent: re-syncing with no spec changes produces byte-identical output", async () => {
    await sync(FIXTURE_SPEC, collectionDir);
    const before = await snapshot();

    await sync(FIXTURE_SPEC, collectionDir);
    const after = await snapshot();

    expect(after).toEqual(before);
  });

  it("preserves a hand-edited runtime block and a custom top-level key", async () => {
    await sync(FIXTURE_SPEC, collectionDir);

    const filePath = path.join(collectionDir, "pets", "List all pets.yml");
    const request = load(await readFile(filePath, "utf8")) as HttpRequest & Record<string, unknown>;
    request.runtime = { scripts: [{ type: "tests", code: "expect(res.status).toBe(200);" }] };
    (request as Record<string, unknown>).myCustomNote = "keep me";
    await writeFile(filePath, dump(request), "utf8");

    await sync(FIXTURE_SPEC, collectionDir);

    const updated = await readYaml<HttpRequest & Record<string, unknown>>("pets", "List all pets.yml");
    expect(updated.runtime).toEqual({ scripts: [{ type: "tests", code: "expect(res.status).toBe(200);" }] });
    expect(updated.myCustomNote).toBe("keep me");
    // generated fields still correct, regenerated as a no-op
    expect(updated.info?.name).toBe("List all pets");
    expect(updated.http?.method).toBe("GET");
  });

  it("never touches an unrecognized hand-written file, and creates a second file instead of overwriting it", async () => {
    // Plant a hand-written file at the exact path sync would naturally generate for
    // "listPets" — no sync state entry for it, so it's invisible to sync (adoption rule).
    await mkdir(path.join(collectionDir, "pets"), { recursive: true });
    const handWrittenPath = path.join(collectionDir, "pets", "List all pets.yml");
    const handWrittenContent = "myCustomField: hello, not a real bruno request\n";
    await writeFile(handWrittenPath, handWrittenContent, "utf8");

    await sync(FIXTURE_SPEC, collectionDir);

    // Original untouched, byte-for-byte.
    expect(await readFile(handWrittenPath, "utf8")).toBe(handWrittenContent);

    // A second file was created for the same operation instead of merging into the original.
    const petsDir = await readdir(path.join(collectionDir, "pets"));
    expect(petsDir).toContain("List all pets (GET).yml");

    const state = await readYaml<SyncState>(".bruno-openapi-sync", "state.yml");
    expect(state.operations.listPets?.filePath).toBe(path.join("pets", "List all pets (GET).yml"));
  });

  it("warns when a request body schema changed since last sync but leaves http.body untouched", async () => {
    await sync(FIXTURE_SPEC, collectionDir);

    const changedSpecPath = fileURLToPath(
      new URL("./fixtures/specs/basic-changed-body.yaml", import.meta.url),
    );
    const before = await readYaml<HttpRequest>("pets", "Create a pet.yml");

    const result = await sync(changedSpecPath, collectionDir);

    const after = await readYaml<HttpRequest>("pets", "Create a pet.yml");
    expect(after.http?.body).toEqual(before.http?.body);
    expect(result.plan.warnings.some((w) => w.includes("createPet"))).toBe(true);
  });
});
