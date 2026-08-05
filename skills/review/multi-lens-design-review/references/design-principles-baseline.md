# Code And Architecture Design Principles Baseline

Use this baseline to test whether a design is understandable, implementable,
safe under its stated risks, and able to evolve without unnecessary cost. It is
a review aid, not a scorecard and not a substitute for repository evidence.

## How To Apply The Baseline

For every code or architecture design review:

1. Screen each principle family for applicability before selecting the detailed
   review lenses. Do not silently omit a material family.
2. Investigate only the items that can affect the target's correctness,
   readiness, operability, or cost. Report the smallest set of material findings.
3. Classify each investigated item as:
   - `Satisfied`: evidence supports the design;
   - `Finding`: the design conflicts with evidence or omits a material contract;
   - `Needs Confirmation`: the risk is plausible but evidence is incomplete;
   - `Accepted Tradeoff`: the design names the cost, benefit, owner, and guardrail;
   - `N/A - <reason>`: the principle does not apply to this target.
4. Treat a principle name as a diagnostic prompt, not proof. “Uses SOLID”, “is
   simple”, or “is scalable” is not evidence.
5. Preserve proportionality. A local, reversible change needs less design than a
   cross-boundary, persistent, concurrent, or difficult-to-roll-back change.

Do not print every item in the final review. Include material findings, accepted
tradeoffs that must travel forward, and `N/A` decisions whose omission would
otherwise be ambiguous.

## Evidence Standard

Prefer current, inspectable evidence:

- accepted requirements, non-goals, constraints, and owner decisions;
- source anchors, dependency or call paths, and nearby repository precedents;
- responsibility, interface, data ownership, lifecycle, state, sequence, error,
  consistency, resource, security, migration, and rollout descriptions;
- test seams, verification plans, operational signals, and rollback boundaries;
- measured workloads or stated assumptions for quantitative claims.

Distinguish design intent from implemented or executed evidence. A planned test,
budget, dashboard, migration, or rollback is not proof that it exists or works.
When evidence is unavailable, narrow the claim or return `Needs Confirmation`.

Each principle below defines its intent, review questions, useful evidence, and
warning signs or tradeoffs. The examples are illustrative rather than required
document formats.

## Code Design Principles

### CQ-01 Focused Responsibility And Cohesion

- **Intent:** A function, type, or module has one primary reason to change;
  behavior and data that uphold the same invariant stay together, while
  unrelated policy and mechanism do not accumulate in a catch-all owner. This
  produces high cohesion inside the boundary and low coupling outside it.
- **Ask:** What responsibility and invariant does the unit own? What does it
  explicitly not own? Would one requirement change force unrelated behavior to
  change or be retested?
- **Evidence:** responsibility tables, module boundaries, source ownership,
  change reasons, focused tests, and callers that use a coherent interface.
- **Warning signs and tradeoffs:** manager/util/common classes, long unrelated
  method groups, feature flags selecting unrelated behavior, or coordination
  spread across many helpers. Splitting too finely can increase navigation and
  coordination cost; separate by responsibility, not line count.

### CQ-02 Information Hiding, Contracts, And Invariants

- **Intent:** Expose the smallest stable contract needed by consumers. Keep
  representation, ordering, caching, storage, synchronization, and other
  replaceable decisions behind the owner that maintains their invariants.
- **Ask:** Which operations and data must consumers observe? Can callers create
  invalid state, depend on call order, or reach through one module into another's
  internals? Are preconditions, postconditions, and invariants explicit?
- **Evidence:** public and internal interface drafts, visibility rules, data
  constructors or validators, invariants, compatibility promises, and consumer
  inventories.
- **Warning signs and tradeoffs:** exposed mutable fields, pass-through APIs that
  mirror an implementation, leaky storage or SDK types, broad getters, friend or
  global access, and undocumented temporal coupling. Diagnostic or performance
  access may justify exposure when its stability and ownership are explicit.

### CQ-03 Dependency Direction And Abstraction Fitness

- **Intent:** Stable business rules depend on stable contracts, not volatile
  database, transport, UI, framework, vendor SDK, process, or deployment details.
  Abstractions exist at the boundary whose variability they protect.
