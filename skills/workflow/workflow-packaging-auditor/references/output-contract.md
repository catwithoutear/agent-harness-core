# Output Contract

The final response must contain exactly these sections in this order:

```markdown
## Review Window

- Coverage:
- Sources used:
- Sources unavailable:
- Assumptions:

## Shortlist

| Repeated workflow | Evidence & dates | Confidence | Recommended form | Worth creating? |
|---|---|---|---|---|

## Created or Extended

### <Asset name>

- Type:
- Action:
- Location:
- Why:

<Include the full created or modified asset content, or a precise patch if editing an existing asset.>

## Deliberately Skipped

| Workflow | Reason |
|---|---|

## Needs More Evidence

| Workflow | Missing evidence needed |
|---|---|
```

## Rules

If no asset is created, `Created or Extended` must say:

```markdown
No new assets created. The available evidence did not meet the creation threshold.
```

If only existing assets were extended, state which asset was modified, what was changed, and why extension was preferred over new creation.

## Confidence Labels

Use exactly these labels in the Shortlist:
- **High** — confirmed recurrence, strong evidence, clear value
- **Medium** — likely recurring, adequate evidence, plausible value
- **Low** — possible pattern, weak evidence, uncertain value

Do not invent custom labels. If uncertain, use Low.
