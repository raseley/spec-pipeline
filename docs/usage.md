# Using the pipeline day to day

You steer `/spec-pipeline` in plain English. You never type JSON, never pick a stage name the files can
determine, and never confirm a slug.

## Cheat sheet

| You say | What happens |
|---|---|
| `/spec-pipeline <idea>` | A slug is chosen and announced ("Using slug `partial-refunds`."), triage runs, and the chain auto-advances while the gate is clear. |
| `/spec-pipeline advance` (or "next", "go on", "proceed") | Runs the stage the files on disk say is next. After a green validate, that is ship. |
| `/spec-pipeline refine: <notes>` | Inline edit when the notes are local; a structural re-run of the same stage when they cascade. |
| `/spec-pipeline rewind to <stage>` | Re-runs an earlier stage with your correction; later stages re-run after it. |
| "retry that phase on fable" | Re-sends the unpassed phases with `implModel` = `models.escalation`, for this run only. |
| "run this stage on opus" | Sets `model` for one call: drafters, revisers, dev agents, and reviews run on it. Critics, the checker, and validate keep their tiers. |
| `/spec-pipeline <idea>` for a slug that already has artifacts | Reports where it stands and treats the request as advance or refine; triage is never overwritten. |
| after `/resume`, or in a new session | Just say `advance`. |

Only one stage runs at a time. If a stage is running, wait for it.

## What stops the chain, and what to do

| Stop | What you see | Your move |
|---|---|---|
| **Open questions** | Each question with a plain-language lead paragraph and 2-4 options, the recommended one first | Answer. Answers are recorded verbatim in the artifact and the chain resumes if nothing else needs you. |
| **Blocked triage** | The section it blocked on, the reason, and its `B` questions marked "Blocking - triage cannot route until this is decided." | Answer the `B` questions. Your answer re-runs triage; `advance` is refused until then. |
| **Malformed triage** | An error naming the missing routing fields | Nothing to answer. If the artifact is fine, `advance` (routing is recovered from it); otherwise re-run triage. |
| **Divergent return** | The return and the artifact's status disagree | The file wins. Inspect it, fix it or re-run the stage. |
| **Unclean critique** | "written but still flagged" plus the residual issues | Judge them: `advance` if they don't matter, `refine:` if they do. |
| **Critique unavailable** | "verdict unavailable" | The critic died. Re-run or review the artifact yourself. |
| **Possibly dropped commitment** (scope, spec) | Anchors listed as unassigned or uncovered (a source section or decision, a scope goal `G<n>`, or `phase: <title>`) and a final critique that is not clean | Check that each named anchor landed in the artifact. `advance` if it did, `refine:` if it did not. |
| **Plan agent died** (scope, spec) | "plan agent returned no result; nothing written" | Re-run the stage. |
| **Halted phase** | The phase, its unmet criteria and blocking concerns, the phases not yet run | Fix directly, `refine:` the spec, `rewind`, or escalate. Then `advance` re-sends from the halted phase. |
| **Phase commit failed** | A passed, sound phase with a commit `error`, usually a pre-commit hook's output | Fix what the hook flagged. The orchestrator then commits the phase by hand with its `Spec-Phase` trailer, and `advance` continues from the next phase. |
| **Validate failed** | Per-suite counts and failing test ids | Fix, then `advance` (validate runs again). Never ship on red. |

When reading implement results:

- **"review not run"** (`sound: null`) means the criteria check failed first. The architect found nothing;
  it never looked.
- **Deferred criteria** ("3 criteria met, 1 deferred to validate") named a whole-suite run; a narrow run
  substituted, and validate settles the global claim. Not failures.
- **Observations** are true but non-blocking (adjacent defects, follow-ups, wording drift). They go into the
  PR body at ship.
- **Each passed phase is a commit** on the branch, reported with its short SHA and subject. "Nothing to
  commit" is not a failure. **Unexpected paths** are staged files the phase scope does not name; they are
  already in the commit, so decide whether they belong.

When reading scope and spec results, the **composition** line says how many partitions the plan chose and
why, how many agents ran, and which anchors (if any) were unassigned or uncovered before the synthesizer
landed them. A small change gets one partition; a large source gets up to six parallel drafters. Spec results
also name the lenses that ran and whether the `coherence` lens was skipped (it is, at one partition). Every
critique issue carries the lens that raised it (`[phases:<partition>]`, `[template]`, `[fidelity:<partition>]`,
`[coherence]`, or `[check]` for a plain-JS check), so you can see which reading flagged it. The spec gets one
revise round; whatever is still flagged after it stops at the gate for you to judge.

## Refining: inline vs structural

**Inline** (the default): selecting an option, fixing wording or terminology, a small factual correction,
adding or dropping a detail that does not cascade. The orchestrator edits the artifact directly and makes
**no workflow call**: a two-line decision is a 30-second edit, not an agent fan-out. Once the spec is
approved and the artifacts are committed, each such edit is also one `docs(specs): revise <slug>: ...`
commit.

