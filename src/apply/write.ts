import { promises as fs } from "node:fs";
import path from "node:path";
import { writeYamlFile } from "../collection/yaml.js";
import { readSyncState, writeSyncState } from "../collection/state.js";
import type { OpenCollection } from "../collection/types.js";
import type { SyncPlan } from "../sync/plan.js";

/** Applies a SyncPlan to disk. Never called under `--dry-run`. */
export async function applyPlan(collectionDir: string, plan: SyncPlan): Promise<void> {
  if (plan.bootstrapCollection) {
    const root: OpenCollection = {
      opencollection: "1.0.0",
      info: { name: plan.bootstrapCollection.name },
    };
    await writeYamlFile(path.join(collectionDir, "opencollection.yml"), root);
  }

  for (const { path: folderPath, folder } of plan.folders) {
    await writeYamlFile(path.join(collectionDir, folderPath, "folder.yml"), folder);
  }

  for (const { fileName, environment } of plan.environments) {
    await writeYamlFile(path.join(collectionDir, "environments", fileName), environment);
  }

  for (const { filePath, request } of plan.creates) {
    await writeYamlFile(path.join(collectionDir, filePath), request);
  }

  for (const { filePath, request } of plan.updates) {
    await writeYamlFile(path.join(collectionDir, filePath), request);
  }

  for (const { filePath } of plan.deletes) {
    await fs.rm(path.join(collectionDir, filePath));
  }

  // The new-location file is already written above via plan.updates (a move's `filePath`
  // is its destination) — only the stale file at the old location needs removing. The
  // now-possibly-empty old folder is left alone; CONTEXT.md doesn't ask for cleanup there.
  for (const { fromPath } of plan.moves) {
    await fs.rm(path.join(collectionDir, fromPath));
  }

  // Skips leave the file and its state entry untouched — CONTEXT.md "Orphaned request".

  const state = await readSyncState(collectionDir);
  for (const { operationId, filePath, bodySchemaHash, generatedParamNames, generatedHeaderNames } of [
    ...plan.creates,
    ...plan.updates,
  ]) {
    state.operations[operationId] = {
      filePath,
      ...(bodySchemaHash ? { bodySchemaHash } : {}),
      generatedParamNames,
      generatedHeaderNames,
    };
  }
  for (const { operationId } of plan.deletes) {
    delete state.operations[operationId];
  }
  await writeSyncState(collectionDir, state);
}
