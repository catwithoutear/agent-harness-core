---
name: show-me
description: "Use when helping a user understand the current topic visually via the smallest fitting view: pseudocode, call tree, component tree, file tree, Mermaid, diff, or a focused HTML artifact."
---

# Show Me

Help the user understand the current topic of conversation visually. Skip the
preamble and keep prose brief. Pick the smallest view that makes the key point
clear.

## Choose the view

- Show logic or an algorithm as pseudocode:

```text
on(save)
  if content is unchanged
    return cached result
  write new content
  return fresh result
```

- Show runtime control flow as a call tree:

```text
submitForm
  createSession
    persistPrompt
    launchAgent
  navigateToSession
```

- Show UI structure as a component tree, including state and module boundaries
  that matter:

```tsx
<SessionPage> (apps/example/src/routes/session.tsx)
  useSessionEvents()
  <SessionToolbar>
    <RunSkillButton> (packages/ui)
```

- Show file responsibility or a broad refactor as a shallow file tree:

```text
src/
├── commands/       # parses user actions
├── sessions/       # owns session state
└── transport/      # sends API requests
```

- Show component interaction, control flow, or data flow with Mermaid:

```mermaid
sequenceDiagram
    participant User
    participant UI
    participant Daemon
    User->>UI: choose command
    UI->>Daemon: send expanded prompt
    Daemon-->>UI: stream result
```

- Use `diff` when the point is what changes and the surrounding shape already
  exists. Match the diff shape to the topic.

For a component change:

```diff
 <SessionPage>
   useSessionEvents()
   <SessionToolbar>
 +    <RunSkillButton />
   <SessionTimeline>
 +    <SkillResultCard />
```

For a file-layout change:

```diff
 src/
 ├── commands/
 +│   └── show-me.ts       # expands the slash command
 ├── sessions/
 -└── transport.ts
 +└── transport/
 +    ├── client.ts
 +    └── stream.ts
```

For a call-tree or call-stack change:

```diff
 submitForm
   createSession
     persistPrompt
 +    expandSkillMention
     launchAgent
 -  navigateToSession
 +  navigateToSession
 +    subscribeToEvents
```

For a state or control-flow change:

```diff
 on(save)
 -  write content
 +  if content is unchanged
 +    return cached result
 +  write new content
 +  invalidate cache
```

- Show the whole block when most of it is new, when omitted context would hide
  ownership or order, or when the user needs a copyable target shape:

```ts
function expandSkill(command: string): string {
  const skillName = command.slice(1)
  return `use the ${skillName} skill`
}
```

## Focused HTML artifact

For a visual UI, layout, state comparison, or concept too dense for Mermaid,
prefer one focused HTML artifact.

- If the `archify` skill is available in this session and the artifact should
  be polished, validated, interactive, or exportable, use `archify` and follow
  its SKILL.md authoring contract exactly. It covers architecture, workflow,
  sequence, data-flow, and lifecycle diagrams from typed JSON IR, with schema
  validation, delivery checks, and visual review. Do not re-state or approximate
  Archify's JSON IR, schema, or validation rules here.
- If `archify` is not available, write one self-contained HTML file — a
  diagram, an infographic, or a short slide deck, whichever fits the point.
  Match the product's colors, type, spacing, and components; use real labels
  and data; support desktop and mobile.
- Either way, open the artifact for the user:

```
Bash(open path/to/show-me-{description}.html)
```

Do not claim Archify validation, exports, or viewer features unless `archify`
was actually used.

## Route to specialized skills

| Situation | Use |
|---|---|
| Quick in-chat understanding of a small concept | the inline forms above |
| Dense or polished interactive HTML diagram; validated diagram; exports | `archify` (opt-in third-party) — follow its contract |
| Raw Mermaid source, theme, or batch rendering | `mermaid-diagrams` (opt-in third-party) |
| Source-grounded design/code handoff report | `design-code-explainer` (core) |

## Guidance

Place each visual next to the short text it supports. Keep only the calls,
files, props, states, and boundaries needed to answer the user's current
question or the options to resolve the current discussion point.

You may use one of these forms, you may use several, it is unlikely you will
use all of them. Use your judgement and don't overwhelm the user.
