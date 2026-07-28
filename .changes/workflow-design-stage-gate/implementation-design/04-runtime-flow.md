---
artifact: implementation-design-detail
status: draft
tags: [design, implementation]
description: "Object lifecycle, normal flow, failure flow, rollback flow, and state transitions."
---
# Runtime Flow

## N/A Usage

If lifecycle, sequence, state, failure, rollback, concurrency, migration, and
idempotency behavior are not material to this change, write `N/A - <reason>`
under the sections below instead of leaving diagrams or tables blank.

## Object Lifecycle

```mermaid
flowchart LR
  O[Observed] --> C{Classify work}
  C -->|Fast| X[Implement and verify]
  C -->|Compact| L[Record small plan or slice]
  L --> R{Risk warrants review?}
  R -->|No| X
  R -->|Yes| LR[Review small plan]
  LR --> X
  C -->|Design| P[Proposal challenged]
  P --> D[Solution design reviewed]
  D --> T{Pack required?}
  T -->|No| S[Task set reviewed]
  T -->|Yes| I[Implementation design reviewed]
  I --> S
  S --> X[Implementation]
```

## Main Sequence

```mermaid
sequenceDiagram
  participant C as Coordinator
  participant R as Reviewer
  C->>C: Classify fast, compact, or design path
  alt fast path
    C->>C: Implement narrow edit and verify
  else compact path
    C->>C: Record plan in plan or task slice
    opt risk warrants review
      C->>R: Review compact plan
      R-->>C: Findings or ready
    end
  else design path
  C->>R: Review solution design
  R-->>C: READY or unresolved findings
  C->>C: Assess implementation-design trigger
  alt pack required
    C->>C: Create and populate pack
    C->>R: Review populated pack
    R-->>C: READY or unresolved findings
  end
  C->>C: Create task slices from accepted upstream work
  C->>R: Review complete task set
  R-->>C: Task-set gate
  end
```

## Failure and Rollback Sequence

```mermaid
sequenceDiagram
  participant C as Coordinator
  participant R as Reviewer
  C->>C: Read current upstream artifact and review
  C->>R: Request semantic review
  alt solution changed or remains unclear
    R-->>C: NOT READY
    C->>C: Return to owning design phase
  else semantics ready
    R-->>C: READY or bounded READY_WITH_NOTES
  end
```

## State Transitions

N/A - these are workflow decisions made during an agent run, not persisted
runtime states. The flow diagrams describe ordering only.

## Traceability

| Flow or state | Requirement / source fact | Source anchor | Verification plan |
|---|---|---|---|
| Solution design precedes trigger | Accepted phase order | `design.md:Paths Through The Workflow` | Skill and command tests. |
| Required pack precedes slicing | Trigger and task rules | `design.md:Implementation-Design Trigger`, `Task-Slicing Gate` | Planner, template, and workflow tests. |
| Reopened upstream stops progress | Review and transition rules | `design.md:Review And Transition Rules` | Skill wording and reviewer scenarios. |
| Lightweight paths remain | Compatibility requirement | `design.md:Fast Path`, `Compact Path` | Explicit fast/compact wording tests. |
| Existing tools remain structural | Current source fact | `research.md:Confirmed Current-State Facts` | Diff review confirms no writer, validator, schema, new command, command route, or capability change; existing workflow/plan command text may change. |
