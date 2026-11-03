import assert from "node:assert/strict";
import { measureCoreSkillPromptSurface } from "../lib/core-skill-prompt-surface.js";

// Measured on the core skill packages after the loop reconciliation, the
// review-run routing move, and the reference extraction. The baseline includes
// the review-run routing pointer in the owning skill (default-loaded class), the
// routing reference's one-line authority note (package class), and the 420
// characters that the enforcement baseline adds to ask-harness for branch
// protection routing (this branch is stacked on that change). It also includes
// the 3104 characters that requirement intake, change relations, and the design
// review intake check add across four SKILL.md files (this branch is stacked on
// the prompt single-source change): workflow-control (+1217), change-planner
// (+900), change-workspace-operator (+154), and multi-lens-design-review (+833).
// Those edits add intake before solution design, declared relations for coupled
// or stacked work, and a pointer to the one-outcome rule rather than a second
// copy of it. This branch adds 1492 characters for the acceptance-evidence
// guidance in change-planner (+1260) and review-packet-gate (+232): the planner
// owns the capability-template shape and the exact declaration checks, and the
// review text points at that owner for the check list while keeping the
// review-side judgment of whether the evidence proves the behavior. This branch
// adds 1004 characters (+1004 default-loaded and +1004 package) for the
// solution-decision rule surface: a pointer from workflow-control's required
// materials, a pointer from change-planner's planning admission, and the
// design-review comparison check in multi-lens-design-review. The normative
// rule itself lives in rules/loop-contract.md and is outside this skill metric.
// Review fixes add 37 characters (+37 default-loaded and +37 package net): a
// 76-character pointer from change-workspace-operator to the owning rule, offset
// by a 39-character reduction in multi-lens-design-review that replaces the
// paraphrased trigger and single-option exception with pointer wording while
// adding the rejected-option criterion and missing-assumptions findings.
// This branch moves the eleven role contracts into the workflow-control skill as
// on-demand references and deletes the DSH role plugin. Measured movement against
// the stacked baseline (220858 / 646429): default-loaded +1945 and package
// +70535. Default-loaded carries the compact role index only (table, framing
// lines, and the pointer exchanged for the old ZCode/DSH paragraph in the
// harness-deploy and ask-harness skills), which is what makes the contracts
// discoverable at all; no contract body appears on a default-loaded path. The
// package class carries the contract text, which is reference-only and read only
// when a task matches a role. The always-on description class is unchanged.
// A core skill's prompt surface may grow only when the same change updates the
// matching baseline and records why. Never round a measurement down to fit a
// baseline.
const BASELINES = Object.freeze({
  alwaysOnCoreSkillDescriptionChars: 5306,
  defaultLoadedCoreSkillChars: 222803,
  coreSkillPackageChars: 716964
});

const LOAD_CLASSES = Object.freeze({
  alwaysOnCoreSkillDescriptionChars: "always-on core skill descriptions",
  defaultLoadedCoreSkillChars: "default-loaded core SKILL.md files",
  coreSkillPackageChars: "core skill packages including references"
});

const BASELINE_HELP =
  "Update BASELINES in tests/test-core-skill-prompt-surface.js in the same change and record why the prompt surface grew.";

export async function run(test) {
  await test("core skill prompt surface stays within the recorded baselines", () => {
    const measured = measureCoreSkillPromptSurface();
    assert(measured.coreSkillCount > 0, "core skill prompt surface measurement found no skills");
    const failures = surfaceFailures(measured);
    assert.deepEqual(failures, [], failures.join("\n"));
  });

  await test("core skill prompt surface check reports growth beyond a baseline", () => {
    const inflated = {
      ...BASELINES,
      alwaysOnCoreSkillDescriptionChars: BASELINES.alwaysOnCoreSkillDescriptionChars + 1
    };
    const failures = surfaceFailures(inflated);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /always-on core skill descriptions/);
    assert.match(failures[0], new RegExp(String(inflated.alwaysOnCoreSkillDescriptionChars)));
    assert.match(failures[0], /\+1\)/);
    assert(failures[0].includes("tests/test-core-skill-prompt-surface.js"));
  });
}

function surfaceFailures(measured, baselines = BASELINES) {
  const failures = [];
  for (const [loadClass, baseline] of Object.entries(baselines)) {
    const value = measured[loadClass];
    if (value > baseline) {
      failures.push(
        `${LOAD_CLASSES[loadClass]}: measured ${value} > baseline ${baseline} (+${value - baseline}). ${BASELINE_HELP}`
      );
    }
  }
  return failures;
}
