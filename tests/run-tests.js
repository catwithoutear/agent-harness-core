#!/usr/bin/env node
import process from "node:process";

const requested = new Set(process.argv.slice(2));
const all = requested.size === 0;

let failures = 0;

async function run(name, fn) {
  try {
    await fn();
    process.stdout.write(`ok - ${name}\n`);
  } catch (error) {
    failures += 1;
    process.stderr.write(`not ok - ${name}\n${error.stack ?? error.message}\n`);
  }
}

if (all || requested.has("--manifest")) {
  const module = await import("./test-manifest.js");
  await module.run(run);
}

if (all || requested.has("--change-tools")) {
  const module = await import("./test-change-tools.js");
  await module.run(run);
}

if (all || requested.has("--projection")) {
  const module = await import("./test-projection.js");
  await module.run(run);
}

if (all || requested.has("--skills")) {
  const module = await import("./test-skills.js");
  await module.run(run);
}

if (all || requested.has("--environment-profile-vault")) {
  const module = await import("./test-environment-profile-vault.js");
  await module.run(run);
}

if (all || requested.has("--review-target")) {
  const module = await import("./test-review-target.js");
  await module.run(run);
}

if (all || requested.has("--review-run")) {
  const module = await import("./test-review-run.js");
  await module.run(run);
}

if (all || requested.has("--subagents") || requested.has("--hooks")) {
  const module = await import("./test-subagents-hooks.js");
  await module.run(run);
}

if (failures > 0) {
  process.stderr.write(`${failures} test(s) failed\n`);
  process.exit(1);
}

process.stdout.write("all requested tests passed\n");
