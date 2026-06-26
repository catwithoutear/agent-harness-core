# Active Change Guard

Warn when multiple or zero active change workspaces make validation output
ambiguous. Resolve one active workspace before surfacing raw validator output.

Git status is not an activation signal. Dirty `.changes/<change>` paths can
suggest candidate workspaces, but the guard must keep the active change
unresolved until cwd, environment/config, or an explicit coordinator decision
selects one.
