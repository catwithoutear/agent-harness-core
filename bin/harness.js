#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hasFlag, parseArgs, printJson } from "../lib/cli/args.js";
import { validateCurrentManifest } from "../lib/manifest/validate.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const [subcommand] = args.positionals;

if (hasFlag(args, "help") || !subcommand) {
  process.stdout.write(`harness <command>\n\nCommands:\n  manifest   Validate and summarize harness.manifest.json\n`);
  process.exit(0);
}

if (subcommand === "manifest") {
  const result = validateCurrentManifest(packageRoot);
  if (hasFlag(args, "json")) {
    printJson({
      command: "harness manifest",
      manifestPath: result.manifestPath,
      ok: result.ok,
      summary: result.summary,
      errors: result.errors,
      warnings: result.warnings
    });
  } else {
    process.stdout.write(result.ok ? "manifest ok\n" : "manifest invalid\n");
    for (const error of result.errors) {
      process.stderr.write(`error: ${error}\n`);
    }
  }
  process.exit(result.ok ? 0 : 1);
}

process.stderr.write(`Unknown harness command: ${subcommand}\n`);
process.exit(2);