- **Ask:** Which side owns the contract? Does the dependency point toward the
  more stable policy? Can the core behavior be tested or reused without loading
  the technical adapter? Is an abstraction backed by real variation or merely a
  wrapper?
- **Evidence:** allowed and forbidden dependencies, import or link graph,
  interface ownership, adapters, test doubles, and known alternate consumers or
  providers.
- **Warning signs and tradeoffs:** domain APIs returning infrastructure types,
  framework annotations controlling core behavior, circular dependencies,
  service locators, or one-implementation interfaces with no protected seam.
  Direct dependency is often simpler when volatility and substitution risk are
  genuinely low.

### CQ-04 Composition, Substitutability, And Extension

- **Intent:** Extend behavior by composing focused collaborators, policies, and
  strategies. Use inheritance only for a real substitutable relationship with a
  stable base contract.
- **Ask:** Can the variation be expressed as data, a strategy, or a collaborator?
  Does every subtype preserve base invariants and consumer expectations? Does an
  extension require editing many conditionals or inheriting implementation state?
- **Evidence:** collaboration diagram, strategy boundaries, subtype contract,
  extension examples, and tests shared across implementations.
- **Warning signs and tradeoffs:** deep hierarchies, inheritance for code reuse or
  configuration, fragile protected state, type switches, and empty override
  hooks. A small closed conditional can be clearer than a plugin abstraction for
  unconfirmed variation.

### CQ-05 Ownership, Lifetime, And Resource Safety

- **Intent:** Every object, resource, callback, task, subscription, lock, file,
  connection, buffer, and cache has a clear creator, owner, borrower, transfer
  rule, cleanup point, and lifetime relation. Cleanup follows structured lifetime
  management and works on every exit path.
- **Ask:** Who creates, owns, shares, borrows, transfers, and destroys it? Can it
  outlive a dependency or callback target? What happens on error, cancellation,
  timeout, or partial construction? Is shared ownership truly required?
- **Evidence:** ownership and lifecycle tables, copy/move or sharing rules,
  structured cleanup, shutdown sequence, leak tests, and resource-limit tests.
- **Warning signs and tradeoffs:** raw owning references, hidden global owners,
  unbounded caches, detached work, manual cleanup duplicated across branches,
  cycles, ambiguous callback capture, and shared ownership used for convenience.
  Language mechanisms differ; the invariant is deterministic, exception-safe or
  failure-safe release rather than one mandated syntax.

### CQ-06 Explicit State, Data Shape, And Local Reasoning

- **Intent:** Represent valid domain and lifecycle states directly, make illegal
  combinations difficult to express, and keep transitions near the owner of the
  affected invariant. Prefer immutable values and explicit inputs over hidden
  mutable context.
- **Ask:** What are the valid states and transitions? Can independent booleans or
  nullable fields form impossible combinations? Where are transition guards and
  invariants enforced? Can a reader understand the unit without reconstructing
  distant global state or call history?
- **Evidence:** state table or machine, transition ownership, typed data model,
  invariants, transition tests, and explicit dependency/input lists.
- **Warning signs and tradeoffs:** boolean state explosions, magic values,
  action-at-a-distance, writeable globals, hidden ordering requirements, and
  duplicated transition logic. A formal state machine is unnecessary for a
  small linear flow with few valid states and no recovery complexity.

### CQ-07 Concurrency, Cancellation, And Coordination

- **Intent:** Make execution ownership, synchronization, cancellation, ordering,
  and load behavior explicit. Prefer message passing, immutability, confinement,
  or structured concurrency before shared mutable state.
- **Ask:** Which operations may overlap, race, block, or reorder? Who owns task
  lifetime and cancellation? What consistency is required around shared state?
  Are locks, queues, workers, and callbacks bounded and deadlock-safe?
- **Evidence:** concurrency model, happens-before or serialization rules, lock or
  queue ownership, cancellation propagation, deadlines, race tests, and load
  assumptions.
- **Warning signs and tradeoffs:** detached tasks, locks held across external
  calls, inconsistent lock order, implicit thread affinity, lost cancellation,
  unbounded fan-out, polling loops, and callbacks after owner destruction.
  Serialization can be safer than parallelism when throughput evidence does not
  justify the additional state space.

