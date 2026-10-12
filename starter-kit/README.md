# Starter kit

The payload (`payload/`) is copied into an adopting repository as is. The starter kit is different: every
piece here is **merged into or adapted for** the adopting repository, never copied blindly. Each file is
filled in for the example project **Orderly** so you can see what "done" looks like, and carries
`<!-- ADOPT: -->` markers where your project's facts go.

[`ADOPT.md`](../ADOPT.md) Steps 5, 6, and 8 say exactly when and how each piece is used.

| Piece | What it is | Merge or copy |
|---|---|---|
| [`agents/api-architect.md`](agents/api-architect.md), [`agents/api-dev.md`](agents/api-dev.md) | Lean (~60-line) architect and dev definitions for one lane | **Copy per lane, then adapt**: rename to `<lane>-architect.md` / `<lane>-dev.md`, set `name:` to the file name, rewrite the stack sentences, reading list, classification, test mapping, and the sibling-agent names (drop `docs-writer` lines if you have no docs agent). Skip a lane that already has suitable agents. |
| [`agents/web-architect.md`](agents/web-architect.md), [`agents/web-dev.md`](agents/web-dev.md) | The same shape for a second, different stack | Reference for a second lane |
| [`agents/docs-writer.md`](agents/docs-writer.md) | An unlaned docs agent (listed in `unlaned_agents`) | Optional |
| [`steering/CLAUDE.section.md`](steering/CLAUDE.section.md) | The steering-file sections the pipeline cites: rule-loading caveat, constraints with one heading per invariant, testing, anti-patterns (including the two the review cites by name), routing table, prompt structure, exceptions, reference, environment, critical recall | **Merge** into `CLAUDE.md` (or `AGENTS.md`); extend existing sections instead of duplicating them |
| [`rules/example-rule.md`](rules/example-rule.md) | A path-scoped rule shim with `paths:`, core rules, contract tests, key files, anti-patterns, and absence statements | **Adapt**, one per invariant with a path footprint |
| [`hooks/check-forbidden-pattern.sh`](hooks/check-forbidden-pattern.sh), [`hooks/README.md`](hooks/README.md) | A `PostToolUse` exit-2 hook skeleton and how to register and mirror it | **Adapt**, only for a low-false-positive mechanizable invariant |
| [`patterns/README.md`](patterns/README.md) | A pattern-doc index skeleton with the placement test and ground-truth anchor cadence | **Adapt**, one per lane that has pattern docs |
| [`settings.snippet.json`](settings.snippet.json) | `permissions.deny` for `git stash` | **Merge** into `.claude/settings.json`; never overwrite it |

## Notes on the agents

- The file name is the routing token. The spec's `**Agent routing**:` lines, the triage enums, and
  `.claude/spec-pipeline.json` all use it, so `name:` must equal the file name.
- Frontmatter `model: opus` is only a default for interactive use. The pipeline sets a model on every agent
  call from `models.*` in the config, so it never reads this field.
- Keep the "On scope discovery: report, don't absorb" boundary and the "don't block; state assumptions"
  clarification pattern. Workflow subagents cannot ask a human anything mid-run; real decisions travel through
  each stage's open questions instead.
- Resist making them long. A 60-line agent that points at the steering file and the pattern index beats a
  600-line agent that duplicates them and drifts.

## Deliberately not shipped

No domain invariants, no stack-specific pattern docs, no domain hooks, no tech-stack content beyond the
Orderly placeholders, and no local settings. Only the shapes generalize; the content is yours to write.
