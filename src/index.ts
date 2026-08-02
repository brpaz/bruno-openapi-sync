import { promises as fs } from "node:fs";
import path from "node:path";
import { loadSpec } from "./spec/load.js";
import { flattenOperations } from "./spec/operations.js";
import { scanCollection, scanExistingFiles } from "./collection/scan.js";
import { buildPlan } from "./sync/build-plan.js";
import { applyPlan } from "./apply/write.js";
import type { SyncMode } from "./sync/fields.js";
import type { SyncPlan } from "./sync/plan.js";

export interface SyncOptions {
  mode?: SyncMode;
  dryRun?: boolean;
}

export interface SyncResult {
  plan: SyncPlan;
  applied: boolean;
}

/** The one library seam — CLI and tests both call this directly (spec.md "Testing Decisions"). */
export async function sync(
  specPathOrUrl: string,
  collectionDir: string,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const mode = options.mode ?? "normal";
  const dryRun = options.dryRun ?? false;

  const document = await loadSpec(specPathOrUrl);
  const operations = flattenOperations(document);
  const existingIndex = await scanCollection(collectionDir);
  const existingFiles = await scanExistingFiles(collectionDir);

  const collectionHasOpencollectionYml = await pathExists(path.join(collectionDir, "opencollection.yml"));
  const collectionHasEnvironments = await directoryHasFiles(path.join(collectionDir, "environments"));
  const collectionName = document.info?.title?.trim() || path.basename(path.resolve(collectionDir));

  const plan = buildPlan({
    document,
    operations,
    existingIndex,
    existingFiles,
    mode,
    collectionHasOpencollectionYml,
    collectionHasEnvironments,
    collectionName,
  });

  if (!dryRun) {
    await applyPlan(collectionDir, plan);
  }

  return { plan, applied: !dryRun };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function directoryHasFiles(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir);
    return entries.length > 0;
  } catch {
    return false;
  }
}

export type { SyncState } from "./collection/types.js";
export type { SyncPlan } from "./sync/plan.js";
