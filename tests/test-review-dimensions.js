import assert from "node:assert/strict";
import { ReviewRunError } from "../skills/review/review-packet-gate/scripts/review-records.mjs";
import {
  activateDimensions,
  buildDimensionInteractionRef,
  buildDimensionRef
} from "../skills/review/review-packet-gate/scripts/review-dimensions.mjs";

const digest = (n = "a") => `sha256:${n.repeat(64)}`;
const ref = { id: "evp-v1:c", digest: digest("c") };

function dimension(overrides = {}) {
  return {
    dimension_id: "dim-v1:state",
    source_locator: "catalog/dimensions.md",
    version: "v1",
    digest: digest("1"),
    activation_conditions: [],
    coverage_mode: "unit",
    authority_kinds: ["coding"],
    gate_inputs: ["review_gate"],
    requiredness: "required",
    ...overrides
  };
}

export async function run(run) {
  await run("activates a valid dimension", async () => {
    const authority = activateDimensions({ coding_authority_refs: [ref], behavioral_authority_refs: [] }, { dimensions: [dimension()] });
    assert.equal(authority.complete, true);
    assert.equal(authority.activated_dimension_refs.length, 1);
  });

  await run("rejects a DimensionRef interaction backlink", async () => {
    assert.throws(() => buildDimensionRef(dimension({ interaction_refs: [] })), ReviewRunError);
  });

  await run("rejects style gate without line mode or projection", async () => {
    assert.throws(() => buildDimensionRef(dimension({ gate_inputs: ["style_gate"], coverage_mode: "unit" })), ReviewRunError);
    assert.doesNotThrow(() => buildDimensionRef(dimension({ gate_inputs: ["style_gate"], coverage_mode: "line" })));
    assert.doesNotThrow(() => buildDimensionRef(dimension({ gate_inputs: ["style_gate"], coverage_mode: "unit", line_projection_ref: ref })));
  });

  await run("rejects empty authority_kinds", async () => {
    assert.throws(() => buildDimensionRef(dimension({ authority_kinds: [] })), ReviewRunError);
  });

  await run("undecidable activation -> DIMENSION_AUTHORITY_GAP and incomplete", async () => {
    const authority = activateDimensions({ coding_authority_refs: [ref] }, { dimensions: [dimension({ activation_conditions: ["maybe"] })] });
    assert.equal(authority.complete, false);
    assert.ok(authority.gap_refs.some((g) => g.gap_kind === "DIMENSION_AUTHORITY_GAP"));
  });

  await run("authority_kind not present in review authority -> gap", async () => {
    const authority = activateDimensions({ coding_authority_refs: [], behavioral_authority_refs: [] }, { dimensions: [dimension({ authority_kinds: ["coding"] })] });
    assert.equal(authority.complete, false);
  });

  await run("builds a one-way interaction with at least two dimensions", async () => {
    assert.throws(() => buildDimensionInteractionRef({ interaction_id: "mix-v1:i", participating_dimension_refs: [ref] }), ReviewRunError);
    const interaction = buildDimensionInteractionRef({ interaction_id: "mix-v1:i", participating_dimension_refs: [ref, { id: "dim-v1:d", digest: digest("d") }], scope_mode: "cluster" });
    assert.equal(interaction.participating_dimension_refs.length, 2);
  });
}
