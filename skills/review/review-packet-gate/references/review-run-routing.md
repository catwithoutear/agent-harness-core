## Review-Run Routing

Lifecycle detail in this reference is routing context only; the authoritative
lifecycle is `review-packet-gate:Review-Run Protocol`.

Ordinary source review and optional fresh lenses may produce a report without
formal coverage assurance. Do not require review-run to report a source-proven
defect. Formal structured reviews use the single unversioned
`protocol=review-run` route.
Do not select a route from assurance labels, Markdown shape, provider, or a
reviewer assertion, and do not fall back to an older review protocol. Validate
the request, target identity, risk facts, and immutable dispatch contract before
dispatching either agent; malformed input is `NOT_READY`.

Persist the exact rules, scope, dimensions, and relation identities in the
dispatch contract and give it to the reviewer. New formal requests default to
`execution_profile=native`, including natural-language requests to delegate a
subagent for formal deep review. Use the actual native subagent API and a fresh
conversation when supported; source navigation, returned execution evidence,
capability comparison and main acceptance remain required. This selection does
not assert hard isolation or need signing credentials. Only explicitly selected
`execution_profile=isolated` requires provider capability and runtime-conformance
preflight; a failure there must not automatically downgrade to native.

Verifier Phase A receives only the machine-built closed-schema neutral packet;
expected rules, relations, dispatch, reviewer
output and prior conclusions are forbidden. After both lanes seal, Phase B may
compare the sealed universes and reviewer ledger. The coordinator alone
composes `overall_gate`.

The `requested_assurance` values `quick`, `standard`, and `deep` control the
amount of evidence inside this one protocol. They do not select different
protocols or reduce the full task scope and semantic dimensions. Requested or risk-mandated formal independent coverage assurance uses
the review-run lifecycle. A fresh independent perspective alone is not a request
for formal coverage assurance. Never downgrade an applicable formal gate
without owner authorization or claim equivalent assurance from a plain review.
Reviewer outcomes carry `execution_status` separately
from the derived `conclusion`; immutable `ReviewFinding` records preserve
`blocking_class` and evidence, and no finding is hidden by a later clear retry.

The managed lifecycle is `created -> target-view-sealed -> run-binding-sealed ->
dual-discovery-open -> discovery-barrier-closed -> dispatch-sealed -> reviewing ->
review-facts-closed -> outcomes-selected -> verifier-compared -> gated ->
completed|invalidated`. Initialize the run root with `init-review-run`; persist
canonical subject, authority, dimension, surface, context, obligation, dispatch,
output, finding, invalidation, and gate records below `review-runs/<run-id>/`.
The discovery barrier closes only after both expected and observed lanes seal;
explicitly isolated execution additionally requires its provider attestations.
Native inventory/review uses distinct actual actor identities and original
outputs, with source checks and semantic acceptance before closure. Failed,
cancelled, stale, duplicate, and
unassigned work remains visible, and missing target, source, or implementation
evidence is fail-closed.

The portable facade additionally enforces
`created -> discovering -> discovery-sealed -> planning -> dispatch-ready ->
running -> aggregating -> terminal`. Admit reviewer attempts with explicit
deadlines and bounded retries. Diagnostic checkpoints remain non-gating;
timeout sweeps persist typed failed ledgers. The managed `dispatch` transition
does not itself start an actor: the coordinator launches the actual host
subagent, binds its machine packet and returned output, and appends only the
owner's result. A different run id cannot sanitize an inventory execution that
already saw expected-lane data. Native records provide traceability; they do not
prove absent ambient filesystem, tools or memory mounts.

For formal review-run results, always carry the five evidence gates —
`coverage_gate`, `review_gate`,
`independent_review_gate`, `style_gate`, and `implementation_verification_gate`
— plus the coordinator-owned derived `overall_gate`. Missing required evidence
yields `NOT_READY`; a completed coverage comparison does not override a
correctness or verification blocker, and `overall_gate` is never READY unless
all five evidence gates are READY.