### CQ-08 Explicit Errors And Failure Semantics

- **Intent:** Interfaces distinguish success from expected failure and preserve
  actionable context. They define which failures are retryable, terminal,
  partial, cancelled, timed out, or programmer errors without leaking secrets or
  implementation trivia.
- **Ask:** What can fail, at which boundary, and what can the caller do? Is error
  identity stable and context causal? Can retries duplicate effects? What cleanup
  and state remain after failure?
- **Evidence:** error taxonomy, caller-visible result contract, context and cause
  chain, retry classification, cleanup/rollback behavior, error codes, and
  success/failure tests.
- **Warning signs and tradeoffs:** swallowed exceptions, boolean success,
  free-form strings as contracts, universal retry, loss of causal context,
  exceptions crossing incompatible boundaries, or logs as the only error path.
  Not every internal failure needs a public type; translate at ownership
  boundaries while retaining diagnostic cause.

### CQ-09 Simplicity, Necessity, And Conceptual Economy

- **Intent:** Satisfy confirmed requirements with the fewest concepts, states,
  layers, branches, and implicit rules that preserve correctness and required
  evolution. Apply KISS and YAGNI to both code and design.
- **Ask:** Which current requirement or verified risk justifies each abstraction,
  extension point, configuration option, or state? Is there a smaller design
  using existing mechanisms? What complexity is essential rather than merely
  relocated?
- **Evidence:** requirement traceability, rejected simpler alternatives,
  repository precedents, complexity comparison, and named future commitments.
- **Warning signs and tradeoffs:** speculative plugins, broad frameworks,
  configuration for hypothetical variation, parallel mechanisms, excessive
  wrappers, or “generic” APIs without consumers. Simplicity is not permission to
  omit failure handling, validation, security, or maintainability.

### CQ-10 Reuse, Duplication, And Knowledge Ownership

- **Intent:** Keep each business rule and invariant under one authoritative
  owner. Reuse established behavior when semantics match; tolerate incidental
  structural similarity when forced reuse would couple unrelated change reasons.
- **Ask:** Is the same rule, conversion, validation, state transition, or error
  mapping maintained in more than one place? Does a proposed shared abstraction
  represent one concept or only similar syntax?
- **Evidence:** repository search, caller and consumer map, shared owner, parity
  tests, and change history showing coupled or independent evolution.
- **Warning signs and tradeoffs:** copy-pasted policy, parallel validators,
  divergent constants, near-identical protocol adapters, or a “common” module
  that attracts unrelated helpers. DRY applies to knowledge, not every repeated
  line; premature deduplication can create worse coupling.

### CQ-11 Testability And Verification Seams

- **Intent:** Important behavior and failure paths can be falsified at the
  narrowest stable boundary without invasive production hooks or dependence on
  unrelated infrastructure.
- **Ask:** Which invariant and primary risk does each test seam expose? Can time,
  randomness, I/O, concurrency, and external effects be controlled? Does the
  design permit failure, cancellation, and recovery tests as well as success?
- **Evidence:** test seam map, deterministic inputs, contract tests, state and
  failure scenarios, fixtures, and a phase-appropriate verification plan.
- **Warning signs and tradeoffs:** tests requiring global environment mutation,
  private-state inspection, sleeps, real remote systems for local rules, or
  test-only branches in production code. Do not distort a small stable API only
  to make every internal step mockable.

### CQ-12 Secure And Least-Exposed Code Boundaries

- **Intent:** Validate untrusted input at the owning boundary, minimize authority
  and sensitive-data exposure, and make privileged effects explicit and
  auditable.
- **Ask:** Which inputs, identities, capabilities, and data cross trust
  boundaries? Can callers exercise more authority than required? Are secrets or
  personal data retained, logged, cached, or returned unnecessarily?
- **Evidence:** trust-boundary map, validation and authorization ownership,
  sensitive-data flow, redaction rules, least-privilege interface, and abuse or
  misuse cases proportionate to risk.
- **Warning signs and tradeoffs:** ambient credentials, implicit authorization,
  broad tokens or handles, sensitive logs, unchecked deserialization, confused
  deputy paths, and security delegated entirely to a framework default. Avoid
  turning an ordinary design review into a full security audit when no material
  trust boundary changes.

