# agent-teams-profiles

Generate [dsh-agent-teams](https://github.com/NanmiCoder/dsh-agent-teams) named
profiles (squad rosters) from this repo's canonical role definitions in
`agents/roles/*.md`.

- **Source of truth:** the role markdown bodies — emitted verbatim as
  `members[].role` persona text. The same text the local `liangshen-roles` dsh
  preset embeds for tool-style subagent dispatch, so both surfaces stay in sync
  from one upstream.
- **Squads and model routing:** declared in `teams.routing.json`
  (`liangshen-delivery`, `liangshen-research`; `harness-orchestrator` is never
  rostered — the AgentTeams captain fills that role).
- **Preamble:** the only synthesized text. It reframes the tool-dispatch
  "Input Packet" convention for persistent members: the task assignment message
  plus the task contract (objective / acceptance / inScope / verify) is the
  Input Packet; the Output Packet is delivered as the `agent_teams_update_task`
  output.

## Usage

```sh
node scripts/agent-teams-profiles/gen.mjs                 # fragment to stdout
node scripts/agent-teams-profiles/gen.mjs --out /tmp/fragment.yml
```

Splice the fragment into the target dsh profile's `cordis.patch.yml` (it is an
id-targeted config override on the `agent-teams` plugin row, wrapped in
BEGIN/END markers for idempotent regeneration). Requires the plugin to be
installed first:

```sh
dsh plugin --profile web add --save-exact @nanmicoder/dsh-agent-teams@0.1.16-rc.1
```

The generator validates squad size against `maxMembers`, `protocol` length
against the plugin's 400-char persona truncation limit, and provider/model
pairing, and fails loudly instead of emitting a broken profile.

## Current drift note (2026-09-07)

Whitespace-normalized comparison of `agents/roles/*.md` against the personas
embedded in `liangshen-roles/agent.cordis.yml`: 6 roles identical, 5 roles
(code-simplifier, harness-orchestrator, planning-reviewer, review-verifier,
reviewer) have **newer content upstream** — the preset embeddings are stale.
Generating from `agents/roles/*.md` therefore picks up the maintained text.
Consider refreshing the preset embeddings from upstream separately.
