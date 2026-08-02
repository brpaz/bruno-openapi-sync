import type { SyncPlan } from "../sync/plan.js";

/** Renders a SyncPlan to human-readable output — used for both `--dry-run` preview and
 * the summary printed after a real run. Covers every action type in the plan. */
export function renderPlan(plan: SyncPlan, options: { dryRun: boolean }): string {
  const verb = options.dryRun ? "Would" : "Did";
  const lines: string[] = [];

  if (plan.bootstrapCollection) {
    lines.push(`${verb} bootstrap opencollection.yml ("${plan.bootstrapCollection.name}")`);
  }
  for (const folder of plan.folders) {
    lines.push(`${verb} create folder.yml at ${folder.path}`);
  }
  for (const create of plan.creates) {
    lines.push(`${verb} create ${create.filePath}`);
  }
  for (const move of plan.moves) {
    lines.push(`${verb} move ${move.fromPath} -> ${move.toPath}`);
  }
  for (const update of plan.updates) {
    lines.push(`${verb} update ${update.filePath}`);
  }
  for (const del of plan.deletes) {
    lines.push(`${verb} delete ${del.filePath}`);
  }
  for (const skip of plan.skips) {
    lines.push(`${verb} skip deleting ${skip.filePath} (${skip.reason})`);
  }
  for (const env of plan.environments) {
    lines.push(`${verb} write environments/${env.fileName}`);
  }

  lines.push(
    `${plan.creates.length} created, ${plan.updates.length} updated, ${plan.moves.length} moved, ` +
      `${plan.deletes.length} deleted, ${plan.skips.length} skipped.`,
  );

  for (const warning of plan.warnings) {
    lines.push(`warning: ${warning}`);
  }

  return lines.join("\n");
}
