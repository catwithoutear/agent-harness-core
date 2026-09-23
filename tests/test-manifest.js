import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCurrentManifest, validateManifest } from "../lib/manifest/validate.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function run(test) {
  await test("manifest validates", () => {
    const result = validateCurrentManifest(packageRoot);
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
    assert.equal(result.summary.clients, 5);
    assert.equal(result.summary.commands, 6);
    assert.equal(result.summary.skills, 51);
    assert.equal(result.summary.agents, 11);
    assert.equal(result.summary.hooks, 6);
    assert.equal(result.summary.templates, 9);
  });

  await test("ZCode descriptor uses shared public paths and native agent paths", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8")
    );
    const zcode = manifest.clients.zcode;
    assert(zcode, "ZCode client descriptor missing");
    assert.deepEqual(zcode.targets.project.skills, [".agents/skills/<runtimeName>/"]);
    assert.deepEqual(zcode.targets.global.skills, ["~/.agents/skills/<runtimeName>/"]);
    assert.deepEqual(zcode.targets.project.commands, [".agents/commands/<runtimeName>.md"]);
    assert.deepEqual(zcode.targets.global.commands, ["~/.agents/commands/<runtimeName>.md"]);
    assert.deepEqual(zcode.targets.project.agents, [".zcode/agents/<runtimeName>.md"]);
    assert.deepEqual(zcode.targets.global.agents, ["~/.zcode/agents/<runtimeName>.md"]);
    assert.deepEqual(zcode.targets.project.config, [".zcode/config.json"]);
    assert.deepEqual(zcode.targets.global.config, ["~/.zcode/cli/config.json"]);
    assert.deepEqual(zcode.targets.project.hooks, [".zcode/config.json#hooks"]);
    assert.deepEqual(zcode.targets.global.hooks, ["~/.zcode/cli/config.json#hooks"]);
    assert.equal(zcode.capabilities.skills, true);
    assert.equal(zcode.capabilities.subagents, true);
    assert.deepEqual(zcode.capabilities.commands, { project: true, global: true });
    assert.equal(zcode.capabilities.config, true);

    for (const kind of ["rules", "commands", "skills", "agents", "templates"]) {
      for (const asset of manifest.assets[kind]) {
        assert(asset.clients.includes("zcode"), `${kind}/${asset.id} misses ZCode binding`);
      }
    }
    const supportedZCodeHooks = new Set([
      "session-bootstrap",
      "active-change-guard",
      "tool-safety-guard",
      "regulated-structure-guard",
      "projection-health-check"
    ]);
    for (const hook of manifest.assets.hooks) {
      assert.equal(
        hook.clients.includes("zcode"),
        supportedZCodeHooks.has(hook.id),
        `${hook.id} has an unexpected ZCode support state`
      );
    }
    assert(
      manifest.assets.skills.every((skill) =>
        !skill.clients.includes("zcode") ||
        zcode.targets.project.skills.every((target) => !target.includes(".zcode/skills"))
      )
    );
  });

  await test("Hook metadata accepts the reviewed generic shape and rejects invalid enums", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8")
    );
    const metadata = {
      support: "native",
      event: "SessionStart",
      matcher: null,
      effect: "additionalContext",
      adapter_runtime_name: "zcode-context-adapter@1"
    };
    const validManifest = {
      ...manifest,
      clients: {
        ...manifest.clients,
        zcode: {
          ...manifest.clients.zcode,
          capabilities: {
            ...manifest.clients.zcode.capabilities,
            hooks: {
              ...manifest.clients.zcode.capabilities.hooks,
              "session-bootstrap": metadata
            }
          }
        }
      }
    };
    const valid = validateManifest(validManifest, { packageRoot });
    assert.equal(valid.ok, true, valid.errors.join("\n"));

    for (const [field, value] of [
      ["support", "future"],
      ["event", "PreCompact"],
      ["matcher", 42],
      ["effect", "deny"],
      ["adapter_runtime_name", ""]
    ]) {
      const invalidManifest = {
        ...validManifest,
        clients: {
          ...validManifest.clients,
          zcode: {
            ...validManifest.clients.zcode,
            capabilities: {
              ...validManifest.clients.zcode.capabilities,
              hooks: {
                ...validManifest.clients.zcode.capabilities.hooks,
                "session-bootstrap": { ...metadata, [field]: value }
              }
            }
          }
        }
      };
      const invalid = validateManifest(invalidManifest, { packageRoot });
      assert.equal(invalid.ok, false, `${field} should be rejected`);
      assert(
        invalid.errors.some((error) =>
          error.includes(`client zcode capabilities.hooks.session-bootstrap.${field}`)
        )
      );
    }
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
    assert.equal(thirdParty.length, 23);
    for (const skill of thirdParty) {
      assert.equal(skill.enabledByDefault, false, `${skill.id} should be opt-in`);
      assert.match(skill.source, /^skills\/third-party\//);
    }
    assert(thirdParty.some((skill) => skill.id === "glab"));
    assert(thirdParty.some((skill) => skill.id === "redmine"));
    assert(thirdParty.some((skill) => skill.id === "mermaid-diagrams"));
    assert(thirdParty.some((skill) => skill.id === "environment-profile-vault"));
    const pveVmOperations = thirdParty.find((skill) => skill.id === "pve-vm-operations");
    assert(pveVmOperations);
    assert(
      pveVmOperations.requires.some((requirement) =>
        requirement.includes("environment-profile-vault")
      )
    );
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
