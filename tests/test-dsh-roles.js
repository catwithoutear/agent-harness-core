import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { apply } from "../lib/dsh/index.js";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(fs.readFileSync(new URL("../harness.manifest.json", import.meta.url)));

function setup(config, overrides = {}) {
  const tools = new Map(overrides.tools ?? []);
  const requests = [];
  const sections = [];
  const state = { disposed: 0 };
  const capabilities = { persona: true, toolFilter: true, depthLimit: true, agentOptions: true, ...overrides.capabilities };
  const ctx = {
    tools: {
      register(tool) { tools.set(tool.name, tool); },
      get(name) { return tools.get(name); },
    },
    systemPrompt: { section(value) { sections.push(value); } },
    subagents: {
      getProvider() { return overrides.missingProvider ? undefined : { capabilities }; },
      async start(provider, request) {
        requests.push({ provider, request });
        if (overrides.start) return overrides.start(provider, request, state, requests.length);
        return {
          result: overrides.result ?? Promise.resolve({ stopReason: "completed", output: [{ type: "text", text: "review complete" }] }),
          async dispose() { state.disposed += 1; },
        };
      },
    },
  };
  apply(ctx, config);
  return { tools, requests, sections, state, ctx };
}

async function temporary(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-dsh-test-"));
  try { return await fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

const parent = { id: "parent" };
const signal = new AbortController().signal;
const input = { description: "Review one slice", prompt: "Review these changes using the supplied packet." };
const execute = (test, name = "reviewer", args = input, caller = parent) =>
  test.tools.get(`subagent_${name}`).execute(args, { agent: caller, signal });

export async function run(test) {
  await test("host plugin registers canonical roles with complete JSON Schema parameters", () => {
    const host = setup();
    assert.equal(host.tools.size, manifest.assets.agents.length);
    assert(host.tools.has("subagent_reviewer")); assert(host.tools.has("subagent_code_worker"));
    const definition = host.tools.get("subagent_reviewer");
    for (const tool of host.tools.values()) {
      assert.deepEqual(tool.parameters, {
        type: "object",
        properties: {
          description: { type: "string", description: "Short label for this delegation, shown in the transcript." },
          prompt: { type: "string", description: "The complete Input Packet: goal, context, paths or revision identity, constraints, and downstream consumer." },
        },
        required: ["description", "prompt"],
      }, tool.name);
    }
    assert.deepEqual(definition.output.render({}, { output: "visible output" }), [{ type: "text", text: "visible output" }]);
    assert.equal(host.sections.length, 1);
    assert.match(host.sections[0].text, /not a sandbox/);
  });
  await test("read-only dispatch preserves packet, depth, signal and inherited model route", async () => {
    const host = setup(undefined, { tools: [["write", {}], ["edit", {}], ["bash", {}], ["subagent", {}], ["spawn_teammate", {}]] });
    assert.deepEqual(await execute(host), { output: "review complete" });
    const { provider, request } = host.requests[0];
    assert.equal(provider, "spawn"); assert.equal(request.parent, parent); assert.equal(request.signal, signal);
    assert.equal(request.maxDepth, 2); assert.equal(Object.hasOwn(request, "agentOptions"), false);
    assert.deepEqual(request.prompt, [{ type: "text", text: input.prompt }]);
    assert.match(request.persona, /# Reviewer/); assert.match(request.persona, /Read only\./);
    for (const tool of ["write", "edit", "subagent", "spawn_teammate", "subagent_reviewer", "subagent_code_worker"]) {
      assert(request.toolFilter.deny.includes(tool), tool);
    }
    assert.equal(request.toolFilter.deny.includes("bash"), false);
    assert.equal(host.state.disposed, 1);
  });
  await test("profile overrides stay explicit and implementation roles retain write tools", async () => {
    const agentOptions = { provider: "profile-route", model: "profile-model", maxTokens: 4096 };
    const host = setup({ agentOptions, provider: "custom", maxDepth: 3, policy: false }, { tools: [["write", {}], ["edit", {}]] });
    await execute(host, "code_worker");
    assert.equal(host.sections.length, 0); assert.equal(host.requests[0].provider, "custom");
    assert.deepEqual(host.requests[0].request.agentOptions, agentOptions); assert.equal(host.requests[0].request.maxDepth, 3);
    assert.equal(host.requests[0].request.toolFilter.deny.includes("write"), false);
    assert.equal(host.requests[0].request.toolFilter.deny.includes("edit"), false);
  });
  await test("additional read-only restrictions cannot remove write/edit baseline", async () => {
    const host = setup({ readOnlyDeny: ["bash"], agentOptions: null }, { tools: [["write", {}], ["edit", {}], ["bash", {}]] });
    await execute(host);
    for (const name of ["write", "edit", "bash"]) assert(host.requests[0].request.toolFilter.deny.includes(name));
    assert.equal(Object.hasOwn(host.requests[0].request, "agentOptions"), false);
  });
  await test("invalid profile options fail activation", () => {
    for (const config of [[], false, { model: "misplaced" }, { rolesDir: "relative" }, { provider: " " },
      { maxDepth: 0 }, { maxDepth: 1.5 }, { maxDepth: null }, { agentOptions: [] }, { readOnlyDeny: [4] }, { policy: "false" }]) {
      assert.throws(() => setup(config), /config|rolesDir|provider|maxDepth|agentOptions|readOnlyDeny|policy/);
    }
  });
  await test("duplicate old integration fails before registering new tools", () => {
    const tools = new Map([["subagent_reviewer", { userOwned: true }]]);
    let registrations = 0;
    assert.throws(() => apply({ tools: { get: (name) => tools.get(name), register: () => { registrations += 1; } } }), /remove the old role integration/);
    assert.equal(registrations, 0);
  });
  await test("canonical list ignores extra files and malformed roles fail before effects", () => temporary((root) => {
    const rolesDir = path.join(packageRoot, "agents/roles");
    fs.cpSync(rolesDir, root, { recursive: true });
    fs.writeFileSync(path.join(root, "unexpected.md"), "not a role");
    assert.equal(setup({ rolesDir: root }).tools.has("subagent_unexpected"), false);
    const target = path.join(root, "reviewer.md");
    for (const text of ["invalid frontmatter", "---\nname: reviewer\n---\n", "---\nname: reviewer\n---\n# Reviewer\nNo authority"]) {
      fs.writeFileSync(target, text);
      let registrations = 0;
      assert.throws(() => apply({ tools: { register: () => { registrations += 1; } } }, { rolesDir: root }), /frontmatter|empty body|Authority/);
      assert.equal(registrations, 0);
    }
    fs.rmSync(target); assert.throws(() => setup({ rolesDir: root }), /ENOENT/);
  }));
  await test("missing caller, blank packet and unsupported provider do not start a child", async () => {
    const host = setup();
    await assert.rejects(host.tools.get("subagent_reviewer").execute(input, { signal }), /calling agent/);
    await assert.rejects(execute(host, "reviewer", { description: "blank", prompt: " " }), /non-empty prompt/);
    assert.equal(host.requests.length, 0);
    await assert.rejects(execute(setup(undefined, { missingProvider: true })), /unavailable/);
    for (const cap of ["persona", "toolFilter", "depthLimit"]) {
      const unsupported = setup(undefined, { capabilities: { [cap]: false } });
      await assert.rejects(execute(unsupported), /capability/); assert.equal(unsupported.requests.length, 0);
    }
  });
  await test("result rejection and non-completion always dispose the returned run", async () => {
    const failed = setup(undefined, { result: Promise.resolve().then(() => { throw new Error("provider failed"); }) });
    await assert.rejects(execute(failed), /provider failed/); assert.equal(failed.state.disposed, 1);
    for (const stopReason of ["cancelled", "interrupted", "failed"]) {
      const stopped = setup(undefined, { result: Promise.resolve({ stopReason, output: [{ type: "text", text: "partial" }] }) });
      await assert.rejects(execute(stopped), new RegExp(`did not complete.*${stopReason}`)); assert.equal(stopped.state.disposed, 1);
    }
  });
  await test("hidden parent tools remain denied in the child restriction request", async () => {
    const host = setup();
    assert.equal(host.ctx.tools.get("spawn_teammate", parent), undefined);
    assert.equal(host.ctx.tools.get("write", parent), undefined);
    await execute(host);
    for (const name of ["spawn_teammate", "send_message", "team_task_update", "write", "edit"]) {
      assert(host.requests[0].request.toolFilter.deny.includes(name), name);
    }
  });
  await test("execution and disposal failures remain independently visible", async () => {
    for (const failResult of [false, true]) {
      const resultError = new Error("execution failed"); const disposeError = new Error("dispose failed");
      let disposed = 0;
      const host = setup(undefined, { start: async () => ({
        result: failResult ? Promise.reject(resultError) : Promise.resolve({ stopReason: "completed", output: [] }),
        dispose: async () => { disposed += 1; throw disposeError; },
      }) });
      await assert.rejects(execute(host), (error) => {
        if (failResult) { assert(error instanceof AggregateError); assert.deepEqual(error.errors, [resultError, disposeError]); }
        else assert.equal(error, disposeError);
        return true;
      });
      assert.equal(disposed, 1);
    }
  });
  await test("role children deny inherited team and continuation controls", async () => {
    const controls = ["send_message", "list_agents", "wait_agent", "interrupt_agent", "team_task_create", "team_task_list", "team_task_get", "team_task_update", "summon_expert"];
    const host = setup(undefined, { tools: controls.map((name) => [name, {}]) });
    await execute(host, "code_worker");
    for (const name of controls) assert(host.requests[0].request.toolFilter.deny.includes(name), name);
  });
  await test("unknown child restriction names retry narrowly and unrelated start failures propagate", async () => {
    const oldWarn = console.warn; console.warn = () => {};
    try {
      const host = setup(undefined, {
        tools: [["write", {}], ["edit", {}]],
        start: async (_provider, request, state, count) => {
          if (count === 1) throw new Error('tools.restrict() names unknown global tool "write"; known global tools: edit');
          assert(!request.toolFilter.deny.includes("write")); assert(request.toolFilter.deny.includes("edit"));
          return { result: Promise.resolve({ stopReason: "completed", output: [{ type: "text", text: "done" }] }), dispose: async () => { state.disposed += 1; } };
        },
      });
      assert.deepEqual(await execute(host), { output: "done" }); assert.equal(host.requests.length, 2); assert.equal(host.state.disposed, 1);
      const rejected = setup(undefined, { start: async () => { throw new Error("transport unavailable"); } });
      await assert.rejects(execute(rejected), /transport unavailable/); assert.equal(rejected.requests.length, 1); assert.equal(rejected.state.disposed, 0);
      const bounded = setup(undefined, { start: async (_provider, request) => {
        throw new Error(`tools.restrict() names unknown global tool "${request.toolFilter.deny[0]}"; known global tools: none`);
      } });
      await assert.rejects(execute(bounded), /unknown global tool/); assert.equal(bounded.requests.length, 5);
    } finally { console.warn = oldWarn; }
  });
  await test("relocated npm package contains an activatable bundle and canonical role sources", () => temporary(async (root) => {
    const packed = spawnSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", root, "--cache", path.join(root, "npm-cache")], { cwd: packageRoot, encoding: "utf8" });
    assert.ifError(packed.error);
    assert.equal(packed.status, 0, packed.stderr);
    const payload = JSON.parse(packed.stdout);
    const [record] = Array.isArray(payload) ? payload : Object.values(payload);
    const unpacked = spawnSync("tar", ["-xzf", path.join(root, record.filename), "-C", root], { encoding: "utf8" });
    assert.equal(unpacked.status, 0, unpacked.stderr);
    const installed = path.join(root, "package");
    const pkg = JSON.parse(fs.readFileSync(path.join(installed, "package.json")));
    assert.deepEqual(pkg.dsh, { bundle: { patch: "./lib/dsh/cordis.patch.yml" } });
    assert.equal(pkg.main, "./lib/dsh/index.js");
    assert.equal(manifest.integrations.dsh.entry, pkg.main.slice(2));
    assert.equal(manifest.integrations.dsh.bundle, pkg.dsh.bundle.patch.slice(2));
    assert.equal(manifest.integrations.dsh.enabledByDefault, false); assert.equal(manifest.clients.dsh, undefined);
    for (const locale of ["en", "zh"]) assert(JSON.parse(fs.readFileSync(path.join(installed, `locale/${locale}.json`))).meta.title);
    assert.match(fs.readFileSync(path.join(installed, pkg.dsh.bundle.patch), "utf8"), /name: '@catwithoutear\/agent-harness-core'/);
    const module = await import(pathToFileURL(path.join(installed, pkg.main)));
    const tools = new Map();
    module.apply({ tools: { get: (name) => tools.get(name), register: (tool) => tools.set(tool.name, tool) }, systemPrompt: { section() {} } });
    assert.equal(tools.size, 11); assert.match(tools.get("subagent_reviewer").description, /read-only contract/);
    assert.doesNotMatch(fs.readFileSync(path.join(installed, pkg.main), "utf8"), /\/home\/|deepseek-official|deepseek-flash|384000/);
  }));
}
