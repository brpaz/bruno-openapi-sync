import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dump, load } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sync } from "../src/index.js";
import type { HttpRequest } from "../src/collection/types.js";

const BASIC = fileURLToPath(new URL("./fixtures/specs/basic.yaml", import.meta.url));
const WITH_HEADER = fileURLToPath(new URL("./fixtures/specs/basic-with-header.yaml", import.meta.url));
const ADDED_PARAM = fileURLToPath(new URL("./fixtures/specs/basic-added-param.yaml", import.meta.url));

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

describe("sync — param/header per-entry diffing", () => {
  it("keeps a user-added header while a spec-defined header is appended", async () => {
    await sync(BASIC, collectionDir);

    const filePath = path.join(collectionDir, "pets", "Find pet by ID.yml");
    const request = load(await readFile(filePath, "utf8")) as HttpRequest;
    request.http = { ...request.http, headers: [{ name: "X-Debug-Trace", value: "on" }] };
    await writeFile(filePath, dump(request), "utf8");

    await sync(WITH_HEADER, collectionDir);

    const updated = await readYaml<HttpRequest>("pets", "Find pet by ID.yml");
    expect(updated.http?.headers).toEqual([
      { name: "X-Debug-Trace", value: "on" },
      { name: "X-Trace-Id", value: "", description: "Correlation id" },
    ]);
  });

  it("is stable on a second sync with no further spec change", async () => {
    await sync(BASIC, collectionDir);
    const filePath = path.join(collectionDir, "pets", "Find pet by ID.yml");
    const request = load(await readFile(filePath, "utf8")) as HttpRequest;
    request.http = { ...request.http, headers: [{ name: "X-Debug-Trace", value: "on" }] };
    await writeFile(filePath, dump(request), "utf8");

    await sync(WITH_HEADER, collectionDir);
    const afterFirst = await readFile(filePath, "utf8");

    await sync(WITH_HEADER, collectionDir);
    const afterSecond = await readFile(filePath, "utf8");

    expect(afterSecond).toBe(afterFirst);
  });

  it("appends a newly-added required spec param to an existing request", async () => {
    await sync(BASIC, collectionDir);

    await sync(ADDED_PARAM, collectionDir);

    const request = await readYaml<HttpRequest>("pets", "List all pets.yml");
    expect(request.http?.params).toEqual([
      { name: "limit", value: "", type: "query", description: "Max number of results" },
      { name: "sort", value: "", type: "query", description: "Sort order" },
    ]);
  });

  it("regenerates a spec-matched param's value/required/type even if the user had edited it", async () => {
    await sync(BASIC, collectionDir);

    const filePath = path.join(collectionDir, "pets", "List all pets.yml");
    const request = load(await readFile(filePath, "utf8")) as HttpRequest;
    const limitParam = request.http?.params?.find((p) => p.name === "limit");
    if (limitParam) limitParam.value = "50"; // user typed in a real test value
    await writeFile(filePath, dump(request), "utf8");

    await sync(BASIC, collectionDir);

    const updated = await readYaml<HttpRequest>("pets", "List all pets.yml");
    // spec-matched entries are fully regenerated, including value — only entirely
    // user-added (unmatched-name) entries are preserved verbatim (CONTEXT.md "Param/header entry")
    expect(updated.http?.params).toEqual([
      { name: "limit", value: "", type: "query", description: "Max number of results" },
    ]);
  });
});
