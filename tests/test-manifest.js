import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCurrentManifest } from "../lib/manifest/validate.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function run(test) {
  await test("manifest validates", () => {
    const result = validateCurrentManifest(packageRoot);
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
    assert.equal(result.summary.clients, 4);
    assert.equal(result.summary.commands, 6);
    assert.equal(result.summary.skills, 48);
    assert.equal(result.summary.agents, 11);
    assert.equal(result.summary.hooks, 6);
    assert.equal(result.summary.templates, 10);
  });

  await test("manifest uses core command names", () => {
    const text = fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8");
    assert.match(text, /harness-project/);
    assert.match(text, /harness-change-doc/);
    assert.match(text, /harness-change-validate/);
    assert.doesNotMatch(text, /dbackup-change-/i);
    assert.doesNotMatch(text, /quick-project/i);
  });

  await test("runtime skill sources are flat after category source", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8")
    );
    for (const skill of manifest.assets.skills) {
      assert.match(skill.runtimeName, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
      assert.doesNotMatch(skill.runtimeName, /\//);
    }
  });

  await test("third-party skills are optional manifest assets", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8")
    );
    const thirdParty = manifest.assets.skills.filter((skill) => skill.category === "third-party");
    assert.equal(thirdParty.length, 21);
    for (const skill of thirdParty) {
      assert.equal(skill.enabledByDefault, false, `${skill.id} should be opt-in`);
      assert.match(skill.source, /^skills\/third-party\//);
    }
    assert(thirdParty.some((skill) => skill.id === "glab"));
    assert(thirdParty.some((skill) => skill.id === "redmine"));
    assert(thirdParty.some((skill) => skill.id === "mermaid-diagrams"));
    assert(!manifest.assets.skills.some((skill) => skill.id === "pretty-mermaid"));
  });

  await test("slash command runtime names are namespaced", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8")
    );
    for (const command of manifest.assets.commands) {
      assert.match(command.runtimeName, /^harness\/[a-z][a-z0-9-]*$/);
      assert.equal(
        fs.existsSync(path.join(packageRoot, command.source)),
        true,
        `${command.id} source missing`
      );
    }
  });

  await test("install documentation includes templates in full projection", () => {
    const required = "--content rules,templates,skills,subagents,hooks";
    const readme = fs.readFileSync(path.join(packageRoot, "README.md"), "utf8");
    const agents = fs.readFileSync(path.join(packageRoot, "AGENTS.md"), "utf8");
    assert.equal(occurrences(readme, required), 7);
    assert.equal(occurrences(agents, required), 3);
  });
}

function occurrences(text, value) {
  return text.split(value).length - 1;
}
