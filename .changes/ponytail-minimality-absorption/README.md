---
artifact: change-index
status: draft
tags: [workflow, validation, ponytail-minimality]
description: "Absorb Ponytail minimal-implementation discipline into existing harness workflow and review paths, with harness evaluation last."
---
# Ponytail Minimality Absorption

## Task Summary

- Task: `ponytail-minimality-absorption`
- Source: user direction plus Ponytail at commit
  `2ed6c52c9d7e5e56942508591085fd45dea277d3`.
- Confirmed decisions:
  - absorb every previously identified P0 item;
  - also absorb the P1 native-platform-first check;
  - exclude frontend guidance and examples;
  - assess existing coverage before editing and reuse current harness owners;
  - do not add a parallel workflow, agent mode, state system, dependency, or
    cryptographic evidence mechanism;
  - implement harness behavior evaluation only after the instruction and review
    contracts are settled.

## Current Phase

- Phase: implemented, repository-verified, and live A/B evaluated
- Owner: coordinator
- Live result: `LIVE_AB_COMPLETE`; candidate passed the full behavior gate 3/3,
  baseline 1/3 for `shared-owner-fix`.
- Next checkpoint: owner review and commit decision. The live result is recorded
  in `reviews/minimality-ab-r01.md` with its small-sample and instrument-sequence
  limitations.

## Task Tag Registry

| tag | description |
|---|---|
| `change-scope` | Evidence and decisions specific to this change. |
| `ponytail-minimality` | Minimal-implementation discipline absorbed from Ponytail. |

## Artifact Index

| Artifact | Status | Purpose |
|---|---|---|
| `requirements.md` | draft | Settled absorption scope and acceptance criteria. |
| `research.md` | draft | Current coverage, gaps, and source ownership. |
| `proposal.md` | draft | Smallest reuse-first change shape. |
| `design.md` | draft | File ownership and priority boundaries. |
| `plan.md` | draft | Ordered implementation and validation plan. |
| `tasks.md` | draft | Priority-ordered execution checklist. |
| `specs/README.md` | draft | Delta-spec applicability decision. |
| `reviews/minimality-ab-r01.md` | reviewed | Live behavior A/B result and limitations. |
