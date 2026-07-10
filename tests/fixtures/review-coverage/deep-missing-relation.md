# Incomplete Reviewer Ledger Fixture

## Unit Inventory

| UnitPath | AnchorKind | AnchorValue | UnitRef | Purpose | SurfaceTags | DependencyRefs | InclusionSource |
|---|---|---|---|---|---|---|---|
| lib/example.mjs | symbol | example(value) | lib/example.mjs:10 | fixture behavior | contract | test/example | reviewer |

## Rule Results

| UnitPath | AnchorKind | AnchorValue | RuleId | RuleSourceRef | RuleVersionRef | Applicability | Disposition | EvidenceRefs | FindingRefs | Notes |
|---|---|---|---|---|---|---|---|---|---|---|

## Expected Comparison Result

| GapType | Ref | Required Resolution |
|---|---|---|
| RULE_COVERAGE_GAP | lib/example.mjs symbol example(value) evidence-required | Add one Rule Results row. |
| EVIDENCE_GAP | relation evidence | Add source-backed EvidenceRefs. |
