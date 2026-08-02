import { promises as fs } from "node:fs";
import path from "node:path";
import { load } from "js-yaml";
import { readSyncState } from "./state.js";
import type { HttpRequest } from "./types.js";

export interface ExistingRequestFile {
  operationId: string;
  filePath: string;
  request: HttpRequest;
  bodySchemaHash?: string;
  generatedParamNames?: string[];
  generatedHeaderNames?: string[];
}

/**
 * Builds the match-key index from the sync-state sidecar only — never from a field
 * inside the request files (see ADR-0002). An operationId not present here is invisible
 * to the rest of the pipeline; a request tracked in state but missing on disk is treated
 * as gone, not fatal (CONTEXT.md "Adoption", "Orphaned request").
 */
export async function scanCollection(collectionDir: string): Promise<Map<string, ExistingRequestFile>> {
  const state = await readSyncState(collectionDir);
  const index = new Map<string, ExistingRequestFile>();

  for (const [operationId, entry] of Object.entries(state.operations)) {
    let raw: string;
    try {
      raw = await fs.readFile(path.join(collectionDir, entry.filePath), "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }

    const request = load(raw) as HttpRequest;
    index.set(operationId, {
      operationId,
      filePath: entry.filePath,
      request,
      ...(entry.bodySchemaHash ? { bodySchemaHash: entry.bodySchemaHash } : {}),
      ...(entry.generatedParamNames ? { generatedParamNames: entry.generatedParamNames } : {}),
      ...(entry.generatedHeaderNames ? { generatedHeaderNames: entry.generatedHeaderNames } : {}),
    });
  }

  return index;
}

const IGNORED_ROOT_ENTRIES = new Set(["environments", ".bruno-openapi-sync", "opencollection.yml"]);
const YAML_SUFFIX = ".yml";

export interface ExistingFilesSnapshot {
  /** Relative folder path ("" for root) -> basenames (w/o `.yml`) of request files present now. */
  fileNamesByFolder: Map<string, Set<string>>;
  /** Relative folder paths that already have a `folder.yml` on disk. */
  folderPaths: Set<string>;
}

/**
 * Walks the collection directory for what actually exists on disk right now, regardless
 * of what sync state tracks. Used for two things: keeping a newly-created or moved file
 * from colliding with (and silently overwriting) an unrecognized hand-written file, and
 * knowing which folders already have a `folder.yml` so sync never rewrites — and resets
 * the seq of — a folder it didn't just create (CONTEXT.md "Folder placement").
 */
export async function scanExistingFiles(collectionDir: string): Promise<ExistingFilesSnapshot> {
  const fileNamesByFolder = new Map<string, Set<string>>();
  const folderPaths = new Set<string>();
  await walk(collectionDir, "");
  return { fileNamesByFolder, folderPaths };

  async function walk(absoluteDir: string, relativeFolder: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    } catch {
      return;
    }

    const names = new Set<string>();
    for (const entry of entries) {
      if (relativeFolder === "" && IGNORED_ROOT_ENTRIES.has(entry.name)) continue;

      if (entry.isDirectory()) {
        const childRelative = path.join(relativeFolder, entry.name);
        try {
          await fs.access(path.join(absoluteDir, entry.name, "folder.yml"));
          folderPaths.add(childRelative);
        } catch {
          // no folder.yml yet — fine, sync will create one if this folder is used.
        }
        await walk(path.join(absoluteDir, entry.name), childRelative);
      } else if (entry.name.endsWith(YAML_SUFFIX) && entry.name !== "folder.yml") {
        names.add(entry.name.slice(0, -YAML_SUFFIX.length));
      }
    }
    fileNamesByFolder.set(relativeFolder, names);
  }
}