You can answer an open question **off the list**. The orchestrator records your answer as given, in the
template's off-list form (`Selected: none of the listed options — <your answer>`, or `deferred: <what decides
it later>`), and never maps it onto the nearest option. An off-list answer that introduces a mechanism the
artifact does not describe is structural.

**Structural** (a workflow round): your note changes the lane or change type; adds or removes goals or
non-goals; alters the design, the Invariance section, or the phase decomposition; answers an entry raised
by an unfillable `## VALIDATE`; or answers a blocking `B` entry. The same stage re-runs with
your notes as `feedback`. One reviser applies them in place and one critic checks only your points. Spec
revisions re-read the scope first, because the scope binds the spec's Goals and Non-Goals. A revise round
never splits, merges, or renumbers a phase; a phase that needs a split comes back to you as an open question.

When unsure, the orchestrator chooses inline. An inline refine you initiate does not resume the chain; say
`advance` when ready.

Send only this round's notes. Earlier rounds are already in the artifact.

## Escalation and tiers

Dev agents run on `models.impl` (`opus` by default). The top tier is held for the spec. To escalate a
halted phase, ask for it explicitly ("retry that phase on fable"). The orchestrator sets `implModel` for that
one run and does not carry it forward. It never escalates on its own initiative.

If the top tier is unavailable to you, set `models.spec` and `models.escalation` to `opus` in the config.

## The artifacts

| File | Stage | Contents |
|---|---|---|
| `<specs_dir>/<slug>-triage.md` | triage | verified claims, lane, change type, target region, exclusions, decisions |
| `<specs_dir>/<slug>-scope.md` | scope | executive summary, goals, non-goals, files affected, dependencies, open questions |
| `<specs_dir>/<slug>.md` | spec | design, invariance, phased plan with routing, scope, tests, and acceptance criteria |

- They are **untracked** through triage, scope, and spec. Read them and edit them freely; the next stage
  reads whatever is on disk.
- **Approval commits them.** When the spec is approved (the gate clears on it, or you say `advance`), the
  orchestrator creates the `<prefix>/<slug>` branch, flips the spec to `**Status**: Final`, and commits only
  this slug's three files as `docs(specs): add <slug> pipeline artifacts`, before implement starts. From then
  on they live on that branch, and every later edit gets its own `docs(specs): revise <slug>: ...` commit,
  never an amend. A revised spec stays `Final`.
- **Ship** commits any leftovers, links the spec at the pre-removal branch tip's SHA, then removes the
  artifacts from the branch tip with `chore(specs): remove <slug> pipeline artifacts`. With
  `remove_artifacts_after_pr: false` they stay and merge with the PR.
- **The implement agents read a bounded slice of the spec.** Each phase's `**Design**:` line names the
  `## Proposed Design` subsections it implements (or `None`). The dev agent and the architect reviewer read
  only the Core Principle, those subsections, and the phase block (the reviewer also `## Invariance`). If you
  hand-edit a subsection heading, update every `**Design**:` line that names it; the orchestrator checks each
  heading before implement and stops on one that does not resolve.
- Never `git add -A` over the specs directory and never glob-delete in it: it holds the templates and other
  workstreams' drafts.

## Several workstreams at once

Each slug has its own artifacts, so you can triage, scope, and spec several workstreams in the same
checkout. Implement is different: it needs the slug's branch checked out, and there is one working tree. Run
one workstream through implement, validate, and ship at a time. Untracked drafts of other slugs ride along
harmlessly across checkouts and are excluded from every commit. A slug whose spec is already approved has
its artifacts only on its own branch: switch to it (or just say `advance`; the orchestrator finds the branch
or the PR from the slug) to see them.

## Rework after ship

1. Find `<spec-sha>`: the permalink in the PR body, or the parent of the removal commit.
2. Restore the artifacts:
   `git restore --source=<spec-sha> -- <specs_dir>/<slug>-triage.md <specs_dir>/<slug>-scope.md <specs_dir>/<slug>.md`
3. `rewind` or `refine` as usual; then validate.
4. A re-run of implement commits its phases itself. The orchestrator commits any direct fix without the
   artifacts and pushes to the existing PR, then deletes the restored files. If the rework changed an
   artifact, it is committed on its own and then removed again, so the revision is in history.

## Good ideas to feed it

The idea is prose, but the better it names surfaces, the less triage has to discover:

> Partial refunds: let a support agent refund part of an order; the refunded total may never exceed the
> captured amount; show the refunded-so-far figure in the order table.

Triage treats every claim in your idea as something to verify. If you say "the endpoint already exists",
it checks. A falsified premise is a result, and may block triage until you decide what you actually want.
