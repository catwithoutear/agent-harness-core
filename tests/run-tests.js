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

if (all || requested.has("--context-receipt")) {
  const module = await import("./test-context-receipt.js");
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

if (all || requested.has("--review-records")) {
  const module = await import("./test-review-records.js");
  await module.run(run);
}

if (all || requested.has("--review-subject-input")) {
  const module = await import("./test-review-subject-input.js");
  await module.run(run);
}

if (all || requested.has("--review-gates")) {
  const module = await import("./test-review-gates.js");
  await module.run(run);
}

if (all || requested.has("--review-authority")) {
  const module = await import("./test-review-authority.js");
  await module.run(run);
}

if (all || requested.has("--review-dimensions")) {
  const module = await import("./test-review-dimensions.js");
  await module.run(run);
}

if (all || requested.has("--review-surface")) {
  const module = await import("./test-review-surface.js");
  await module.run(run);
}

if (all || requested.has("--review-store")) {
  const module = await import("./test-review-store.js");
  await module.run(run);
}

if (all || requested.has("--review-retry")) {
  const module = await import("./test-review-retry.js");
  await module.run(run);
}

if (all || requested.has("--review-context")) {
  const module = await import("./test-review-context.js");
  await module.run(run);
}

if (all || requested.has("--review-obligations")) {
  const module = await import("./test-review-obligations.js");
  await module.run(run);
}

if (all || requested.has("--review-dispatch")) {
  const module = await import("./test-review-dispatch.js");
  await module.run(run);
}

if (all || requested.has("--review-provider")) {
  const module = await import("./test-review-provider.js");
  await module.run(run);
}

if (all || requested.has("--review-discovery")) {
  const module = await import("./test-review-discovery.js");
  await module.run(run);
}

if (all || requested.has("--review-output")) {
  const module = await import("./test-review-output.js");
  await module.run(run);
}

if (all || requested.has("--review-integration")) {
  const module = await import("./test-review-integration.js");
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

if (all || requested.has("--zcode-hooks")) {
  const module = await import("./test-zcode-hooks.js");
  await module.run(run);
}

if (failures > 0) {
  process.stderr.write(`${failures} test(s) failed\n`);
  process.exit(1);
}

process.stdout.write("all requested tests passed\n");
