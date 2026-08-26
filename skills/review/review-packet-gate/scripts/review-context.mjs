import { digestValue, fail, finalizeRecord, isPlainObject } from "./review-records.mjs";

/**
 * Fixed-point semantic context closure and scope-cluster partition (R-010, R-033).
 *
 * `sealContextClosure` expands required edges from seed units until the
 * frontier is empty, materializing in-scope target units and recording
 * terminal external boundaries. Reaching a budget or leaving a required edge
 * unresolved never seals `complete=true`.
 *
 * `partitionScopeClusters` derives a bounded partition where every unit belongs
 * to exactly one cluster and every edge is either internal or a boundary edge
 * with explicit endpoints (a cut edge must never vanish from the packet).
 */

export function buildSemanticUnit({ unit_key, language, kind, source_locator, purpose, hunk_refs = [], changed_line_refs = [] }) {
  if (typeof unit_key !== "string" || !unit_key) fail("UNIT_IDENTITY_GAP", "unit_key is required");
  return finalizeRecord({
    record_type: "semantic-unit",
    unit_key,
    language,
    kind,
    source_locator,
    purpose,
    hunk_refs,
    changed_line_refs
  }, `unit:${digestValue({ unit_key })}`);
}

function edgeKey(edge) {
  const to = edge.to_unit_key ?? edge.to_external_locator ?? "?";
  return digestValue({ from: edge.from_unit_key, relation_kind: edge.relation_kind, to });
}

function finalizeEdge(edge, fromRef) {
  return finalizeRecord({
    record_type: "context-edge",
    from_unit_ref: fromRef,
    relation_kind: edge.relation_kind,
    to_unit_ref: edge.to_unit_ref ?? undefined,
    to_external_locator: edge.to_external_locator,
    discovery_method: edge.discovery_method,
    status: edge.status ?? "resolved",
    required: edge.required ?? true
  }, `edge:${edgeKey(edge)}`);
}

export function sealContextClosure({ seedUnits, resolveEdges, budget = {} }) {
  if (!Array.isArray(seedUnits) || seedUnits.length === 0) {
    fail("CONTEXT_GAP", "context closure requires at least one seed unit");
  }
  if (typeof resolveEdges !== "function") {
    fail("CONTEXT_GAP", "context closure requires a resolveEdges function");
  }

  const maxDepth = budget.max_depth ?? Infinity;
  const maxSize = budget.max_size ?? Infinity;

  const units = new Map(); // unit_key -> record
  const edges = new Map(); // edgeKey -> record
  const boundaries = new Map(); // edgeKey -> record
  const gapRefs = [];
  let iterationCount = 0;

  const frontier = [];
  const enqueue = (unit) => {
    if (!units.has(unit.unit_key)) {
      units.set(unit.unit_key, unit);
      frontier.push(unit);
    }
  };
  seedUnits.forEach(enqueue);

  const sizeBudgetExceeded = () => units.size + edges.size + boundaries.size >= maxSize;

  while (frontier.length > 0) {
    iterationCount += 1;
    if (iterationCount > maxDepth) {
      gapRefs.push(finalizeRecord({ record_type: "gap", gap_kind: "BOUNDARY_TOO_LARGE", requiredness: "required", blocking: true }, `gap:BOUNDARY_TOO_LARGE:${iterationCount}`));
      break;
    }
    const unit = frontier.pop();
    const fromRef = { id: unit.record_id, digest: unit.record_digest };

    for (const raw of resolveEdges(unit)) {
      const key = digestValue({ from: unit.unit_key, relation_kind: raw.relation_kind, to: raw.to_unit?.unit_key ?? raw.to_external_locator ?? "?" });
      if (edges.has(key) || boundaries.has(key)) continue; // dedup

      if (raw.to_unit) {
        // internal edge: materialize target and keep expanding
        if (sizeBudgetExceeded()) {
          gapRefs.push(finalizeRecord({ record_type: "gap", gap_kind: "BOUNDARY_TOO_LARGE", requiredness: "required", blocking: true }, `gap:BOUNDARY_TOO_LARGE:${key}`));
          break;
        }
        const edge = finalizeRecord({
          record_type: "context-edge",
          from_unit_ref: fromRef,
          relation_kind: raw.relation_kind,
          to_unit_ref: { id: raw.to_unit.record_id, digest: raw.to_unit.record_digest },
          discovery_method: raw.discovery_method,
          status: "resolved",
          required: raw.required ?? true
        }, `edge:${key}`);
        edges.set(key, edge);
        enqueue(raw.to_unit);
      } else if (raw.to_external_locator) {
        const boundary = finalizeRecord({
          record_type: "context-boundary",
          edge_ref: { id: `edge:${key}`, digest: digestValue({ key }) },
          boundary_kind: raw.relation_kind,
          external_locator: raw.to_external_locator,
          status: "terminal",
          required: raw.required ?? true
        }, `bnd:${key}`);
        boundaries.set(key, boundary);
      } else if (raw.required !== false) {
        gapRefs.push(finalizeRecord({ record_type: "gap", gap_kind: "CONTEXT_GAP", requiredness: "required", blocking: true }, `gap:CONTEXT_GAP:${key}`));
      }
    }
  }

  const frontierEmpty = frontier.length === 0;
  const complete = frontierEmpty && gapRefs.length === 0;

  return finalizeRecord({
    record_type: "context-graph",
    seed_unit_refs: seedUnits.map((u) => ({ id: u.record_id, digest: u.record_digest })),
    unit_refs: [...units.values()].map((u) => ({ id: u.record_id, digest: u.record_digest })),
    edge_refs: [...edges.values()].map((e) => ({ id: e.record_id, digest: e.record_digest })),
    boundary_refs: [...boundaries.values()].map((b) => ({ id: b.record_id, digest: b.record_digest })),
    frontier_empty: frontierEmpty,
    iteration_count: iterationCount,
    gap_refs: gapRefs,
    complete
  }, `ctx:${digestValue([...units.keys()].sort())}`);
}

