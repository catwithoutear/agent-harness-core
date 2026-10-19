import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CONTEXT_RECEIPT_SCHEMA,
  canonicalReceiptDigest,
  runContextReceiptCli,
  validateContextRetrievalReceipt
} from "../skills/knowledge/memory-context-contract/scripts/context-retrieval-receipt.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const producerRoot = process.env.CODEBASE_CONTEXT_PRODUCER_ROOT
  ? path.resolve(process.env.CODEBASE_CONTEXT_PRODUCER_ROOT)
  : null;
const producerPath = producerRoot ? path.join(producerRoot, "lib", "context-retrieval.mjs") : null;
const fixtureRoot = path.join(packageRoot, "tests", "fixtures", "context-retrieval-receipts");
const FIXTURE_FILES = Object.freeze({
  CONTEXT_READY: "context-ready.json",
  NO_RELEVANT_HIT: "no-relevant-hit.json",
  DEGRADED: "degraded.json",
  QUERY_FAILED: "query-failed.json",
  PLANNED: "planned.json"
});
const EXPECTED_FIELDS = [
  "schema",
  "version",
  "receipt_type",
  "claim_id",
  "lane",
  "query",
  "created_at",
  "route",
  "worktree",
  "ok",
  "state",
  "execution",
  "transport",
  "query_outcome",
  "provider",
  "search",
  "read",
  "error",
  "digest"
];

const anchor = Object.freeze({
  project_root: "/tmp/project",
  head: "0123456789abcdef0123456789abcdef01234567",
  dirty_digest: `sha256:${"0".repeat(64)}`
});

async function loadProducer() {
  assert.notEqual(producerRoot, null, "Codebase producer root requires CODEBASE_CONTEXT_PRODUCER_ROOT");
  assert.equal(fs.existsSync(producerPath), true, `Codebase producer is missing: ${producerPath}`);
  return import(pathToFileURL(producerPath).href);
}

async function loadProducerCanonicalHash() {
  assert.notEqual(producerRoot, null, "Codebase producer root requires CODEBASE_CONTEXT_PRODUCER_ROOT");
  const canonicalPath = path.join(producerRoot, "lib", "openviking", "canonical-json.mjs");
  assert.equal(fs.existsSync(canonicalPath), true, `Codebase canonical hash is missing: ${canonicalPath}`);
  return import(pathToFileURL(canonicalPath).href);
}

function loadFixture(state) {
  const file = FIXTURE_FILES[state];
  assert.notEqual(file, undefined, `unknown receipt fixture state: ${state}`);
  const fixturePath = path.join(fixtureRoot, file);
  assert.equal(fs.existsSync(fixturePath), true, `receipt fixture is missing: ${fixturePath}`);
  return JSON.parse(fs.readFileSync(fixturePath, "utf8"));
}

function fakeMcp({ searchText = "viking://resources/project/first.md", readText = "verified source body" } = {}) {
  return async () => ({
    provider: { name: "fake-provider", version: "1.0.0" },
    async callTool(name) {
      if (name === "health") return { result: "ok" };
      if (name === "find") return { result: searchText };
      if (name === "read") return { result: readText };
      throw new Error(`unexpected tool: ${name}`);
    },
    async close() {}
  });
}

async function runCli(args) {
  let stdout = "";
  let stderr = "";
  const status = await runContextReceiptCli(args, {
    writeOut: (text) => { stdout += text; },
    writeErr: (text) => { stderr += text; }
  });
  return { status, stdout, stderr };
}

