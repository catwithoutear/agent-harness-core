---
artifact: delta-spec
status: draft
tags: [workflow, review, external-workflow]
description: "Behavioral requirements for non-UI workflow, planning, and review absorption."
---

# Workflow Plan Review

## Purpose

Define the generic behavior expected from workflow, planning, and review
enhancements selected from external skill research.

## Traceability

- Source: GitLens skill scan from `/tmp/vscode-gitlens-analysis.xml`.
- Harness targets: `design-doc-refiner`, `architecture-scout`,
  `grill-with-docs`, `review-packet-gate`, `multi-lens-design-review`,
  `planning-reviewer`, and `reviewer`.
- Explicit boundary: no frontend/UI, accessibility, CSS, live runtime, webview,
  or product-specific issue automation in this change.

## ADDED Requirements

### Requirement: Scope packets preserve claim confidence

Before approach selection, a planning artifact MUST separate confirmed,
disputed, and unverifiable source claims when those claims affect the design.

#### Scenario: Rough task includes factual claims

Given a rough task or issue-derived request
When the agent refines it into harness planning artifacts
Then verifiable claims are checked against source or artifacts
And disputed or unverifiable claims remain visible for review

### Requirement: Approach selection compares alternatives

Planning guidance MUST require a recommended approach to name why it wins over
viable alternatives when the design space has more than one credible option.

#### Scenario: Existing pattern may not be optimal

Given current source shows a reusable pattern with known limitations
When the agent prepares an approach proposal
Then it records the status-quo option and at least one alternative
And it states the tradeoff that selects the recommendation

### Requirement: Planning artifact challenge remains evidence-first

Planning artifact challenge guidance MUST verify factual claims against
repository evidence and classify concerns by severity before declaring the
artifact ready for its next workflow step.

#### Scenario: Draft references files and behavior

Given a concrete draft, proposal, plan, design, detailed design, or selected
approach under challenge
When `grill-with-docs` challenges the planning artifact
Then assumptions and factual claims are checked against artifacts or source
And the verdict names blocking, significant, minor, or residual risks

### Requirement: Review gates include completeness and validation gaps

Review guidance MUST distinguish implementation correctness findings from
scope alignment, consumer completeness, and validation-gap findings.

#### Scenario: Implementation touches a shared contract

Given a review packet for a shared contract change
When the reviewer evaluates readiness
Then changed symbols or contracts are traced to relevant consumers
And missing validation is reported as a finding or accepted residual risk

## Deferred Scope

### Deferred Candidate: Speculation does not authorize implementation

Verification guidance MUST distinguish measured evidence, repository
convention evidence, and speculation.

#### Scenario: Improvement claim lacks evidence

Given a proposed improvement with no measurement or owned convention
When the agent prepares a plan or review
Then the claim is recorded as an open question
And it does not become an implementation task without user decision or evidence
