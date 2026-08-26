import assert from "node:assert/strict";
import { ReviewRunError } from "../skills/review/review-packet-gate/scripts/review-records.mjs";
import {
  buildAuthorityItem,
  buildAuthoritySource,
  resolveReviewAuthority,
  validateAuthorityItem
} from "../skills/review/review-packet-gate/scripts/review-authority.mjs";

const digest = (n = "a") => `sha256:${n.repeat(64)}`;
const sourceRef = { id: "src-v1:x", digest: digest("b") };

export async function run(run) {
  await run("resolves valid sources and items into a complete authority", async () => {
    const authority = resolveReviewAuthority(
      [{ source_locator: "rules/review.md", source_kind: "rules", scope: "*", precedence: 1, version: "v1", digest: digest("1"), availability: "available" }],
      [{ authority_kind: "coding", source_ref: sourceRef, item_anchor: "rule-1", item_digest: digest("2"), scope: "*", precedence: 1, version_ref: "v1", digest: digest("3"), availability: "available" }]
    );
    assert.equal(authority.complete, true);
    assert.equal(authority.coding_authority_refs.length, 1);
    assert.equal(authority.behavioral_authority_refs.length, 0);
  });

  await run("source with no digest -> RULE_VERSION_STALE gap", async () => {
    assert.throws(() => buildAuthoritySource({ source_locator: "rules/x.md", source_kind: "rules", scope: "*", precedence: 1, digest: "nope", availability: "available" }), ReviewRunError);
  });

  await run("unavailable source -> RULE_SOURCE_GAP and incomplete", async () => {
    const authority = resolveReviewAuthority([{ source_locator: "rules/x.md", source_kind: "rules", scope: "*", precedence: 1, digest: digest("4"), availability: "unavailable" }], []);
    assert.equal(authority.complete, false);
    assert.ok(authority.gap_refs.some((g) => g.gap_kind === "RULE_SOURCE_GAP"));
  });

  await run("conflicting same scope+precedence sources -> RULE_AUTHORITY_CONFLICT", async () => {
    const authority = resolveReviewAuthority([
      { source_locator: "a.md", source_kind: "rules", scope: "*", precedence: 1, digest: digest("5"), availability: "available" },
      { source_locator: "b.md", source_kind: "rules", scope: "*", precedence: 1, digest: digest("6"), availability: "available" }
    ], []);
    assert.equal(authority.complete, false);
    assert.ok(authority.gap_refs.some((g) => g.gap_kind === "RULE_AUTHORITY_CONFLICT"));
  });

  await run("validateAuthorityItem rejects missing fields and bad kind/ref", async () => {
    assert.throws(() => validateAuthorityItem({}), ReviewRunError);
    assert.throws(() => validateAuthorityItem({
      authority_item_id: "a", authority_kind: "bogus", source_ref: sourceRef, item_anchor: "x", item_digest: digest(), scope: "*", precedence: 1, version_ref: "v1", digest: digest(), availability: "available", activation_conditions: []
    }), ReviewRunError);
    assert.throws(() => buildAuthorityItem({ authority_kind: "coding", source_ref: { id: "bare" }, item_anchor: "x", item_digest: digest(), scope: "*", precedence: 1, version_ref: "v1", digest: digest(), availability: "available" }), ReviewRunError);
  });
}