## Architecture Design Principles

### AQ-01 Capability-Centered Boundaries

- **Intent:** Organize modules and services around cohesive business or runtime
  capabilities and their invariants, not merely technical buckets such as
  Controller, Service, Manager, Util, or Data.
- **Ask:** What capability and decisions does each boundary own? What is outside
  it? Does one change require edits across many technical layers, or does a
  technical bucket own unrelated capabilities?
- **Evidence:** capability map, subsystem/module responsibility table, non-goals,
  change ownership, interfaces, and end-to-end behavior slices.
- **Warning signs and tradeoffs:** horizontal dumping grounds, shared database as
  the only boundary, one service per entity, or capability logic scattered
  across generic layers. Small systems may remain a modular monolith; capability
  boundaries do not require network services.

### AQ-02 Stable Boundaries And Dependency Direction

- **Intent:** Make allowed dependencies explicit, prevent cycles, and point
  dependencies from volatile delivery/infrastructure details toward stable
  policy contracts. Limit knowledge exchanged across boundaries.
- **Ask:** Which module may call, import, instantiate, or persist which other
  module? Who owns shared contracts? Can core behavior change or run without a
  specific adapter or deployment topology?
- **Evidence:** dependency diagram, allowed/forbidden table, contract owner,
  build/import graph, adapter boundary, and compatibility policy.
- **Warning signs and tradeoffs:** cycles, bidirectional callbacks, shared mutable
  internals, domain-to-vendor dependencies, distributed monoliths, and utility
  modules imported everywhere. Added indirection must protect a real stability
  boundary.

### AQ-03 Data Ownership, Integrity, And Evolution

- **Intent:** Every authoritative datum and invariant has one accountable module.
  Readers, replicas, indexes, caches, and derived views have explicit freshness,
  mutation, reconciliation, retention, and schema-evolution rules.
- **Ask:** Who may create, validate, mutate, delete, and publish the datum? Which
  copy is authoritative? How do consumers handle stale or unknown fields? How is
  ownership transferred or migrated?
- **Evidence:** data ownership table, schema and invariant definitions, write
  paths, replication/cache rules, retention, migration, compatibility, and
  reconciliation plans.
- **Warning signs and tradeoffs:** shared writes, database tables treated as
  ownerless integration APIs, duplicated authorities, hidden cache invalidation,
  destructive schema assumptions, and derived data with no rebuild path.
  Denormalization can be valid when ownership and repair are explicit.

### AQ-04 Consistency And Distributed Correctness

- **Intent:** Match consistency strength to business invariants and define the
  complete effect protocol: transaction boundary, idempotency identity,
  ordering, deduplication, retry, compensation, reconciliation, and convergence.
- **Ask:** Which operations must be atomic or ordered? What happens after an
  ambiguous timeout, duplicate delivery, replay, concurrent update, or partial
  commit? How is divergence detected and repaired?
- **Evidence:** consistency model, transaction and commit boundaries,
  idempotency keys, versioning or concurrency control, retry/compensation table,
  outbox/inbox or equivalent protocol, and reconciliation flow.
- **Warning signs and tradeoffs:** “exactly once” without a protocol, retries of
  non-idempotent effects, dual writes, last-write-wins by accident, unbounded
  compensation, or eventual consistency with no convergence owner. Stronger
  consistency can reduce availability or throughput; state the chosen tradeoff.

### AQ-05 Failure Design, Recovery, And Degraded Modes

- **Intent:** Treat timeout, crash, restart, duplicate request, partial success,
  dependency unavailability, corruption, and operator error as normal design
  inputs. Define safe recovery and the state visible during degradation.
- **Ask:** What fails independently? What work is committed, rolled back,
  resumed, abandoned, or quarantined? Can recovery repeat safely? What does the
  caller observe, and when is operator intervention required?
- **Evidence:** failure-mode table, timeout and retry policy, state transitions,
  checkpoint/recovery flow, rollback or compensation, fallback, degraded-mode
  contract, and disaster-recovery assumptions.
