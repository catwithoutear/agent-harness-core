export const STATUSES = new Set(["draft", "reviewed", "frozen", "superseded", "verified"]);

export const GLOBAL_TAGS = new Set([
  "workflow",
  "requirements",
  "research",
  "proposal",
  "design",
  "implementation",
  "review",
  "validation",
  "execution-map",
  "compatibility",
  "migration",
  "rollback",
  "decision",
  "terminology",
  "memory",
  "codex",
  "hooks",
  "plugin"
]);

export const ARTIFACTS = {
  "change-index": artifact("README.md"),
  requirements: artifact("requirements.md"),
  proposal: artifact("proposal.md"),
  research: artifact("research.md"),
  terminology: artifact("terminology.md"),
  design: artifact("design.md"),
  plan: artifact("plan.md"),
  tasks: artifact("tasks.md"),
  "execution-map": artifact("execution-map.md"),
  "specs-index": artifact("specs/README.md"),
  "decision-record": artifact("decisions/DR-<nnn>-<kebab-slug>.md", {
    template: "templates/changes/decisions/decision-record.md"
  }),
  "timeline-event": artifact("timeline/<yyyy-mm-dd>-<nnn>-<kebab-slug>.md", {
    template: "templates/changes/timeline/timeline-event.md"
  }),
  "review-round": artifact("reviews/<target>-r<nn>.md", {
    template: "templates/changes/reviews/review-round.md"
  }),
  "task-slice": artifact("tasks/slice-<nnn>-<kebab-slug>.md", {
    template: "templates/changes/tasks/task-slice.md"
  }),
  "decision-index": artifact("decisions/README.md"),
  "timeline-index": artifact("timeline/README.md"),
  "reviews-index": artifact("reviews/README.md"),
  "tasks-index": artifact("tasks/README.md"),
  "implementation-design-index": artifact("implementation-design/README.md"),
  "implementation-design-detail": artifact("implementation-design/<area>.md"),
  "delta-spec": artifact("specs/<capability>.md"),
  "memory-index": artifact(".memory/INDEX.md", {
    allowedStatuses: ["verified", "superseded"]
  }),
  "memory-language": artifact(".memory/language.md", {
    requiredFields: ["artifact", "status", "tags", "last_verified", "source_revision"],
    allowedStatuses: ["verified", "superseded"]
  }),
  "memory-subsystem": artifact(".memory/subsystems/<slug>.md", {
    requiredFields: ["artifact", "status", "tags", "last_verified", "source_revision"],
    allowedStatuses: ["verified", "superseded"]
  }),
  "memory-map": artifact(".memory/maps/<slug>.md", {
    requiredFields: ["artifact", "status", "tags", "last_verified", "source_revision"],
    allowedStatuses: ["verified", "superseded"]
  }),
  "memory-pattern": artifact(".memory/patterns/<slug>.md", {
    requiredFields: ["artifact", "status", "tags", "last_verified", "source_revision"],
    allowedStatuses: ["verified", "superseded"]
  }),
  "memory-decision": artifact(".memory/decisions/<slug>.md", {
    requiredFields: ["artifact", "status", "tags", "last_verified", "source_revision"],
    allowedStatuses: ["verified", "superseded"]
  })
};

export const CHANGE_CHILD_DIRECTORIES = {
  decisions: {
    indexArtifact: "decision-index",
    childArtifact: "decision-record",
    columns: ["path", "artifact", "status", "order", "description"],
    pattern: "DR-<nnn>-<kebab-slug>.md",
    filenameRegex: /^DR-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
  },
  timeline: {
    indexArtifact: "timeline-index",
    childArtifact: "timeline-event",
    columns: ["path", "artifact", "status", "date_key", "description"],
    pattern: "<yyyy-mm-dd>-<nnn>-<kebab-slug>.md",
    filenameRegex: /^\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
  },
  reviews: {
    indexArtifact: "reviews-index",
    childArtifact: "review-round",
    columns: ["path", "artifact", "status", "order", "description"],
    pattern: "<target>-r<nn>.md",
    filenameRegex: /^[a-z0-9]+(?:-[a-z0-9]+)*-r\d{2}\.md$/
  },
  tasks: {
    indexArtifact: "tasks-index",
    childArtifact: "task-slice",
    columns: ["path", "artifact", "status", "order", "description"],
    pattern: "slice-<nnn>-<kebab-slug>.md",
    filenameRegex: /^slice-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
  }
};

export const COMMANDS = {
  policy: "harness-change-doc policy --json",
  resolve: "harness-change-doc resolve --json",
  execution_map: "harness-change-doc execution-map <change> --json",
  assign_slice: "harness-change-doc assign-slice <change> --slice <slice>",
  index: "harness-change-doc index",
  memory_index: "harness-change-doc memory-index --json",
  add_implementation_design: "harness-change-doc add-implementation-design",
  add_review: "harness-change-doc add-review",
  migrate: "harness-change-doc migrate <change> --dry-run | --apply --expected-plan-sha256 <sha256>",
  memory_retrofit: "harness-change-doc memory-retrofit --dry-run"
};

export function projectionPolicy() {
  return {
    version: 1,
    artifacts: Object.fromEntries(
      Object.entries(ARTIFACTS)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, policy]) => [
          name,
          {
            required_fields: policy.requiredFields,
            optional_fields: policy.optionalFields,
            allowed_statuses: policy.allowedStatuses,
            naming: policy.naming,
            template: policy.template
          }
        ])
    ),
    statuses: [...STATUSES].sort(),
    global_tags: [...GLOBAL_TAGS].sort(),
    tag_registries: {
      task: {
        file: "README.md",
        heading: "Task Tag Registry",
        columns: ["tag", "description"]
      },
      memory: {
        file: ".memory/INDEX.md",
        heading: "Memory Tag Registry",
        columns: ["tag", "description"]
      }
    },
    child_directories: Object.fromEntries(
      Object.entries(CHANGE_CHILD_DIRECTORIES).map(([name, value]) => [
        name,
        {
          index_artifact: value.indexArtifact,
          child_artifact: value.childArtifact,
          columns: value.columns,
          pattern: value.pattern,
          filename_regex: value.filenameRegex.source
        }
      ])
    ),
    commands: COMMANDS
  };
}

export function statusAllowed(artifactName, status) {
  return Boolean(ARTIFACTS[artifactName]?.allowedStatuses.includes(status));
}

export function globalTagAllowed(tag) {
  return GLOBAL_TAGS.has(tag);
}

export function requiredFields(artifactName) {
  return ARTIFACTS[artifactName]?.requiredFields ?? [];
}

export function managedChangeDirectories() {
  return new Set(Object.keys(CHANGE_CHILD_DIRECTORIES));
}

export function directoryIndexFields(directory) {
  return CHANGE_CHILD_DIRECTORIES[directory]?.columns ?? [];
}

function artifact(naming, options = {}) {
  return {
    naming,
    requiredFields: options.requiredFields ?? ["artifact", "status", "tags"],
    optionalFields: options.optionalFields ?? ["description"],
    allowedStatuses: options.allowedStatuses ?? ["draft", "reviewed", "frozen", "superseded"],
    template: options.template ?? null
  };
}
