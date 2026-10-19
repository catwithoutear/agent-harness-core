// Optional keyless integration smoke against an already installed DSH runtime.
// Run: node tests/test-dsh-runtime.js --runtime-root <DSH_HOME/profiles>
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as plugin from "../lib/dsh/index.js";

const runtimeRoot = process.argv[2] === "--runtime-root" ? process.argv[3] : undefined;
if (!runtimeRoot || !path.isAbsolute(runtimeRoot)) throw new Error("use --runtime-root <absolute installed runtime root>");
const require = createRequire(path.join(runtimeRoot, "package.json"));
const runtimeImport = (name) => import(pathToFileURL(require.resolve(name)));
const { Context } = await runtimeImport("@deepseek-ai/cordis");
const { default: SystemPrompt } = await runtimeImport("@deepseek-ai/dsh-system-prompt");
const { default: ToolRuntime, assertSupportedJsonSchema } = await runtimeImport("@deepseek-ai/dsh-tools");
const { createScope } = await runtimeImport("@deepseek-ai/dsh-scope");
const { loadProfileDirectory, composeEntries } = await runtimeImport("@deepseek-ai/dsh-app-boot");
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "harness-dsh-runtime-"));
const ctx = new Context();
const fibers = [];
try {
  const modules = path.join(root, "node_modules/@catwithoutear"); fs.mkdirSync(modules, { recursive: true });
  fs.symlinkSync(packageRoot, path.join(modules, "agent-harness-core"), "dir");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({
    dependencies: { "@catwithoutear/agent-harness-core": `link:${packageRoot}` },
    dsh: { profile: { bundles: ["@catwithoutear/agent-harness-core"] } },
  }));
  fs.writeFileSync(path.join(root, "cordis.patch.yml"), "[]\n");
  const profile = loadProfileDirectory("dsh", root, require.resolve("@deepseek-ai/dsh-app-boot/package.json"));
  const entries = composeEntries([...profile.layers.map((layer) => layer.patches), profile.patches]);
  assert.equal(entries.length, 1); assert.equal(entries[0].id, "harness-roles");
  assert.equal(entries[0].name, "@catwithoutear/agent-harness-core");
  assert.equal(entries[0].config.agentOptions, undefined);
  const resolved = createRequire(path.join(root, "package.json")).resolve(entries[0].name);
  assert.equal(resolved, path.join(packageRoot, "lib/dsh/index.js"));
  fibers.push(await ctx.plugin(SystemPrompt));
  fibers.push(await ctx.plugin(ToolRuntime));
  let disposedChildren = 0;
  let startedChildren = 0;
  const fiber = await ctx.plugin(Object.assign((scoped) => {
    const subagents = {
      getProvider: () => ({ capabilities: { persona: true, toolFilter: true, depthLimit: true } }),
      async start(_provider, request) {
        const childKey = { id: `child-${startedChildren++}` };
        const child = createScope(scoped, childKey);
        try { child.ctx.tools.restrict(request.toolFilter); }
        catch (error) { await child.dispose(); throw error; }
        for (const name of ["write", "edit", "spawn_teammate", "send_message", "subagent_reviewer"]) {
          assert.equal(child.ctx.tools.get(name, childKey), undefined, name);
        }
        assert(child.ctx.tools.get("bash", childKey));
        return { result: Promise.resolve({ stopReason: "completed", output: [{ type: "text", text: "scope checked" }] }),
          dispose: async () => { disposedChildren += 1; await child.dispose(); } };
      },
    };
    plugin.apply({ tools: scoped.tools, systemPrompt: scoped.systemPrompt, subagents }, entries[0].config);
  }, { inject: ["tools", "systemPrompt"] }));
  const schemas = ctx.tools.schemas();
  assert.equal(schemas.length, 11);
  for (const tool of schemas) {
    // schemas() exposes the parameters sent to the model; do not convert them here.
    assertSupportedJsonSchema(tool.parameters);
    assert.deepEqual(tool.parameters, {
      type: "object",
      properties: {
        description: { type: "string", description: "Short label for this delegation, shown in the transcript." },
        prompt: { type: "string", description: "The complete Input Packet: goal, context, paths or revision identity, constraints, and downstream consumer." },
      },
      required: ["description", "prompt"],
    }, tool.name);
  }
  const baseline = ["write", "edit", "spawn_teammate", "send_message", "bash"].map((name) =>
    ctx.tools.register({ name, description: name, parameters: {}, output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] }, execute: async () => "ok" }));
  try {
    const result = await ctx.tools.get("subagent_reviewer").execute({ description: "scope smoke", prompt: "Return the packet" }, { agent: { id: "parent" }, signal: new AbortController().signal });
    assert.deepEqual(result, { output: "scope checked" }); assert.equal(disposedChildren, 1);
    assert(startedChildren >= 2, "unknown optional child tools must exercise retry");
  } finally { for (const dispose of baseline) await dispose(); }
  await fiber.dispose();
  assert.equal(ctx.tools.get("subagent_reviewer"), undefined);
  assert.equal(ctx.tools.schemas().length, 0);
  // A fresh activation must not collide with tools from the disposed fiber.
  const again = await ctx.plugin(Object.assign((scoped) => plugin.apply({ tools: scoped.tools, systemPrompt: scoped.systemPrompt }, entries[0].config), { inject: ["tools", "systemPrompt"] }));
  assert.equal(ctx.tools.schemas().length, 11);
  await again.dispose();
  console.log("ok - installed DSH bundle composition, root resolution, native schema projection, registration, real child restrictions and disposal/reload");
} finally {
  try { for (const fiber of fibers.reverse()) await fiber.dispose(); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}