- **Warning signs and tradeoffs:** success-only sequences, infinite retry,
  fail-open or fail-closed behavior left implicit, recovery that depends on
  memory state, manual repair with no audit trail, and fallback that silently
  violates invariants.

### AQ-06 Fault Isolation, Backpressure, And Resource Governance

- **Intent:** Bound work and resource consumption so one slow tenant, request,
  queue, dependency, or component cannot exhaust the whole system. Propagate
  backpressure rather than hiding overload.
- **Ask:** What limits threads, tasks, memory, queues, connections, file handles,
  retries, fan-out, and concurrency? How are limits partitioned and enforced?
  What is shed, queued, rejected, degraded, or prioritized under overload?
- **Evidence:** resource ownership and limits, queue policy, concurrency budget,
  connection pools, circuit/bulkhead boundaries, admission control, rate limits,
  backpressure propagation, and overload tests.
- **Warning signs and tradeoffs:** unbounded queues/caches/fan-out, retry storms,
  shared pools without fairness, blocking calls on critical executors, and silent
  buffering. Tight limits protect the system but may reject useful work; define
  priority and caller-visible behavior.

### AQ-07 Observability, Diagnosability, And Operability

- **Intent:** Operators and developers can determine current state, request or
  job progress, failures, saturation, and recovery actions without reconstructing
  behavior from ad hoc logs.
- **Ask:** Which signals prove success, failure, latency, load, saturation, and
  invariant violations? Can events be correlated across boundaries? Are state,
  error codes, retries, and administrative actions visible and safe to expose?
- **Evidence:** structured log events, metrics and dimensions, traces or
  correlation identifiers, health/readiness semantics, audit events, dashboards,
  alerts, status APIs, and troubleshooting paths.
- **Warning signs and tradeoffs:** free-form logs only, high-cardinality labels,
  missing correlation, success measured only by absence of errors, health checks
  that ignore dependencies, sensitive telemetry, and alerts with no action.
  Instrumentation volume must respect cost and privacy budgets.

### AQ-08 Quantified Performance And Capacity Budgets

- **Intent:** Express throughput, latency, concurrency, memory, storage,
  bandwidth, queueing, and timeout expectations as measurable targets or bounded
  assumptions tied to a workload and failure behavior.
- **Ask:** What workload shape and scale must the design support? Which resource
  becomes limiting? What are steady-state and burst budgets? How do deadlines
  compose across calls, queues, retries, and fallback?
- **Evidence:** service objectives or explicit targets, workload model,
  capacity calculation, benchmark or profile plan, timeout budget, headroom,
  scaling trigger, and cost assumptions.
- **Warning signs and tradeoffs:** “fast” or “scalable” without numbers,
  independent timeouts exceeding the caller deadline, averages hiding tail
  latency, capacity based on ideal success, and horizontal scaling assumed to
  fix shared bottlenecks. Early designs may use bounded assumptions, but must
  name how they will be validated.

### AQ-09 Compatibility, Migration, And Progressive Evolution

- **Intent:** Permit local replacement and compatible change through explicit
  versioning, rollout, data migration, coexistence, observability, and rollback
  boundaries. Prefer reversible steps when uncertainty is high.
- **Ask:** Which consumers, producers, stored data, and deployed versions must
  coexist? What is the expand/migrate/contract or equivalent sequence? Can the
  change be canaried, paused, rolled back, or completed forward after partial
  rollout?
- **Evidence:** compatibility matrix, version negotiation, feature or routing
  control, migration phases, dual-read/write rationale where unavoidable,
  canary/gray criteria, rollback and roll-forward plan, and cleanup trigger.
- **Warning signs and tradeoffs:** flag-day deployment, irreversible writes
  before validation, indefinite dual paths, compatibility claimed without
  consumer inventory, rollback that cannot read new data, and feature flags with
  no owner or removal condition.

### AQ-10 Security, Privacy, And Trust Boundaries

- **Intent:** Identify identities, trust zones, sensitive data, privileged
  operations, and third-party boundaries; minimize authority and exposure across
  them while preserving auditability and recovery.
- **Ask:** Who authenticates and authorizes each effect? Where is data encrypted,
  redacted, retained, deleted, or exported? How are credentials and keys scoped,
  rotated, and revoked? What happens when a dependency is compromised?
