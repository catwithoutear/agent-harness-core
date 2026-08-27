import { DIGEST_RE, digestValue, fail, finalizeRecord, isCanonicalRef, isPlainObject } from "./review-records.mjs";

/**
 * Versioned dimension authority and one-way interaction graph (R-031).
 *
 * `DimensionInteractionRef` references participating dimensions ONE-WAY;
 * a `DimensionRef` carrying an `interaction_refs` backlink is rejected. The
 * activated interaction set is owned by `DimensionAuthority.activated_interaction_refs[]`.
 */

export const COVERAGE_MODES = Object.freeze(["unit", "hunk", "line", "cluster", "boundary"]);

function assertRef(ref, location) {
  if (!isCanonicalRef(ref)) fail("CANONICAL_REF_MISMATCH", `${location} must be a {id,digest} CanonicalRef`);
}

export function buildDimensionRef({ dimension_id, source_locator, version, digest, activation_conditions = [], coverage_mode, authority_kinds = [], gate_inputs = [], requiredness = "required", evidence_policy_ref, line_projection_ref, interaction_refs }) {
  if (interaction_refs !== undefined) {
    fail("DIMENSION_AUTHORITY_GAP", `DimensionRef ${dimension_id} must not carry an interaction_refs backlink`);
  }
  if (!COVERAGE_MODES.includes(coverage_mode)) fail("DIMENSION_AUTHORITY_GAP", `invalid coverage_mode: ${coverage_mode}`);
  if (!Array.isArray(authority_kinds) || authority_kinds.length === 0) fail("DIMENSION_AUTHORITY_GAP", `dimension ${dimension_id} has empty authority_kinds[]`);
  if (typeof digest !== "string" || !DIGEST_RE.test(digest)) fail("DIMENSION_AUTHORITY_GAP", `dimension ${dimension_id} has no versioned digest`);
  if (gate_inputs.includes("style_gate") && coverage_mode !== "line" && line_projection_ref === undefined) {
    fail("DIMENSION_AUTHORITY_GAP", `style-contributing dimension ${dimension_id} needs line coverage_mode or a line_projection_ref`);
  }
  if (evidence_policy_ref !== undefined) assertRef(evidence_policy_ref, "evidence_policy_ref");
  if (line_projection_ref !== undefined) assertRef(line_projection_ref, "line_projection_ref");

  return finalizeRecord({
    record_type: "dimension",
    dimension_id,
    source_locator,
    version_locator: version,
    digest,
    activation_conditions,
    coverage_mode,
    authority_kinds,
    gate_inputs,
    requiredness,
    evidence_policy_ref,
    line_projection_ref
  }, dimension_id);
}

export function buildDimensionInteractionRef({ interaction_id, participating_dimension_refs, activation_conditions = [], scope_mode, boundary_required = false, evidence_policy_ref }) {
  if (!Array.isArray(participating_dimension_refs) || participating_dimension_refs.length < 2) {
    fail("DIMENSION_AUTHORITY_GAP", `interaction ${interaction_id} must reference at least two dimensions`);
  }
  for (const ref of participating_dimension_refs) assertRef(ref, "participating_dimension_refs");
  if (evidence_policy_ref !== undefined) assertRef(evidence_policy_ref, "evidence_policy_ref");
  return finalizeRecord({
    record_type: "interaction",
    interaction_id,
    participating_dimension_refs,
    activation_conditions,
    scope_mode,
    boundary_required,
    evidence_policy_ref
  }, interaction_id);
}

function evaluateActivation(conditions, dimensionId) {
  if (!Array.isArray(conditions) || conditions.length === 0) return true;
  for (const condition of conditions) {
    if (condition === true) continue;
    if (condition === false) return false;
    // unknown/undecidable -> fail closed
    fail("DIMENSION_AUTHORITY_GAP", `dimension ${dimensionId} has undecidable activation condition: ${condition}`);
  }
  return true;
}

export function activateDimensions(reviewAuthority, dimensionPolicy = {}) {
  const gaps = [];
  const activatedRefs = [];
  const activatedInteractionRefs = [];

  for (const raw of dimensionPolicy.dimensions ?? []) {
    let activated = false;
    try {
      activated = evaluateActivation(raw.activation_conditions, raw.dimension_id);
    } catch {
      gaps.push(finalizeRecord({ record_type: "gap", gap_kind: "DIMENSION_AUTHORITY_GAP", requiredness: "required", blocking: true }, `gap:DIMENSION_AUTHORITY_GAP:${raw.dimension_id}`));
      continue;
    }
    if (!activated) continue;

    try {
      const dimension = buildDimensionRef(raw);
      // every authority_kind must be represented in the review authority
      const knownKinds = new Set([...(reviewAuthority?.coding_authority_refs ?? []).map(() => "coding"), ...(reviewAuthority?.behavioral_authority_refs ?? []).map(() => "behavioral")]);
      for (const kind of dimension.authority_kinds) {
        if (!knownKinds.has(kind)) {
          fail("DIMENSION_AUTHORITY_GAP", `dimension ${dimension.dimension_id} authority_kind ${kind} not present in review authority`);
        }
      }
      activatedRefs.push({ id: dimension.record_id, digest: dimension.record_digest });
    } catch (error) {
      if (error?.code === "DIMENSION_AUTHORITY_GAP") {
        gaps.push(finalizeRecord({ record_type: "gap", gap_kind: "DIMENSION_AUTHORITY_GAP", requiredness: "required", blocking: true }, `gap:DIMENSION_AUTHORITY_GAP:${raw.dimension_id}`));
      } else {
        throw error;
      }
    }
  }

  for (const raw of dimensionPolicy.interactions ?? []) {
    const interaction = buildDimensionInteractionRef(raw);
    activatedInteractionRefs.push({ id: interaction.record_id, digest: interaction.record_digest });
  }

  const base = {
    record_type: "dimension-authority",
    activated_dimension_refs: activatedRefs,
    activated_interaction_refs: activatedInteractionRefs,
    gap_refs: gaps,
    complete: gaps.length === 0
  };
  return finalizeRecord(base, `dauth:${digestValue({ activatedRefs, activatedInteractionRefs })}`);
}
