# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.3.1] - 2026-10-26

### Fixed
- The implement committer no longer writes the `Spec-Phase` line itself. A blank line before the attribution
  trailers turned a hand-written line into body text, which git does not parse as a trailer, so re-entry
  slicing after `/resume` could not see those phases. The committer now writes only the attribution trailers
  and passes `Spec-Phase: <slug> / <title>` to `git commit --trailer` (single-quoted, apostrophes escaped),
  so git merges it into the trailer block.

### Added
- The phase `commit` object carries `trailer`: what `git log -1 --format='%(trailers:key=Spec-Phase,valueonly)'`
  parses back. A committed phase whose trailer does not match halts the loop; the command doc's Step 6.3
  repairs it with `git commit --amend --no-edit --trailer ...` while the commit is still the branch tip.
- Step 3 re-entry slicing also greps the message bodies in `git log --format=%B <base>..HEAD` for
  `Spec-Phase` lines, so phase commits made by 0.3.0 and earlier still count as passed.

### Changed
- Hand commits after a failed phase commit (Step 6.3) use `git commit -F <message file> --trailer` instead of
  writing the trailer into the message.
- Git 2.32 or newer is required (for `git commit --trailer`); previously 2.22.

## [0.3.0] - 2026-10-21

### Added
- Spec phases carry a machine-read `**Design**:` line naming, character for character and `; `-separated,
  the `## Proposed Design` subsections the phase implements (or `None`). The orchestrator reconstructs
  `phases` as `[{ title, agent, design, scope, acceptance }]` and greps each heading before implement; a
  heading that does not resolve stops the phase. A spec without the line (`design: null`) falls back to all
  of `## Proposed Design`.
- Step 4a revision commits: from the spec commit on, every edit to a slug's artifacts (inline refine,
  structural refine, re-sync, rework) is committed on its own as `docs(specs): revise <slug>: <what changed>`,
  never amended.
- An off-list `Selected` form in all three templates
  (`none of the listed options — <the answer as given, or "deferred: <what decides it later>">`). The
  orchestrator records an answer off the list as given and never maps it onto the nearest option.
- Plain-JS `[check]` issues in the spec stage over the lenses' returned indexes: unknown agent names,
  unresolved Design headings, `Depends on` lines that name no earlier phase, more than six acceptance
  criteria, and criterion runs that match a configured suite's whole command. The plan check also rejects a
  backward `Depends on` in the outline before drafting.
- Step 2 finds a slug's artifacts after approval: when none is on disk it queries PRs for every configured
  prefix, then the local and remote branches, and recognizes a ship closed unmerged.
- Contract #26 (the `docs(specs): add` and `docs(specs): revise` commit subjects) in `docs/contracts.md` and
  `scripts/check-contracts.sh`.

### Changed
- The three artifacts are committed when the spec is approved, not at ship. Step 4 is now "approve the spec:
  branch, Final, commit": it creates `<prefix>/<slug>`, marks the spec `Final`, and commits the artifacts as
  `docs(specs): add <slug> pipeline artifacts` before the `implement` call. Every sub-step is idempotent, and
  a failed commit stops the chain. Ship's first step becomes "Leftover commits", and the PR permalink points
  at the pre-removal branch tip (`git rev-parse HEAD`), so it shows the artifacts' final text. Rework after
  ship updates the PR body's permalinks.
- Implement reads are scoped to the phase. The dev agent reads `### Core Principle`, the subsections its
  `**Design**:` line names, and its phase block; the architect reviewer reads the same plus `## Invariance`;
  the committer reads only the phase block.
- The spec critic panel is four lenses with bounded reads: `phases:<partition>` (its phase blocks only;
  owns the phase-block and acceptance-criteria rules; returns an index), `template` (the sections above the
  plan, plus Standards References and Open Questions; returns the design headings), `fidelity:<partition>`
  (its goals, design subsections, and phases; now also owns design-versus-Tasks agreement), and `coherence`
  (a second hop over shared files and cross-cutting decisions; skipped at one partition).
