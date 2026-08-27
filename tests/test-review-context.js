import assert from "node:assert/strict";
import { ReviewRunError } from "../skills/review/review-packet-gate/scripts/review-records.mjs";
import {
  buildSemanticUnit,
  partitionScopeClusters,
  sealContextClosure
} from "../skills/review/review-packet-gate/scripts/review-context.mjs";

const unit = (key) => buildSemanticUnit({ unit_key: key, language: "js", kind: "function", source_locator: `src/${key}.js`, purpose: "test" });

export async function run(run) {
  await run("reaches a fixed point with internal edge and external boundary", async () => {
    const a = unit("a");
    const b = unit("b");
    const resolve = (u) => {
      if (u.unit_key === "a") return [{ relation_kind: "call", to_unit: b }];
      return [{ relation_kind: "import", to_external_locator: "external-lib" }];
    };
    const graph = sealContextClosure({ seedUnits: [a], resolveEdges: resolve });
    assert.equal(graph.complete, true);
    assert.equal(graph.frontier_empty, true);
    assert.equal(graph.unit_refs.length, 2);
    assert.equal(graph.edge_refs.length, 1);
    assert.equal(graph.boundary_refs.length, 1);
  });

  await run("dedups cycles without infinite loop", async () => {
    const a = unit("a");
    const b = unit("b");
    const resolve = (u) => (u.unit_key === "a" ? [{ relation_kind: "call", to_unit: b }] : [{ relation_kind: "call", to_unit: a }]);
    const graph = sealContextClosure({ seedUnits: [a], resolveEdges: resolve });
    assert.equal(graph.complete, true);
    assert.equal(graph.unit_refs.length, 2);
    assert.equal(graph.edge_refs.length, 2);
  });

  await run("budget exceeded -> BOUNDARY_TOO_LARGE gap", async () => {
    const a = unit("a");
    const b = unit("b");
    const resolve = (u) => (u.unit_key === "a" ? [{ relation_kind: "call", to_unit: b }] : [{ relation_kind: "call", to_unit: unit("c") }]);
    const graph = sealContextClosure({ seedUnits: [a], resolveEdges: resolve, budget: { max_depth: 1 } });
    assert.equal(graph.complete, false);
    assert.ok(graph.gap_refs.some((g) => g.gap_kind === "BOUNDARY_TOO_LARGE"));
  });

  await run("unresolved required edge -> CONTEXT_GAP", async () => {
    const a = unit("a");
    const resolve = () => [{ relation_kind: "call", required: true }];
    const graph = sealContextClosure({ seedUnits: [a], resolveEdges: resolve });
    assert.equal(graph.complete, false);
    assert.ok(graph.gap_refs.some((g) => g.gap_kind === "CONTEXT_GAP"));
  });

  await run("requires at least one seed unit", async () => {
    assert.throws(() => sealContextClosure({ seedUnits: [], resolveEdges: () => [] }), ReviewRunError);
  });

  await run("partition assigns each unit exactly one cluster", async () => {
    const a = unit("a");
    const b = unit("b");
    const c = unit("c");
    const edge = {
      from_unit_ref: { id: a.record_id, digest: a.record_digest },
      to_unit_ref: { id: b.record_id, digest: b.record_digest }
    };
    const partition = partitionScopeClusters({
      unit_refs: [a, b, c].map((u) => ({ id: u.record_id, digest: u.record_digest })),
      edge_refs: [edge],
      boundary_refs: []
    });
    assert.equal(partition.complete, true);
    assert.equal(partition.cluster_refs.length, 2); // {a,b} and {c}
  });

  await run("cut edge becomes a boundary edge under per-cluster budget", async () => {
    const a = unit("a");
    const b = unit("b");
    const edge = {
      from_unit_ref: { id: a.record_id, digest: a.record_digest },
      to_unit_ref: { id: b.record_id, digest: b.record_digest }
    };
    const partition = partitionScopeClusters(
      { unit_refs: [a, b].map((u) => ({ id: u.record_id, digest: u.record_digest })), edge_refs: [edge], boundary_refs: [] },
      { max_units_per_cluster: 1 }
    );
    assert.equal(partition.cluster_refs.length, 2);
    assert.equal(partition.boundary_edge_refs.length, 1); // the cut edge is preserved
    assert.equal(partition.internal_edge_refs.length, 0);
  });
}
