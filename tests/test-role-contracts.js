import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTRACTS_DIR = path.join(packageRoot, "skills", "workflow", "workflow-control", "references", "role-contracts");
const SKILL = path.join(packageRoot, "skills", "workflow", "workflow-control", "SKILL.md");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function stripFrontMatter(text) {
  const match = text.match(/^---\n[\s\S]*?\n---\n/);
  return (match ? text.slice(match[0].length) : text).trim();
}

export async function run(test) {
  const manifest = readJson(path.join(packageRoot, "harness.manifest.json"));

  await test("role contracts are the single source and live inside the workflow skill", () => {
    assert(manifest.assets.agents.length > 0, "manifest declares no agents");
    for (const agent of manifest.assets.agents) {
      assert(
        agent.source.startsWith("skills/workflow/workflow-control/references/role-contracts/"),
        `${agent.id} source must be a role contract, got ${agent.source}`
      );
      assert(fs.existsSync(path.join(packageRoot, agent.source)), `${agent.id} source missing: ${agent.source}`);
    }
    const legacy = path.join(packageRoot, "agents");
    if (fs.existsSync(legacy)) {
      const leftovers = fs.readdirSync(legacy, { recursive: true }).filter((entry) => typeof entry === "string");
      assert.deepEqual(leftovers, [], `agents/ still holds role sources: ${leftovers.join(", ")}`);
    }
  });

  await test("the workflow-control index lists every role exactly once and links to a real file", () => {
    const skill = fs.readFileSync(SKILL, "utf8");
    const section = skill.slice(skill.indexOf("## Role Contracts"), skill.indexOf("## Required Materials"));
    assert(section.length > 0, "workflow-control has no Role Contracts index");
    const linked = [...section.matchAll(/\]\(references\/role-contracts\/([a-z0-9-]+)\.md\)/g)].map((match) => match[1]);
    const declared = manifest.assets.agents.map((agent) => agent.runtimeName).sort();
    assert.deepEqual([...linked].sort(), declared, "index and manifest disagree about the role set");
    assert.equal(new Set(linked).size, linked.length, "index lists a role twice");
    for (const slug of linked) {
      assert(fs.existsSync(path.join(CONTRACTS_DIR, `${slug}.md`)), `index points at a missing contract: ${slug}`);
    }
  });

  await test("projected client agent files render from the contract body", () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "role-contract-"));
    try {
      execFileSync(
        process.execPath,
        [path.join(packageRoot, "bin", "harness-project.js"), "--target", target,
          "--clients", "codex", "--content", "subagents", "--json"],
        { cwd: packageRoot, encoding: "utf8" }
      );
      const rendered = path.join(target, ".codex", "agents");
      assert(fs.existsSync(rendered), "projection wrote no Codex agent files");
      for (const agent of manifest.assets.agents) {
        const file = path.join(rendered, `${agent.runtimeName}.toml`);
        assert(fs.existsSync(file), `missing projected agent: ${agent.runtimeName}`);
        const toml = fs.readFileSync(file, "utf8");
        const expected = stripFrontMatter(fs.readFileSync(path.join(packageRoot, agent.source), "utf8"))
          .replace(/'''/g, "\\'\\'\\'");
        assert(
          toml.includes(expected),
          `${agent.runtimeName}.toml body drifted from ${agent.source}; re-project after editing the contract`
        );
      }
    } finally {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  await test("no host registration remains for DSH roles", () => {
    const pkg = readJson(path.join(packageRoot, "package.json"));
    assert.equal(pkg.main, undefined, "package main still points at a host entry");
    assert.equal(pkg.dsh, undefined, "package still declares a dsh bundle");
    assert.equal(manifest.integrations, undefined, "manifest still declares integrations");
    assert.equal(fs.existsSync(path.join(packageRoot, "lib", "dsh")), false, "lib/dsh was not deleted");
  });

  await test("role contracts stay out of the always-on surface", () => {
    // The contracts are reference-only: no SKILL.md may inline a role body.
    for (const agent of manifest.assets.agents) {
      const body = stripFrontMatter(fs.readFileSync(path.join(packageRoot, agent.source), "utf8"));
      const probe = body.split("\n").filter((line) => line.trim().length > 60)[0];
      if (!probe) continue;
      for (const entry of fs.readdirSync(path.join(packageRoot, "skills"), { recursive: true })) {
        if (typeof entry !== "string" || !entry.endsWith("SKILL.md")) continue;
        const text = fs.readFileSync(path.join(packageRoot, "skills", entry), "utf8");
        assert(
          !text.includes(probe),
          `${entry} inlines the ${agent.runtimeName} contract; link to it instead of copying it`
        );
      }
    }
  });
}
