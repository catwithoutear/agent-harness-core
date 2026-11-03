import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
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
    assert.equal(result.summary.skills, 54);
    assert.equal(result.summary.agents, 11);
    assert.equal(result.summary.hooks, 6);
    assert.equal(result.summary.templates, 11);
    assert.equal(result.summary.rules, 2);
  });

  await test("rule assets reject a non-boolean selfOnly", () => {
    const source = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
    const manifest = {
      ...source,
      assets: {
        ...source.assets,
        rules: source.assets.rules.map((rule) => ({ ...rule, selfOnly: "yes" }))
      }
    };
    const result = validateManifest(manifest, { packageRoot });
    assert.equal(result.ok, false);
    assert(
      result.errors.some((error) => /selfOnly must be a boolean/.test(error)),
      JSON.stringify(result.errors)
    );
  });

  await test("manifest and package versions agree", () => {
    // Projection records manifest.version as the package_version of every asset,
    // so a drift here would label artifacts from the wrong release.
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    assert.equal(manifest.version, pkg.version, "harness.manifest.json version must match package.json");
  });

  await test("the DSH host plugin integration is removed", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
    assert.equal(manifest.integrations, undefined, "integrations.dsh must not survive the plugin removal");
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    assert.equal(pkg.main, undefined, "package main entry pointed at the removed plugin");
    assert.equal(pkg.dsh, undefined, "package dsh bundle wiring pointed at the removed plugin");
    assert.equal(fs.existsSync(path.join(packageRoot, "lib", "dsh")), false, "lib/dsh must be deleted");
  });

  await test("an integrations block is still validated when a package declares one", () => {
    const source = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
    // Validate against a throwaway package root so the test never mutates tracked files.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "manifest-root-"));
    try {
      // Mirror the real sources by symlink so asset validation still resolves,
      // then supply the package.json this case needs without touching the repo.
      for (const entry of fs.readdirSync(packageRoot)) {
        if (["package.json", "harness.manifest.json", "node_modules", ".git", "lib", "locale"].includes(entry)) continue;
        fs.symlinkSync(path.join(packageRoot, entry), path.join(root, entry), "dir");
      }
      fs.mkdirSync(path.join(root, "lib"), { recursive: true });
      fs.mkdirSync(path.join(root, "locale"), { recursive: true });
      fs.writeFileSync(path.join(root, "lib", "host.js"), "// host entry\n");
      for (const locale of ["en", "zh"]) fs.writeFileSync(path.join(root, "locale", `${locale}.json`), "{}\n");
      const pkg = { name: "fixture", version: "1.0.0", files: ["lib/", "locale/"], main: "./lib/host.js", dsh: { bundle: { patch: "./lib/host.js" } } };
      fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);

      const plugin = { kind: "host-plugin", entry: "lib/host.js", bundle: "lib/host.js", enabledByDefault: false };
      const valid = { ...source, integrations: { dsh: plugin } };
      assert.equal(validateManifest(valid, { packageRoot: root }).ok, true, "a well-formed host plugin must validate");

      for (const broken of [
        null,
        [],
        { dsh: null },
        { dsh: [] },
        { dsh: { ...plugin, kind: "preset" } },
        { dsh: { ...plugin, enabledByDefault: true } },
        { dsh: { ...plugin, entry: "../outside.js" } },
        { dsh: { ...plugin, entry: "/outside.js" } },
        { dsh: { ...plugin, entry: "lib/missing.js" } },
        { dsh: { ...plugin, bundle: "lib/other.js" } }
      ]) {
        const result = validateManifest({ ...source, integrations: broken }, { packageRoot: root });
        assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(broken)}`);
      }

      // A package without integrations stays valid, which is the shipped shape.
      assert.equal(validateManifest(source, { packageRoot: root }).ok, true, "absent integrations must be valid");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
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

  await test("show-me is a default knowledge skill that routes to archify", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8")
    );
    const showMe = manifest.assets.skills.find((skill) => skill.id === "show-me");
    assert(showMe, "show-me manifest entry missing");
    assert.equal(showMe.category, "knowledge");
    assert.equal(showMe.enabledByDefault, undefined, "show-me should be default, not opt-in");
    assert.equal(fs.existsSync(path.join(packageRoot, showMe.source, "SKILL.md")), true);
    const body = fs.readFileSync(path.join(packageRoot, showMe.source, "SKILL.md"), "utf8");
    assert.match(body, /`archify`/);
    assert.match(body, /`archify` is not available/i);
    assert.match(body, /re-state or approximate\s+Archify/);
    const archify = manifest.assets.skills.find((skill) => skill.id === "archify");
    assert(archify, "archify should exist for show-me routing");
    assert.equal(archify.category, "third-party");
    assert.equal(archify.enabledByDefault, false, "archify must stay opt-in");
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
    assert(thirdParty.some((skill) => skill.id === "archify"));
    assert(!thirdParty.some((skill) => skill.id === "architecture-diagram"));
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

  await test("command registry entries resolve to package binaries", () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8")
    );
    const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    assert.equal(manifest.commands.branchProtection, "harness-branch-protection");
    for (const [entry, binary] of Object.entries(manifest.commands)) {
      const target = packageJson.bin?.[binary];
      assert.equal(typeof target, "string", `${entry} -> ${binary} is missing from package.json bin`);
      assert.equal(
        fs.existsSync(path.join(packageRoot, target)),
        true,
        `${entry} -> ${binary} target ${target} is missing`
      );
    }
  });

  await test("install documentation includes templates in full projection", () => {
    const required = "--content rules,templates,skills,subagents,hooks";
    const readme = fs.readFileSync(path.join(packageRoot, "README.md"), "utf8");
    const agents = fs.readFileSync(path.join(packageRoot, "AGENTS.md"), "utf8");
    assert.equal(occurrences(readme, required), 8);
    assert.equal(occurrences(agents, required), 4);
  });
}

function occurrences(text, value) {
  return text.split(value).length - 1;
}
