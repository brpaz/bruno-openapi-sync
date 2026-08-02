import { promises as fs } from "node:fs";
import path from "node:path";
import { dump, load } from "js-yaml";
import type { SyncState } from "./types.js";

const STATE_RELATIVE_PATH = path.join(".bruno-openapi-sync", "state.yml");

function statePath(collectionDir: string): string {
  return path.join(collectionDir, STATE_RELATIVE_PATH);
}

const EMPTY_STATE: SyncState = { version: 1, operations: {} };

/**
 * Reads the sync state sidecar (CONTEXT.md "Sync state"). A missing file means the
 * collection has never been synced (or the sidecar was lost) — treated as empty state,
 * not an error, and with no fuzzy-rebuild fallback.
 */
export async function readSyncState(collectionDir: string): Promise<SyncState> {
  let raw: string;
  try {
    raw = await fs.readFile(statePath(collectionDir), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...EMPTY_STATE, operations: {} };
    throw err;
  }

  const parsed = load(raw) as SyncState | undefined;
  if (!parsed || parsed.version !== 1 || typeof parsed.operations !== "object") {
    return { ...EMPTY_STATE, operations: {} };
  }
  return parsed;
}

export async function writeSyncState(collectionDir: string, state: SyncState): Promise<void> {
  const target = statePath(collectionDir);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, dump(state, { noRefs: true, lineWidth: -1 }), "utf8");
}