- **Evidence:** trust and data-flow diagram, threat or abuse cases proportionate
  to risk, authorization matrix, secret boundary, retention/deletion rules,
  audit events, and containment/revocation path.
- **Warning signs and tradeoffs:** perimeter-only trust, shared credentials,
  plaintext sensitive data, authorization after side effects, privileged shared
  queues, unbounded retention, and third-party failure treated as trusted input.
  Stronger controls can affect latency and operability; record the chosen guardrail.

### AQ-11 Configuration, Deployment, And Environmental Independence

- **Intent:** Separate policy from mechanism and make environment-dependent
  choices explicit, validated, observable, and safely changeable. The same
  artifact should behave predictably across supported environments.
- **Ask:** Which settings are deployment policy versus invariant behavior? Who
  validates defaults and incompatible combinations? Can configuration changes
  be rolled back, audited, and correlated with behavior? Are startup and runtime
  reconfiguration semantics clear?
- **Evidence:** configuration schema, ownership/default table, validation,
  secret references, deployment topology, startup/readiness order, change audit,
  and rollback procedure.
- **Warning signs and tradeoffs:** environment checks embedded in core logic,
  magic defaults, configuration as an untyped escape hatch, secrets in config,
  runtime changes with no consistency model, and deployment ordering hidden in
  operator knowledge.

## Cross-Principle Interpretation

- **KISS** asks whether concepts, states, and rules are necessary and explicit;
  it does not excuse incomplete failure or security design.
- **YAGNI** rejects unconfirmed extension points and generalized infrastructure;
  it does not reject seams required by a verified boundary or imminent migration.
- **DRY** protects one source of truth for knowledge and invariants; it does not
  require coupling unrelated code that merely looks similar.
- **SOLID** is a diagnostic vocabulary for responsibilities, substitution,
  interfaces, and dependency direction. Do not demand one class per letter or
  count interfaces as quality.
- **Composition over inheritance** is the default for varying behavior, but a
  shallow hierarchy with genuine substitutability may be clearer.
- **Local reasoning** favors explicit inputs, stable contracts, confined state,
  and nearby invariants. It does not prohibit cross-module workflows; it requires
  their coordination contract to be visible.
- **Policy versus mechanism** keeps business choice separate from technical
  execution where they vary independently. Do not add an interface when the
  separation has no consumer or change benefit.
- **Reversibility** deserves more weight as uncertainty and blast radius grow.
  Irreversible decisions require stronger evidence, compatibility analysis, and
  containment than local reversible choices.

## Language And Runtime Mapping

Apply universal semantics through the target language's normal mechanisms:

- In C++, value semantics and stack lifetime are preferred when ownership and
  identity allow them; `std::unique_ptr` expresses exclusive dynamic ownership,
  `std::shared_ptr` is reserved for actual shared lifetime, and RAII binds memory,
  locks, files, and connections to object lifetime.
- In garbage-collected or managed runtimes, memory reclamation does not replace
  ownership, cancellation, structured task lifetime, closing/disposal, context
  managers, or bounded resource use.
- In actor, event, or message-driven systems, explicit message ownership does not
  remove the need for delivery, ordering, idempotency, backpressure, and shutdown
  contracts.
- In functional designs, immutable data and pure functions improve local
  reasoning, but effects, resources, retries, and consistency still require an
  explicit boundary and owner.

Treat these as translations of the baseline, not mandatory technology choices.

## Finding Contract

For every reported principle finding, provide:

1. **Principle and severity.** Name the baseline identifier and why the risk is
   blocking or non-blocking for this target.
2. **Evidence.** Cite the design text, source anchor, repository rule, executed
   evidence, or explicit absence that supports the finding.
3. **Impact.** State the failure, coupling, ambiguity, operational cost, or
   evolution constraint that can result.
4. **Required fix or decision.** Describe the missing contract or smallest
   correction; identify an owner decision when tradeoffs cannot be inferred.
5. **Verification.** Name the artifact evidence, source check, test seam, or
   runtime signal that would close the finding.

Do not report a preference as a defect. When two principles pull in different
directions, describe the tradeoff, evidence, and guardrail instead of declaring
one slogan the winner.