export async function run(test) {
  await test("validator consumes Codebase producer fixtures for planned and ready receipts", async () => {
    const planned = loadFixture("PLANNED");
    assert.deepEqual(Object.keys(planned).sort(), [...EXPECTED_FIELDS].sort());
    assert.equal(planned.digest, canonicalReceiptDigest(planned));
    assert.deepEqual(validateContextRetrievalReceipt(planned), {
      ok: false,
      receipt_status: "PLANNED",
      gate_status: "NOT_READY",
      outcome: "未就绪",
      context_gap: true,
      exit_code: 1
    });

    const ready = loadFixture("CONTEXT_READY");
    assert.deepEqual(validateContextRetrievalReceipt(ready), {
      ok: true,
      receipt_status: "CONTEXT_READY",
      gate_status: "READY",
      outcome: "已读取",
      context_gap: false,
      exit_code: 0
    });
  });

  await test("validator maps Codebase producer fixtures for no-hit, degraded, and query-failed receipts", async () => {
    const noHit = loadFixture("NO_RELEVANT_HIT");
    assert.equal(noHit.state, "NO_RELEVANT_HIT");
    assert.equal(validateContextRetrievalReceipt(noHit).outcome, "仅尝试");
    assert.equal(validateContextRetrievalReceipt(noHit).gate_status, "READY_WITH_NOTES");

    const degraded = loadFixture("DEGRADED");
    const degradedResult = validateContextRetrievalReceipt(degraded);
    assert.equal(degraded.state, "DEGRADED");
    assert.equal(degradedResult.gate_status, "READY_WITH_NOTES");
    assert.equal(degradedResult.outcome, "context gap");

    const failed = loadFixture("QUERY_FAILED");
    const failedResult = validateContextRetrievalReceipt(failed);
    assert.equal(failed.state, "QUERY_FAILED");
    assert.equal(failedResult.gate_status, "READY_WITH_NOTES");
    assert.equal(failedResult.outcome, "context gap");
  });

  await test("canonical digest is order-independent and detects tampering", async () => {
    const original = loadFixture("CONTEXT_READY");
    const reordered = Object.fromEntries([
      ...Object.entries(original).reverse()
    ]);
    assert.deepEqual(validateContextRetrievalReceipt(reordered), validateContextRetrievalReceipt(original));
    assert.throws(
      () => validateContextRetrievalReceipt({ ...original, query: "different query" }),
      /canonical digest mismatch/u
    );
  });

  await test("unknown fields and inconsistent nested state fail closed", async () => {
    const planned = loadFixture("PLANNED");
    assert.throws(
      () => validateContextRetrievalReceipt({ ...planned, unexpected: true }),
      /unknown field: unexpected/u
    );
    const inconsistent = {
      ...planned,
      execution: "EXECUTED",
      digest: canonicalReceiptDigest({ ...planned, execution: "EXECUTED" })
    };
    assert.throws(
      () => validateContextRetrievalReceipt(inconsistent),
      /PLANNED requires execution=PLANNED/u
    );
  });

  await test("receipt CLI rejects missing and invalid input, and returns planned non-zero", async () => {
    const missing = await runCli(["--json"]);
    assert.notEqual(missing.status, 0);

    const fixture = await mkdtemp(path.join("/tmp", "context-receipt-cli-"));
    const invalidPath = path.join(fixture, "invalid.json");
    const plannedPath = path.join(fixture, "planned.json");
    try {
      await writeFile(invalidPath, "{\"schema\":", "utf8");
      const invalid = await runCli(["--receipt", invalidPath, "--json"]);
      assert.notEqual(invalid.status, 0);
      assert.match(`${invalid.stdout}${invalid.stderr}`, /invalid JSON|receipt/u);

      const planned = loadFixture("PLANNED");
      await writeFile(plannedPath, `${JSON.stringify(planned)}\n`, "utf8");
      const cli = await runCli(["--receipt", plannedPath, "--json"]);
      assert.equal(cli.status, 1);
      assert.deepEqual(JSON.parse(cli.stdout), {
        ok: false,
        receipt_status: "PLANNED",
        gate_status: "NOT_READY",
        outcome: "未就绪",
        context_gap: true,
        exit_code: 1
      });
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  await test("schema/reference and routing expose the producer contract", () => {
    const schemaPath = path.join(
      packageRoot,
      "skills",
      "knowledge",
      "memory-context-contract",
      "references",
      "context-retrieval-receipt.schema.json"
    );
    const referencePath = path.join(
      packageRoot,
      "skills",
      "knowledge",
      "memory-context-contract",
      "references",
      "context-retrieval-receipt.md"
    );
    const skill = fs.readFileSync(
      path.join(packageRoot, "skills", "knowledge", "memory-context-contract", "SKILL.md"),
      "utf8"
    );
    const role = fs.readFileSync(path.join(packageRoot, "agents", "roles", "harness-orchestrator.md"), "utf8");
    const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "harness.manifest.json"), "utf8"));
    const memoryAsset = manifest.assets.skills.find((asset) => asset.id === "memory-context-contract");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    assert.equal(schema.$id, CONTEXT_RECEIPT_SCHEMA);
    assert.deepEqual(schema.required, EXPECTED_FIELDS);
    assert.equal(schema.properties.digest.pattern, "^sha256:[0-9a-f]{64}$");
    assert(fs.existsSync(referencePath));
    for (const [state, file] of Object.entries(FIXTURE_FILES)) {
      const fixture = loadFixture(state);
      assert.equal(fixture.state, state);
      assert.equal(fixture.digest, canonicalReceiptDigest(fixture), `${file} digest drifted`);
    }
    const fixtureReadme = fs.readFileSync(path.join(fixtureRoot, "README.md"), "utf8");
    assert.match(fixtureReadme, /current Codebase[\s\S]*producer/u);
    assert.match(skill, /context-retrieval-receipt\.schema\.json/u);
    assert.match(skill, /\.agents\/skills\/memory-context-contract\/scripts\/context-retrieval-receipt\.mjs/u);
    assert.match(skill, /CONTEXT_READY[\s\S]*READY[\s\S]*已读取/u);
    assert.match(role, /\.agents\/skills\/memory-context-contract\/scripts\/context-retrieval-receipt\.mjs/u);
    assert.doesNotMatch(role, /skills\/knowledge\/memory-context-contract\/scripts\/context-retrieval-receipt\.mjs/u);
    for (const field of ["context_retrieval_receipt_ref", "context_retrieval_gate", "context_gap"]) {
      assert.match(role, new RegExp("`" + field + "`"));
    }
    assert.match(role, /subsequent dispatch packet and coordinator output must[\s\S]*propagate/iu);
    assert(memoryAsset.triggers.includes("context retrieval receipt"));
    assert(!memoryAsset.requires.includes("validated context retrieval receipt"));
  });

  if (producerRoot) {
    await test("optional Codebase producer contract uses the explicitly supplied root", async () => {
      const producer = await loadProducer();
      const planned = await producer.runContextPreflight({
        projectRoot: "/tmp/project",
        claimId: "claim-explicit-producer-planned",
        lane: "architecture",
        query: "where is the owner",
        dryRun: true,
        worktreeAnchor: anchor
      });
      const producerCanonical = await loadProducerCanonicalHash();
      const unsigned = { ...planned };
      delete unsigned.digest;
      assert.equal(planned.digest, producerCanonical.canonicalHash(unsigned));
      assert.deepEqual(validateContextRetrievalReceipt(planned).gate_status, "NOT_READY");

      const ready = await producer.runContextPreflight({
        projectRoot: "/tmp/project",
        claimId: "claim-explicit-producer-ready",
        lane: "governance",
        query: "projection ownership",
        readUri: "viking://resources/project/first.md",
        worktreeAnchor: anchor,
        mcpFactory: fakeMcp()
      });
      assert.equal(ready.digest, producerCanonical.canonicalHash(Object.fromEntries(
        Object.entries(ready).filter(([key]) => key !== "digest")
      )));
      assert.equal(validateContextRetrievalReceipt(ready).gate_status, "READY");
    });
  }
}
