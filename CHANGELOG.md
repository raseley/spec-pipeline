# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