export function partitionScopeClusters(contextGraph, { max_units_per_cluster = Infinity } = {}) {
  if (!isPlainObject(contextGraph)) fail("CONTEXT_CLUSTER_GAP", "context graph must be an object");
  const unitRefs = contextGraph.unit_refs ?? [];
  const edgeRefs = contextGraph.edge_refs ?? [];
  const boundaryRefs = contextGraph.boundary_refs ?? [];

  const byId = new Map(unitRefs.map((u) => [u.id, u]));
  const adjacency = new Map(unitRefs.map((u) => [u.id, new Set()]));
  for (const edge of edgeRefs) {
    const from = edge.from_unit_ref?.id;
    const to = edge.to_unit_ref?.id;
    if (from && to && adjacency.has(from) && adjacency.has(to)) {
      adjacency.get(from).add(to);
      adjacency.get(to).add(from);
    }
  }

  // connected components
  const seen = new Set();
  const components = [];
  for (const id of unitRefs.map((u) => u.id)) {
    if (seen.has(id)) continue;
    const component = [];
    const stack = [id];
    seen.add(id);
    while (stack.length > 0) {
      const current = stack.pop();
      component.push(current);
      for (const next of adjacency.get(current) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    components.push(component);
  }

  // enforce per-cluster budget by splitting oversize components (cut edges preserved as boundary edges)
  const clusters = [];
  for (const component of components) {
    for (let i = 0; i < component.length; i += Math.max(1, max_units_per_cluster)) {
      clusters.push(component.slice(i, i + Math.max(1, max_units_per_cluster)));
    }
  }

  const unitToCluster = new Map();
  const clusterRecords = [];
  const cutBoundaryEdgeRefs = [];

  for (const cluster of clusters) {
    for (const unitId of cluster) unitToCluster.set(unitId, clusterRecords.length);
    clusterRecords.push(finalizeRecord({
      record_type: "scope-cluster",
      unit_refs: cluster.map((id) => byId.get(id)),
      internal_edge_refs: [],
      boundary_edge_refs: []
    }, `cluster:${digestValue(cluster.sort())}`));
  }

  // classify edges
  const internalRefs = [];
  for (const edge of edgeRefs) {
    const from = edge.from_unit_ref?.id;
    const to = edge.to_unit_ref?.id;
    if (from && to && unitToCluster.get(from) === unitToCluster.get(to)) {
      internalRefs.push(edge);
    } else {
      // cut edge -> boundary edge (never vanish)
      cutBoundaryEdgeRefs.push(edge);
    }
  }

  const base = {
    record_type: "cluster-partition",
    cluster_refs: clusterRecords.map((c) => ({ id: c.record_id, digest: c.record_digest })),
    internal_edge_refs: internalRefs,
    boundary_edge_refs: [...cutBoundaryEdgeRefs, ...boundaryRefs],
    complete: unitToCluster.size === unitRefs.length
  };
  return finalizeRecord(base, `partition:${digestValue(clusters.map((c) => c.sort()))}`);
}
