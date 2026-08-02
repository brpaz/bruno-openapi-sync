#!/usr/bin/env node
import { Command } from "commander";
import { sync } from "./index.js";
import { renderPlan } from "./apply/render.js";
import packageJson from "../package.json" with { type: "json" };

interface SyncCliOptions {
  spec: string;
  output: string;
  overwrite?: boolean;
  dryRun?: boolean;
}

const program = new Command();

program
  .name("bruno-openapi-sync")
  .description(
    "Sync an OpenAPI spec into a Bruno collection (OpenCollection YAML) without clobbering user-owned content.",
  )
  .version(packageJson.version, "-v, --version", "Output the current version");

program
  .command("sync")
  .description("Sync a Bruno collection from an OpenAPI spec")
  .requiredOption("--spec <pathOrUrl>", "Local file path or http(s):// URL to the OpenAPI spec")
  .requiredOption("--output <dir>", "Bruno collection directory to sync into")
  .option("--overwrite", "Make the spec win everywhere, suspending all field-ownership rules", false)
  .option("--dry-run", "Preview the sync plan without writing anything", false)
  .action(async (options: SyncCliOptions) => {
    try {
      const result = await sync(options.spec, options.output, {
        mode: options.overwrite ? "overwrite" : "normal",
        dryRun: options.dryRun,
      });

      console.log(renderPlan(result.plan, { dryRun: !result.applied }));
    } catch (err) {
      console.error(`bruno-openapi-sync: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

program.parse();