- The spec revise cap is one round; scope and triage keep two. A spec re-check is partitioned by lens and
  keeps each issue's lens prefix (`spec:critic:recheck:<lens>`); what it still flags stops at the gate. A
  revise round never splits, merges, or renumbers a phase; a needed split becomes an open question.
- Acceptance criteria are capped at six per phase and must be behavioural: a named test selection, a stated
  output on a program path, or a benchmark threshold. One command or test selection per bullet. The only
  shape check allowed is an absence grep for an `**IN**` retirement, an `**OUT**` exclusion, a scope non-goal,
  or a steering-file constraint, and the criterion names which.
- The triage template has five sections: `## ORDER` is gone from the artifact (`ORDER.` remains the prompt
  operator). Its non-blocking unfillable form now applies to `## VALIDATE` only.
- The open-question field rules moved from prompt prose into the `open_questions` schema's field
  descriptions.
- A revised spec keeps its status: the reviser leaves `Draft` or `Final` exactly as found.
- Step 1a's decision-recording rules are trimmed to what the templates cannot know (date, label, rationale,
  status); the templates own the entry shapes.

## [0.2.0] - 2026-10-15

### Added
- Scope and spec plan their own composition. A compose round opens with a plan agent that lists the source's
  commitments as anchors and assigns each to one of 1-6 partitions sized to the source (the spec plan also
  fixes the phase outline, core principle, and cross-partition interfaces). One drafter per partition returns
  anchored fragments, one synthesizer writes the artifact, and parallel lens critics audit it: template,
  per-partition fidelity, and tree grounding for scope; template, per-partition narrowest reader,
  per-partition scope fidelity, and cross-partition coherence for spec. Plain-JS coverage checks turn
  unassigned, duplicated, or uncovered anchors and missing or stray phases into known gaps that the
  synthesizer must land and the critics must check.
- Scope and spec returns carry a `composition` object (`mode`, `partitions`, `rationale`,
  `unassigned_anchors`, `uncovered_anchors`, `agents_run`; spec adds `phases_planned`). The orchestrator
  reports it, and the auto-advance gate stops when an anchor was listed as a gap and the final critique is
  not clean.
- Implement commits each phase that passes its criteria check and architect review before the next phase
  starts, with a `Spec-Phase: <slug> / <title>` trailer. Phase results carry a `commit` object; a failed
  commit (for example a pre-commit hook rejection) halts the loop without resending the reviewed phase.
- `models.commit` config key (default `sonnet`) for the per-phase committer.
- Design principle 8 ("Large documents are planned, partitioned, and checked for coverage").
- Contract #25 (the `Spec-Phase` trailer) in `docs/contracts.md` and `scripts/check-contracts.sh`.

### Changed
- `refine()` is split into `refineKit()`, `reviseLoop()`, and `refine()`, so the compose paths reuse the same
  revise and scoped re-check rounds. Triage and every feedback round are unchanged.
- A dead scope or spec plan agent ends the stage with an error and writes nothing.
- Re-entry slicing after `/resume` reads the pass record from `Spec-Phase` trailers in `git log <base>..HEAD`
  instead of re-checking acceptance criteria (still the fallback for branches without trailers).
- Ship's first commit now holds only this slug's three artifacts (`docs(specs): add <slug> pipeline
  artifacts`), after any direct fix committed on its own, so the spec permalink points at a clean commit. The
  PR body lists each phase's commit SHA.
- Dev agents are told not to stage or commit; the workflow commits the phase after it is verified.
- The orchestrator does not shrink or refuse a pipeline call to fit the session's workflow size guideline;
  the script's own caps bound it.

## [0.1.0] - 2026-10-12

### Added
- Initial public release.
- Orchestrator command `/spec-pipeline` and Dynamic Workflow script covering triage, scope, spec, implement, validate, and ship.
- Project configuration via `.claude/spec-pipeline.json` with a JSON Schema.
- Triage, scope, and spec document templates.
- Starter kit: lean architect/developer agents, steering section, path-scoped rule, forbidden-pattern hook skeleton, settings snippet.
- Adoption guide (`ADOPT.md`), `scripts/verify-adoption.sh`, and `scripts/check-contracts.sh`.
