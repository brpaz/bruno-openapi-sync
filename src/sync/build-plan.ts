import path from "node:path";
import type { Operation } from "../spec/operations.js";
import type { OpenApiDocument } from "../spec/load.js";
import type { ExistingFilesSnapshot, ExistingRequestFile } from "../collection/scan.js";
import { folderNameForOperation, requestFileName, sanitizeFileName } from "../collection/naming.js";
import { hashSchema } from "../collection/hash.js";
import { reconcileRequest, type SyncMode } from "./fields.js";
import { classifyOrphan } from "./orphans.js";
import type { SyncPlan } from "./plan.js";

export interface BuildPlanInput {
  document: OpenApiDocument;
  operations: Operation[];
  existingIndex: Map<string, ExistingRequestFile>;
  existingFiles: ExistingFilesSnapshot;
  mode: SyncMode;
  collectionHasOpencollectionYml: boolean;
  collectionHasEnvironments: boolean;
  collectionName: string;
}

/** Normalizes `path.dirname()`'s "." for a root-level file to "" — matches the folder-key
 * convention used everywhere else (folderNameForOperation returns null at root). */
function currentFolderKey(filePath: string): string {
  const dir = path.dirname(filePath);
  return dir === "." ? "" : dir;
}

/**
 * Builds the sync plan: matched operations (present in `existingIndex`) become updates
 * that keep their current file path, unless the operation's first tag no longer matches
 * the folder the file currently lives in — then it becomes a move (CONTEXT.md "Folder
 * placement"). Unmatched operations become creates. Unrecognized on-disk files (not in
 * `existingIndex`) are never read, referenced, or touched (CONTEXT.md "Adoption").
 */
export function buildPlan(input: BuildPlanInput): SyncPlan {
  const {
    document,
    operations,
    existingIndex,
    existingFiles,
    mode,
    collectionHasOpencollectionYml,
    collectionHasEnvironments,
    collectionName,
  } = input;

  const plan: SyncPlan = {
    bootstrapCollection: collectionHasOpencollectionYml ? null : { name: collectionName },
    folders: [],
    creates: [],
    updates: [],
    moves: [],
    deletes: [],
    skips: [],
    warnings: [],
    environments: [],
  };

  const folderSeqByName = new Map<string, number>();
  const usedNamesByFolder = new Map<string, Set<string>>();
  let nextFolderSeq = 1;
  let nextRequestSeq = 1;

  /** Queues a folder.yml write only for a folder that doesn't already have one on disk —
   * an already-existing folder.yml is left untouched, same as an unmoved request file. */
  function ensureFolder(folderName: string | null): void {
    if (!folderName) return;
    if (existingFiles.folderPaths.has(folderName)) return;
    if (folderSeqByName.has(folderName)) return;

    const seq = nextFolderSeq++;
    folderSeqByName.set(folderName, seq);
    plan.folders.push({ path: folderName, folder: { info: { name: folderName, type: "folder", seq } } });
  }

  function usedNamesFor(folderKey: string): Set<string> {
    const existing = usedNamesByFolder.get(folderKey);
    if (existing) return existing;
    const seeded = new Set<string>(existingFiles.fileNamesByFolder.get(folderKey) ?? []);
    usedNamesByFolder.set(folderKey, seeded);
    return seeded;
  }

  for (const op of operations) {
    const existingEntry = existingIndex.get(op.operationId);
    const newBodySchemaHash = hashSchema(op.requestBodySchema);

    if (existingEntry) {
      if (
        mode === "normal" &&
        existingEntry.bodySchemaHash &&
        newBodySchemaHash &&
        existingEntry.bodySchemaHash !== newBodySchemaHash
      ) {
        plan.warnings.push(
          `Request body schema for "${op.operationId}" changed since last sync; ` +
            `http.body at ${existingEntry.filePath} was left untouched (edit by hand or use --overwrite).`,
        );
      }

      const updateSeq = mode === "overwrite" ? nextRequestSeq++ : 0;
      const request = reconcileRequest(op, existingEntry.request, mode, updateSeq);
      const desiredFolderName = folderNameForOperation(op.tags);
      const desiredFolderKey = desiredFolderName ?? "";

      let filePath = existingEntry.filePath;
      if (currentFolderKey(existingEntry.filePath) !== desiredFolderKey) {
        ensureFolder(desiredFolderName);

        const usedNames = usedNamesFor(desiredFolderKey);
        const baseName = path.basename(existingEntry.filePath, ".yml");
        let fileName: string;
        if (usedNames.has(baseName)) {
          fileName = requestFileName(op, usedNames); // destination already has that name — disambiguate
        } else {
          usedNames.add(baseName);
          fileName = `${baseName}.yml`;
        }
        filePath = desiredFolderName ? path.join(desiredFolderName, fileName) : fileName;

        plan.moves.push({ operationId: op.operationId, fromPath: existingEntry.filePath, toPath: filePath });
      }

      plan.updates.push({
        operationId: op.operationId,
        filePath,
        request,
        ...(newBodySchemaHash ? { bodySchemaHash: newBodySchemaHash } : {}),
        generatedParamNames: op.params.map((p) => p.name),
        generatedHeaderNames: op.headers.map((h) => h.name),
      });
      continue;
    }

    const folderName = folderNameForOperation(op.tags);
    ensureFolder(folderName);

    const folderKey = folderName ?? "";
    const usedNames = usedNamesFor(folderKey);

    const fileName = requestFileName(op, usedNames);
    const filePath = folderName ? path.join(folderName, fileName) : fileName;

    const request = reconcileRequest(op, null, mode, nextRequestSeq++);
    plan.creates.push({
      operationId: op.operationId,
      filePath,
      request,
      ...(newBodySchemaHash ? { bodySchemaHash: newBodySchemaHash } : {}),
      generatedParamNames: op.params.map((p) => p.name),
      generatedHeaderNames: op.headers.map((h) => h.name),
    });
  }

  const specOperationIds = new Set(operations.map((op) => op.operationId));
  for (const [operationId, existingEntry] of existingIndex) {
    if (specOperationIds.has(operationId)) continue;

    const classification = classifyOrphan(existingEntry);
    if (classification.hasUserOwnedContent && mode === "normal") {
      plan.skips.push({
        operationId,
        filePath: existingEntry.filePath,
        reason: classification.reasons.join("; "),
      });
      plan.warnings.push(
        `Kept orphaned request at ${existingEntry.filePath} (operation "${operationId}" is no longer in the spec) — ${classification.reasons.join("; ")}.`,
      );
    } else {
      plan.deletes.push({ operationId, filePath: existingEntry.filePath });
      if (classification.hasUserOwnedContent) {
        plan.warnings.push(
          `Deleted orphaned request at ${existingEntry.filePath} despite user-owned content, because --overwrite was used — ${classification.reasons.join("; ")}.`,
        );
      }
    }
  }

  if (!collectionHasEnvironments || mode === "overwrite") {
    const servers = document.servers ?? [];
    servers.forEach((server, index) => {
      const name = server.description?.trim() || `Environment ${index + 1}`;
      plan.environments.push({
        fileName: `${sanitizeFileName(name)}.yml`,
        environment: { name, variables: [{ name: "baseUrl", value: server.url }] },
      });
    });
  }

  return plan;
}
