---
artifact: implementation-design-detail
status: reviewed
tags: [design, implementation, review-coverage, review-verification]
description: "Error contract, retry, rollback, idempotency, and observability model."
---
# Error Model

## N/A Usage

Error behavior is material: the protocol must fail closed for missing identity
or expected source evidence, distinguish staleness from correctness findings,
and avoid treating a helper failure as a lower-assurance pass.

## Error Categories

| Error | Source | Caller-visible result | Retry | Rollback | Verification plan / evidence |
|---|---|---|---|---|---|
| `TARGET_FINGERPRINT_UNAVAILABLE` | Git unavailable, non-worktree root, unresolved base/head, unmerged index, unsupported path/file type, invalid typed path, invalid declaration encoding/BOM, included-input overlap with tracked/selected untracked state, or invalid artifact-set root. | Do not dispatch deep verifier; `coverage_gate=NOT_READY` with reason. | Only after caller fixes the input or environment. | Discard draft packet and helper stdout; no source mutation. | Temp-repo/helper tests for each invalid boundary. |
| `TARGET_RECOMPUTE_UNAVAILABLE` | Inventory or compare lacks a complete copied target block, required accessible code/artifact root, or declaration path for the declared target kind. | `coverage_gate=NOT_READY`; copied digest equality alone is insufficient for deep execution. | Provide the complete target block and local execution coordinate, then rerun helper. | Do not join expected packet and ledger. | Role/fixture scenario for missing copy/root/declaration. |
| `TARGET_FINGERPRINT_MISMATCH` | Verifier recomputation differs from packet fingerprint. | `STALE_REVIEW`; comparison stops. | Recompute and re-inventory for the new target. | Prior ledger remains evidence only for the previous target. | Modify staged, unstaged, untracked, declared input, or artifact-set content and assert new digest. |
| `PACKET_SEAL_INVALID` | Missing, duplicate, malformed, or changed self-normalized `PacketDigest` marker. | `NOT_READY`; expected packet is not immutable. | Recreate/seal the packet. | Do not compare against an unsealed packet. | Packet helper tests. |
| `PACKET_SEAL_MISMATCH` | Existing marker differs from recomputed digest. | `STALE_REVIEW` and re-seal/re-inventory decision. | Only after coordinator confirms whether content changed intentionally. | Preserve original packet for formal evidence when persisted. | Change one expected relation in fixture. |
| `RULE_SOURCE_GAP` | Required discoverable source missing, unreadable, version-ambiguous, or not dispositioned. | `coverage_gate=NOT_READY` or `NEEDS_USER_DECISION`; never silent exclusion. | Re-run after source is materialized or owner decides limitation. | No automatic downgrade. | Fixture and fresh-agent evaluation. |
| `UNIT_IDENTITY_GAP` | UnitPath/anchor invalid, duplicated, or ambiguous. | Comparison refuses inferred relation matching. | Correct the packet/ledger anchors then compare again. | Prior ambiguous rows are not carried forward. | Fixture with overloaded/repeated anchor. |
| `RULE_COVERAGE_GAP`, `APPLICABILITY_GAP`, `EVIDENCE_GAP` | Required relation, justified N/A, or evidence is absent. | Coverage result remains `NOT_READY` until dispositioned or owner decision records an allowed limitation. | Re-review targeted relation. | Keep prior finding and gap evidence. | Planted omission fixtures and forward evaluation. |
| `CONCLUSION_CONFLICT` | Verifier evidence contradicts reviewer outcome. | Preserve both; coordinator decides re-review or council at high risk. | Targeted correctness re-review. | Do not overwrite either evidence set. | Fresh-agent evaluation/report. |
| Later implementation verification failure | Test/build/static/runtime evidence fails after coverage result. | Preserve coverage evidence; set implementation-verification and overall gates `NOT_READY`. | Fix and re-review affected target. | No coverage gate rewrite without target change. | Four-gate fixture and source text check. |

## Idempotency

- `target` is a pure read of a named code root, typed paths, and opaque
  declaration bytes. Re-running with byte-identical Git state and declaration
  returns identical component and
  aggregate digests.
- Declaration bytes are canonicalized as no-BOM UTF-8, CRLF/bare CR converted
  to LF, and exactly one terminal LF. This makes equivalent line endings and
  trailing blank lines idempotent while preserving every non-terminal byte.
- `artifact-set` is likewise a pure read of a named artifact root, include paths,
  and declaration bytes. Re-running with identical bytes, types, executable bits, and
  exclusions returns identical component and aggregate digests.
- `packet` is a pure read of one file. LF and CRLF forms with identical logical
  bytes after newline normalization produce the same digest. A changed payload
  or a different marker count never yields the same valid seal.
- Repeated role dispatch does not mutate a packet. Only the coordinator may
  write a packet or persist formal evidence under the existing change workspace.
- Re-review is not an idempotent reuse of prior evidence: a changed target,
  packet, RuleRef version, UnitKey, or material dependency requires targeted
  reinventory/recomparison as frozen by the upstream design.

## Cleanup and Partial Failure

- The helper creates no files, lock, cache, branch, worktree, or projection. A
  caller-created temporary input declaration is caller-owned and must be deleted
  after the command unless it is intentionally persisted in a formal review
  artifact.
- A command that emits an error must not emit a partial fingerprint that later
  roles can treat as valid. JSON failure output includes an error code and
  human-readable reason; process exit is non-zero.
- If phase 1 is complete but sealing fails, the expected packet is draft only.
  The coordinator may retain it for diagnosis but must not supply it to compare.
- If reviewer output arrives after target staleness, it remains review evidence
  for its recorded target but cannot be joined to a new Expected Coverage Packet.

## Logs, Metrics, and Troubleshooting Anchors

- The helper emits machine-readable fields for `command`, `status`,
  `target_fingerprint` or `packet_digest`, component names, and non-sensitive
  failure code. It never prints raw file contents, rule text, or absolute paths
  in portable output.
- The review packet records the portable digests, base/head object IDs,
  declared input dispositions, and optional local execution coordinates. These
  are the troubleshooting anchors for stale or scope disputes.
- No metrics, telemetry, network calls, or durable logging are introduced in
  V1. Formal troubleshooting evidence belongs in an existing review round only
  when it changes a gate decision.
