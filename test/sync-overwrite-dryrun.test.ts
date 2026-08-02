import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dump, load } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sync } from "../src/index.js";
import type { HttpRequest } from "../src/collection/types.js";

const BASIC = fileURLToPath(new URL("./fixtures/specs/basic.yaml", import.meta.url));
const DRY_RUN_SCENARIO = fileURLToPath(
  new URL("./fixtures/specs/basic-dry-run-scenario.yaml", import.meta.url),
);

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
      if (entry.isDirectory()) await walk(abs, rel);
      else files.set(rel, await readFile(abs, "utf8"));
    }
  }
}

async function readYaml<T>(...segments: string[]): Promise<T> {
  const raw = await readFile(path.join(collectionDir, ...segments), "utf8");
  return load(raw) as T;
}

describe("sync — --overwrite", () => {
  it("reverts every hand-edit (auth, body, wholesale-replaced headers, reassigned seq) but keeps runtime scripts", async () => {
    await sync(BASIC, collectionDir);

    const filePath = path.join(collectionDir, "pets", "Create a pet.yml");
    const request = load(await readFile(filePath, "utf8")) as HttpRequest;
    request.http = {
      ...request.http,
      auth: { type: "apikey", key: "X-Api-Key", value: "concrete-token", placement: "header" },
      body: { type: "json", data: '{"hand":"edited"}' },
      headers: [{ name: "X-Custom", value: "1" }],
    };
    request.runtime = { scripts: [{ type: "tests", code: "expect(res.status).toBe(201);" }] };
    request.info = { ...request.info, seq: 99 };
    await writeFile(filePath, dump(request), "utf8");

    await sync(BASIC, collectionDir, { mode: "overwrite" });

    const updated = await readYaml<HttpRequest>("pets", "Create a pet.yml");
    expect(updated.http?.auth).toEqual({
      type: "apikey",
      key: "X-Api-Key",
      value: "{{X-Api-Key}}",
      placement: "header",
    });
    expect(updated.http?.body).toEqual({
      type: "json",
      data: JSON.stringify({ name: "", tag: "" }, null, 2),
    });
    expect(updated.http?.headers).toBeUndefined(); // wholesale replace: spec defines no headers for createPet
    expect(updated.info?.seq).toBe(2); // reassigned in spec order, not left at the hand-edited 99
    // runtime isn't a seeded/generated field even under overwrite — CONTEXT.md "Overwrite mode"
    // suspends generated/seeded rules, there's no spec equivalent for hand-written scripts.
    expect(updated.runtime).toEqual({ scripts: [{ type: "tests", code: "expect(res.status).toBe(201);" }] });
  });
});

describe("sync — --dry-run", () => {
  it("produces zero filesystem changes and a plan covering every action type", async () => {
    await sync(BASIC, collectionDir);

    // Give getHealth user content so it becomes a skip rather than a delete once removed
    // from the spec, alongside a plain (content-free) delete for createPet.
    const healthPath = path.join(collectionDir, "Health check.yml");
    const health = load(await readFile(healthPath, "utf8")) as HttpRequest;
    health.runtime = { scripts: [{ type: "tests", code: "expect(res.status).toBe(200);" }] };
    await writeFile(healthPath, dump(health), "utf8");

    const before = await snapshot();

    const result = await sync(DRY_RUN_SCENARIO, collectionDir, { dryRun: true });

    const after = await snapshot();
    expect(after).toEqual(before); // zero writes

    expect(result.applied).toBe(false);
    expect(result.plan.creates).toHaveLength(1); // deletePet
    expect(result.plan.updates).toHaveLength(2); // listPets, getPetById
    expect(result.plan.moves).toHaveLength(1); // getPetById: pets -> animals
    expect(result.plan.deletes).toHaveLength(1); // createPet, no user content
    expect(result.plan.skips).toHaveLength(1); // getHealth, has runtime content

    const { renderPlan } = await import("../src/apply/render.js");
    const rendered = renderPlan(result.plan, { dryRun: true });
    expect(rendered).toContain("Would create");
    expect(rendered).toContain("Would update");
    expect(rendered).toContain("Would move");
    expect(rendered).toContain("Would delete");
    expect(rendered).toContain("Would skip deleting");
  });
});
