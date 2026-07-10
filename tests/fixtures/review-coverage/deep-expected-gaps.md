# Expected Coverage Fixture

## Rule Source Inventory

| SourceId | SourceRef | Authority | VersionRef | Availability | Disposition | EvidenceRef |
|---|---|---|---|---|---|---|
| core-review | skills/review/review-packet-gate#Coverage Protocol | repository | content:sha256:expected | available | included | fixture source |

## Expected Unit Inventory

| UnitPath | AnchorKind | AnchorValue | UnitRef | Purpose | SurfaceTags | DependencyRefs | InclusionSource |
|---|---|---|---|---|---|---|---|
| lib/example.mjs | symbol | example(value) | lib/example.mjs:10 | fixture behavior | contract | test/example | fixture |

## Expected Rule Relations

| UnitPath | AnchorKind | AnchorValue | RuleId | RuleSourceRef | RuleVersionRef | TriggerEvidence |
|---|---|---|---|---|---|---|
| lib/example.mjs | symbol | example(value) | evidence-required | skills/review/review-packet-gate#Coverage Protocol | content:sha256:expected | contract change |

## Expected Gaps

| GapType | Expected Ref | Required Result |
|---|---|---|
| RULE_COVERAGE_GAP | evidence-required relation | Report when reviewer result is absent. |
| EVIDENCE_GAP | relation evidence | Report when result has no EvidenceRefs. |
