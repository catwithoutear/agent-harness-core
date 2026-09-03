import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ZCODE_PRE_TOOL_MATCHER,
  ZCODE_CONTEXT_ADAPTER_RUNTIME,
  buildZCodeAdapterOperation,
  planZCodeHookMerge,
  verifyZCodeHookMerge,
  zcodeHookIdentity
} from "../lib/project/zcode-hooks.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
const zcodeHooks = manifest.clients.zcode.capabilities.hooks;
const hookAssets = new Map(manifest.assets.hooks.map((hook) => [hook.intent, hook]));

export async function run(test) {
  await test("ZCode manifest carries native metadata and enables only supported Hook clients", () => {
    assert.deepEqual(zcodeHooks, {
      "session-bootstrap": {
        support: "native",
        event: "SessionStart",
        matcher: null,
        effect: "additionalContext",
        adapter_runtime_name: ZCODE_CONTEXT_ADAPTER_RUNTIME
      },
      "active-change-guard": {
        support: "native",
        event: "SessionStart",
        matcher: null,
        effect: "additionalContext",
        adapter_runtime_name: ZCODE_CONTEXT_ADAPTER_RUNTIME
      },
      "projection-health-check": {
        support: "native",
        event: "SessionStart",
        matcher: null,
        effect: "additionalContext",
        adapter_runtime_name: ZCODE_CONTEXT_ADAPTER_RUNTIME
      },
      "tool-safety-guard": {
        support: "native",
        event: "PreToolUse",
        matcher: ZCODE_PRE_TOOL_MATCHER,
        effect: "additionalContext",
        adapter_runtime_name: ZCODE_CONTEXT_ADAPTER_RUNTIME
      },
      "regulated-structure-guard": {
        support: "native",
        event: "PreToolUse",
        matcher: ZCODE_PRE_TOOL_MATCHER,
        effect: "additionalContext",
        adapter_runtime_name: ZCODE_CONTEXT_ADAPTER_RUNTIME
      },
      "pre-compact-handoff": {
        support: "unsupported"
      }
    });
    for (const hook of manifest.assets.hooks) {
      assert.equal(
        hook.clients.includes("zcode"),
        hook.intent !== "pre-compact-handoff",
        `${hook.id} ZCode client enablement drifted`
      );
    }
  });

  await test("each supported intent renders an exact standalone context-only adapter", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-zcode-adapter-"));
    try {
      for (const [intent, metadata] of Object.entries(zcodeHooks)) {
        if (metadata.support !== "native") {
          continue;
        }
        const hook = hookAssets.get(intent);
        const body = fs.readFileSync(path.join(packageRoot, hook.source), "utf8");
        const adapterTarget = path.join(root, ".zcode", "harness", "hooks", `${intent}.mjs`);
        const operation = buildZCodeAdapterOperation({
          asset_id: hook.id,
          content_kind: "hooks",
          client: "zcode",
          scope: "project",
          source: path.join(packageRoot, hook.source),
          body,
          adapter_target: adapterTarget,
          metadata
        });
        assert.equal(operation.strategy, "materialize-render");
        assert.equal(operation.mode, "render");
        assert.equal(operation.renderer, ZCODE_CONTEXT_ADAPTER_RUNTIME);
        assert.equal(operation.target, adapterTarget);
        assert.equal(operation.sources[0].path, path.join(packageRoot, hook.source));
        assert.equal(operation.desired_hash, sha256(operation.desired_text));
        assert.match(operation.desired_text, /node:process/);
        assert.doesNotMatch(operation.desired_text, /from .*lib\/project|from .*hooks\/intents/);

        fs.mkdirSync(path.dirname(adapterTarget), { recursive: true });
        fs.writeFileSync(adapterTarget, operation.desired_text, "utf8");
        const result = spawnSync(process.execPath, [adapterTarget], {
          input: JSON.stringify({ tool: "Write", untrusted: "do not copy" }),
          encoding: "utf8"
        });
        assert.equal(result.error ?? null, null, result.error?.message);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stderr, "");
        const output = JSON.parse(result.stdout);
        assert.deepEqual(Object.keys(output), ["additionalContext"]);
        assert.equal(
          output.additionalContext,
          `[agent-harness-core:${intent}]\n${body.trimEnd()}`
        );
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  await test("adapter operations use exact project and global paths and managed identities", () => {
    const projectRoot = "/tmp/zcode-project";
    const globalRoot = "/tmp/zcode-home";
    const project = buildZCodeAdapterOperation(adapterBinding("session-bootstrap", "project", path.join(projectRoot, ".zcode", "harness", "hooks", "session-bootstrap.mjs")));
    const global = buildZCodeAdapterOperation(adapterBinding("session-bootstrap", "global", path.join(globalRoot, ".zcode", "harness", "hooks", "session-bootstrap.mjs")));
    assert.equal(project.target, "/tmp/zcode-project/.zcode/harness/hooks/session-bootstrap.mjs");
    assert.equal(global.target, "/tmp/zcode-home/.zcode/harness/hooks/session-bootstrap.mjs");
    assert.equal(project.consumers[0].scope, "project");
    assert.equal(global.consumers[0].scope, "global");
    assert.equal(
      project.identity,
      zcodeHookIdentity("project", "SessionStart", "session-bootstrap")
    );
    assert.notEqual(project.identity, global.identity);
  });

  await test("config structural type errors use the reviewed error table", () => {
    const selected = [selection("session-bootstrap")];
    const cases = [
      [[], "zcode-config-root-type"],
      [{ hooks: [] }, "zcode-hooks-type"],
      [{ hooks: { enabled: "yes" } }, "zcode-hooks-enabled-type"],
      [{ hooks: { events: [] } }, "zcode-hooks-events-type"],
      [{ hooks: { events: { SessionStart: {} } } }, "zcode-hook-event-bucket-type"],
      [{ hooks: { events: { SessionStart: [null] } } }, "zcode-hook-declaration-type"],
      [{ hooks: { events: { SessionStart: [{ matcher: 42, hooks: [] }] } } }, "zcode-hook-matcher-type"],
      [{ hooks: { events: { SessionStart: [{ hooks: {} }] } } }, "zcode-hook-list-type"],
      [{ hooks: { events: { SessionStart: [{ hooks: [null] }] } } }, "zcode-hook-process-type"],
      [{ hooks: { events: { SessionStart: [{ hooks: [{ type: "process", command: 42, args: [] }] }] } } }, "zcode-hook-process-type"],
      [{ hooks: { events: { SessionStart: [{ hooks: [{ type: "process", command: "node", args: "bad" }] }] } } }, "zcode-hook-process-type"],
      [{ hooks: { events: { SessionStart: [{ hooks: [{ type: "process", command: "node", args: [], timeoutMs: -1 }] }] } } }, "zcode-hook-process-type"]
    ];
    for (const [config, code] of cases) {
      assert.throws(
        () => planZCodeHookMerge(input({ current_text: JSON.stringify(config), selected })),
        (error) => error.code === code,
        `expected ${code}`
      );
    }
    assert.throws(
      () => planZCodeHookMerge(input({ current_text: "{not-json", selected })),
      (error) => error.code === "zcode-config-json-invalid"
    );
    const verification = verifyZCodeHookMerge(input({
      current_text: JSON.stringify({ hooks: { events: { SessionStart: {} } } }),
      selected
    }));
    assert.equal(verification.ok, false);
    assert.equal(verification.errors[0].code, "zcode-hook-event-bucket-type");
  });

  await test("first merge appends managed declarations, enables absent hooks, and preserves config", () => {
    const target = "/tmp/zcode-project/.zcode/config.json";
    const selected = [selection("session-bootstrap")];
    const current = JSON.stringify({
      mcpServers: { preserved: { command: "keep" } },
      pluginSettings: { enabled: true }
    }, null, 2) + "\n";
    const result = planZCodeHookMerge(input({ target, current_text: current, selected }));
    const config = JSON.parse(result.desired_text);
    assert.equal(result.changed, true);
    assert.equal(config.hooks.enabled, true);
    assert.deepEqual(config.mcpServers, { preserved: { command: "keep" } });
    assert.deepEqual(config.pluginSettings, { enabled: true });
    assert.equal(config.hooks.events.SessionStart.length, 1);
    assert.deepEqual(config.hooks.events.SessionStart[0], {
      hooks: [{
        type: "process",
        command: "node",
        args: [selected[0].adapter_target],
        timeoutMs: 5000
      }]
    });
    assert.deepEqual(result.warnings, []);
    assert.equal(result.introduced.hooks_enabled, true);
    assert.equal(result.managed_fragments.length, 1);
    assert.deepEqual(Object.keys(result.managed_fragments[0]).sort(), [
      "desired_hash",
      "event",
      "identity",
      "matcher",
      "prior_hash",
      "recognition_hash"
    ]);
    assert.equal(result.managed_fragments[0].prior_hash, null);
    assert.equal(
      result.managed_fragments[0].desired_hash,
      sha256(JSON.stringify({
        hooks: [{
          args: [selected[0].adapter_target],
          command: "node",
          timeoutMs: 5000,
          type: "process"
        }]
      }))
    );
  });

  await test("repeat merge is byte-idempotent and verify ignores unrelated edits", () => {
    const target = "/tmp/zcode-project/.zcode/config.json";
    const selected = [selection("session-bootstrap")];
    const first = planZCodeHookMerge(input({ target, selected }));
    const second = planZCodeHookMerge(input({
      target,
      current_text: first.desired_text,
      selected,
      prior: { managed_fragments: first.managed_fragments, introduced: first.introduced }
    }));
    assert.equal(second.desired_text, first.desired_text);
    assert.equal(second.changed, false);
    assert.deepEqual(second.managed_fragments, first.managed_fragments);
    assert.deepEqual(second.introduced, first.introduced);

    const unrelated = JSON.parse(first.desired_text);
    unrelated.mcpServers = { secret: { token: "preserve-me" } };
    const unrelatedText = JSON.stringify(unrelated, null, 2) + "\n";
    const third = planZCodeHookMerge(input({
      target,
      current_text: unrelatedText,
      selected,
      prior: { managed_fragments: first.managed_fragments, introduced: first.introduced }
    }));
    assert.equal(third.desired_text, unrelatedText);
    assert.equal(third.changed, false);
    const verification = verifyZCodeHookMerge(input({
      target,
      current_text: unrelatedText,
      selected,
      prior: { managed_fragments: first.managed_fragments, introduced: first.introduced }
    }));
    assert.deepEqual(verification, { ok: true, errors: [], warnings: [] });
  });

  await test("explicit hooks.enabled false is preserved with a deterministic warning", () => {
    const target = "/tmp/zcode-project/.zcode/config.json";
    const selected = [selection("session-bootstrap")];
    const current = JSON.stringify({ hooks: { enabled: false } }, null, 2) + "\n";
    const result = planZCodeHookMerge(input({ target, current_text: current, selected }));
    const config = JSON.parse(result.desired_text);
    assert.equal(config.hooks.enabled, false);
    assert.equal(result.introduced.hooks_enabled, false);
    assert.deepEqual(result.warnings, [{ code: "configured-disabled", target }]);
    const verification = verifyZCodeHookMerge(input({
      target,
      current_text: result.desired_text,
      selected,
      prior: { managed_fragments: result.managed_fragments, introduced: result.introduced }
    }));
    assert.equal(verification.ok, true);
    assert.deepEqual(verification.warnings, [{ code: "configured-disabled", target }]);
  });

  await test("managed receipts fail closed on unowned collisions, drift, duplicates, and missing entries", () => {
    const target = "/tmp/zcode-project/.zcode/config.json";
    const selected = [selection("session-bootstrap")];
    const first = planZCodeHookMerge(input({ target, selected }));
    const prior = { managed_fragments: first.managed_fragments, introduced: first.introduced };

    assert.throws(
      () => planZCodeHookMerge(input({ target, current_text: first.desired_text, selected })),
      (error) => error.code === "unowned-hook-collision"
    );

    const modified = JSON.parse(first.desired_text);
    modified.hooks.events.SessionStart[0].hooks[0].timeoutMs = 4000;
    assert.throws(
      () => planZCodeHookMerge(input({ target, current_text: JSON.stringify(modified), selected, prior })),
      (error) => error.code === "managed-hook-modified"
    );

    const duplicate = JSON.parse(first.desired_text);
    duplicate.hooks.events.SessionStart.push(duplicate.hooks.events.SessionStart[0]);
    assert.throws(
      () => planZCodeHookMerge(input({ target, current_text: JSON.stringify(duplicate), selected, prior })),
      (error) => error.code === "managed-hook-duplicate"
    );

    const missing = verifyZCodeHookMerge(input({ target, current_text: JSON.stringify({}), selected, prior }));
    assert.equal(missing.ok, false);
    assert.equal(missing.errors[0].code, "managed-hook-missing");
  });

  await test("adapter variants are found across events and fail closed", () => {
    const target = "/tmp/zcode-project/.zcode/config.json";
    const selected = [selection("session-bootstrap")];
    const first = planZCodeHookMerge(input({ target, selected }));
    const prior = { managed_fragments: first.managed_fragments, introduced: first.introduced };
    const exact = JSON.parse(first.desired_text).hooks.events.SessionStart[0];
    const variants = [
      {
        event: "SessionStart",
        declaration: { ...exact, matcher: "changed" }
      },
      {
        event: "SessionStart",
        declaration: {
          ...exact,
          hooks: [{ ...exact.hooks[0], command: "bun" }]
        }
      },
      {
        event: "PreToolUse",
        declaration: exact
      }
    ];

    for (const variant of variants) {
      const current = JSON.stringify({
        hooks: {
          enabled: true,
          events: { [variant.event]: [variant.declaration] }
        }
      });
      assert.throws(
        () => planZCodeHookMerge(input({ target, current_text: current, selected })),
        (error) => error.code === "unowned-hook-collision"
      );
      const verification = verifyZCodeHookMerge(input({
        target,
        current_text: current,
        selected
      }));
      assert.equal(verification.ok, false);
      assert.equal(verification.errors[0].code, "unowned-hook-collision");

      assert.throws(
        () => planZCodeHookMerge(input({ target, current_text: current, selected, prior })),
        (error) => error.code === "managed-hook-modified"
      );
      const managedVerification = verifyZCodeHookMerge(input({
        target,
        current_text: current,
        selected,
        prior
      }));
      assert.equal(managedVerification.ok, false);
      assert.equal(managedVerification.errors[0].code, "managed-hook-modified");
    }

    const duplicate = JSON.stringify({
      hooks: {
        enabled: true,
        events: {
          SessionStart: [
            exact,
            { ...exact, matcher: "changed" }
          ]
        }
      }
    });
    assert.throws(
      () => planZCodeHookMerge(input({ target, current_text: duplicate, selected, prior })),
      (error) => error.code === "managed-hook-duplicate"
    );
    const duplicateVerification = verifyZCodeHookMerge(input({
      target,
      current_text: duplicate,
      selected,
      prior
    }));
    assert.equal(duplicateVerification.ok, false);
    assert.equal(duplicateVerification.errors[0].code, "managed-hook-duplicate");
  });

  await test("PreToolUse metadata is bounded and all adapter effects remain context-only", () => {
    const binding = adapterBinding("tool-safety-guard", "project", "/tmp/zcode-project/.zcode/harness/hooks/tool-safety-guard.mjs");
    assert.equal(binding.metadata.matcher, ZCODE_PRE_TOOL_MATCHER);
    const operation = buildZCodeAdapterOperation(binding);
    assert.deepEqual(operation.fragment.matcher, ZCODE_PRE_TOOL_MATCHER);
    assert.equal(operation.event, "PreToolUse");
    assert.throws(
      () => buildZCodeAdapterOperation({ ...binding, metadata: { ...binding.metadata, effect: "deny" } }),
      (error) => error.code === "zcode-hook-effect-type"
    );
    assert.throws(
      () => buildZCodeAdapterOperation({ ...binding, metadata: { support: "unsupported" } }),
      (error) => error.code === "zcode-hook-unsupported"
    );
  });
}

function input(overrides = {}) {
  return {
    scope: "project",
    target: "/tmp/zcode-project/.zcode/config.json",
    current_text: null,
    hooks_explicitly_selected: true,
    selected: [selection("session-bootstrap")],
    prior: null,
    ...overrides
  };
}

function selection(intent, adapterTarget = `/tmp/zcode-project/.zcode/harness/hooks/${intent}.mjs`) {
  const metadata = zcodeHooks[intent];
  return {
    intent,
    event: metadata.event,
    matcher: metadata.matcher,
    adapter_target: adapterTarget,
    context_hash: sha256(fs.readFileSync(path.join(packageRoot, hookAssets.get(intent).source)))
  };
}

function adapterBinding(intent, scope, adapterTarget) {
  const hook = hookAssets.get(intent);
  const metadata = zcodeHooks[intent];
  const source = path.join(packageRoot, hook.source);
  return {
    asset_id: hook.id,
    content_kind: "hooks",
    client: "zcode",
    scope,
    source,
    body: fs.readFileSync(source, "utf8"),
    adapter_target: adapterTarget,
    metadata
  };
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failures = 0;
  await run(async (name, fn) => {
    try {
      await fn();
      process.stdout.write(`ok - ${name}\n`);
    } catch (error) {
      failures += 1;
      process.stderr.write(`not ok - ${name}\n${error.stack ?? error.message}\n`);
    }
  });
  if (failures > 0) {
    process.exitCode = 1;
  } else {
    process.stdout.write("all zcode hook tests passed\n");
  }
}
