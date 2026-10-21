# Mechanics

How a workstream moves through the pipeline, stage by stage. This describes the behaviour of
`.claude/commands/spec-pipeline.md` (the **command**, the orchestrator running in your main session) and
`.claude/workflows/spec-pipeline.js` (the **script**, the Dynamic Workflow). For the reasons behind each
mechanism see [`design.md`](design.md); for exact strings see [`contracts.md`](contracts.md).

`<specs_dir>` is `specs_dir` from `.claude/spec-pipeline.json` (`docs/specs` by default). `<base>`,
`<remote>`, and `<prefix>` come from `git.base_branch`, `git.remote`, and the prefix triage chose.

## The two halves

| | Command (orchestrator) | Script (workflow) |
|---|---|---|
| Runs in | your main Claude Code session | a Dynamic Workflow run, one per call |
| Can | read and edit files, run git and `gh`, ask you questions, call `Workflow` | spawn subagents (`agent()`), log, return a value |
| Cannot | (it is the only place a human steers) | read files, read a clock, use randomness, ask you anything |
| Owns | intent classification, stage derivation, `args` assembly, return review, the gate, inline edits, spec approval (branch, Final, artifact commit), revision commits, ship | one stage's drafting, critiquing, implementing, checking, reviewing, or validating |

Because the script has no filesystem, **all project configuration reaches it through `args.config`**: the
command reads `.claude/spec-pipeline.json` at Step 0 and passes the parsed object verbatim on every call.
The script applies defaults, validates the config (returning `{stage, error: "invalid config: ..."}` on a
problem), and builds its enums and prompt fragments from it.

## Command flow

1. **Step 0, load configuration.** Read and parse `.claude/spec-pipeline.json`. Missing or invalid: stop
   and point at `ADOPT.md`. Never guess a configuration.
2. **Step 1, classify the intent.** Free-form prose = **start**; `advance`/"next"/"go on" = **advance**;
   `refine: <notes>` = **refine**; `rewind to <stage>` = **rewind**.
3. **Step 1a, inline vs structural.** A refine is inline (a direct edit, no workflow call) unless it
   cascades. See [usage](usage.md#refining-inline-vs-structural).
4. **Step 2, derive the next stage** from disk (table below).
5. **Step 3, fill the fields** the developer never supplies: `date`, `architect`, `phases`, `implModel`,
   `model`, `config`.
6. **Step 4, approve the spec** when entering implement: branch, `Final`, artifact commit. **Step 4a**
   commits every later artifact edit on its own.
7. **Step 5, invoke once** and wait.
8. **Step 6, review the return**: report, check the artifact against the return, surface open questions,
   run the gate.
9. **Step 7, ship** after a green validate.

## Stage derivation (Step 2)

The stage is never stored. The first matching rule wins.

**Where the artifacts live.** Until Step 4 commits them, a slug's artifacts are untracked and visible from any
branch; from the spec commit on they live on `<prefix>/<slug>`. So when no `<specs_dir>/<slug>-*.md` is on
disk, the command first queries PRs for every configured prefix (rules 1 and 2 answer from the query, with no
checkout), then looks for the branch locally and on `<remote>` and checks it out. A branch with no PR and no
artifacts on its tip is a ship closed unmerged: it reports that and points at the rework restore. Rule 9
applies only when no files, PR, or branch exist.

**Precondition, before rule 1:** if `<specs_dir>/<slug>-triage.md` reads exactly `**Status**: Blocked`, the
slug is at a blocked triage regardless of anything else. Report its `B` entries and stop. `advance` is an
error; the only legal move is a structural refine re-running triage with your answers.

| # | Condition | Position | `advance` runs |
|---|---|---|---|
| 1 | a merged PR for `<prefix>/<slug>` | done | nothing |
| 2 | an open PR for `<prefix>/<slug>` | shipped | nothing (reports the URL) |
| 3 | spec `Final`, branch carries implementation commits (anything on `<base>..<prefix>/<slug>` but the `docs(specs):` artifact commits and the `chore(specs):` removal commit) or working-tree changes, no PR, and validate passed this session since the last code change | ship | ship (Step 7) |
| 4 | spec `Final`, branch carries implementation commits or changes as in rule 3, no PR (validate not passed, stale, or unknown) | validate | `validate` (idempotent; when in doubt, validate again) |
| 5 | spec `Final` (approved and committed, no implementation commit yet) | implement | `implement`; a refine here edits the tracked spec and is committed per Step 4a, and the spec stays `Final` |
| 6 | spec `Draft` | spec drafted | Step 4's approval, then `implement` (refine re-runs `spec`) |
| 7 | scope exists, no spec | scoped | `spec` (refine re-runs `scope`) |
| 8 | only triage exists | triaged | `scope`, but only when triage reads `Decided`; a `Draft` triage has open entries that must be closed first |
| 9 | nothing exists | | error: ask for an idea |

For a **start**, the command kebab-cases a slug, announces it, and proceeds. If artifacts for that slug
already exist, it reports the position and treats the request as advance or refine.

## Fields (Step 3)

| Field | Source |
|---|---|
| `config` | the parsed `.claude/spec-pipeline.json`, every call |
| `stage` | Step 2 |
| `slug` | chosen at start; then the artifact names |
| `date` | today from session context (the script has no clock) |
| `idea` | your prose, triage only |
| `feedback` | this round's notes only, structural refine only, and only when the artifact exists |
| `architect` | carried forward from the triage return; after `/resume`, the lane in `**Lane**:` mapped to that lane's `architect` in the config. `unresolved` = blocked |
| `phases` | **always** rebuilt from `<specs_dir>/<slug>.md` as `[{title, agent, design, scope, acceptance}]`; on re-entry, the unpassed suffix |
| `model` | only when you ask ("run this stage on opus") |
| `implModel` | `models.escalation`, only when you ask to escalate, for that run only |

`branch_prefix` is command-only: the segment before `/` on the triage `**Branch**:` line.

`design` is the phase's `**Design**:` line split on `; `: `[]` for `None`, `null` for a spec written before the
line existed (the dev agent and reviewer then read all of `## Proposed Design`). Before sending a phase the
command greps each heading (`grep -nF '### <heading>'`) and confirms the hit sits under `## Proposed Design`;
a miss is a spec defect, reported, and the phase is not sent.

**Re-entry slicing.** The script runs whatever `phases` array it receives. After a halt, the command resends
the suffix starting at the halted phase, using the previous return's `passed: true` **and** `sound: true` as
the pass record. A passed phase whose title, routing, Design, Scope, or Acceptance Criteria changed since is
sent again; with the artifacts tracked, `git diff <phase-sha> -- <specs_dir>/<slug>.md` shows what changed. With no return in memory (after `/resume`), it reads the pass record from git: every passed phase was
committed with a `Spec-Phase: <slug> / <title>` trailer, so
`git log --format='%(trailers:key=Spec-Phase,valueonly)' <base>..HEAD` lists them, and it slices at the first
phase in spec order with no trailer. The `docs(specs):` and `chore(specs):` commits carry no trailer and are
not implementation commits. Only for a branch whose implementation commits carry no trailers does it fall back to checking each phase's criteria itself until the first unmet one.

## Spec approval (Step 4) and revision commits (Step 4a)

Run before every `implement` call. Approval is a clear gate on a `spec` return, or your **advance** on a spec
the gate stopped on. Every sub-step is idempotent, so a re-entry after a halt or `/resume` changes nothing.

1. **Branch.** Unless `<prefix>/<slug>` is current: `git checkout <base> && git pull <remote> <base> &&
   git fetch --prune <remote>`, then `git checkout -b <prefix>/<slug>`, falling back to
   `git checkout <prefix>/<slug>`. The untracked artifacts come along.
2. **Final.** A `Draft` spec is set to `**Status**: Final`.
3. **Commit.** `git add --` the three artifacts; if anything is staged, commit it, the first time as
   `docs(specs): add <slug> pipeline artifacts`, later in the revision form.
4. Confirm the spec is present and reads `Final`.

Guards: a dirty tree that blocks checkout stops the run (never `git stash`); a checkout refused because
untracked artifacts would be overwritten means the branch already holds committed artifacts, so it stops and
you choose; a failed commit (a hook, say) stops the run before implement, and the next advance retries it.

From the spec commit on, every edit to any of the three artifacts (an inline refine, a structural refine's
return, a re-sync during implement, a rework after ship) gets its own follow-up commit,
`docs(specs): revise <slug>: <what changed>`, never an amend. Revision commits carry no `Spec-Phase` trailer.
A revised spec stays `Final`.

## The document stages: triage, scope, spec

Triage runs through `refine()`, and so do scope and spec on a feedback round:

```
compose (no feedback):   draft ──► critic (full audit) ──► [revise ──► critic (raised issues only)] × ≤2
feedback (structural):   revise (address every point) ──► critic (feedback points only)
```

The revise cap is per stage: two rounds for triage and scope, **one** for spec, whose reviser rewrites the
largest artifact on the top tier; what that round leaves stops at the gate.

A scope or spec compose round plans its own composition first, then joins the same revise loop
(`reviseLoop()`):

```
plan ──► drafter per partition (parallel, 1..6) ──► plain-JS coverage check ──► synthesizer (writes the file)
     ──► lens critics (parallel) ──► merged critique ──► [revise ──► critic (raised issues only)] × ≤2
```

Spec inserts plain-JS checks and a second-hop lens before the merge, and re-checks per lens:

```
... ──► phases + template + fidelity lenses (parallel, each returning an index)
    ──► plain-JS [check] issues over the indexes ──► coherence lens (skipped at one partition)
    ──► merged critique ──► [revise ──► one re-check per lens group, within that lens's read] × 1
```

- **Plan.** Lists the source's enumerable commitments as **anchors** and assigns each to exactly one
  partition (at most `MAX_SCOPE_PARTITIONS` / `MAX_SPEC_PARTITIONS`, both 6). A small source gets one
  partition, so one drafter. Decisions that bind several partitions go into `cross_cutting`. A dead plan
  agent ends the stage with `{stage, error, composition}` and nothing written.
- **Drafters** return fragments, never the file, and every fragment item lists the anchors it serves. An
  anchor a partition cannot land goes in `no_scope_consequence` / `no_spec_consequence` with a reason.
- **Coverage check** (plain JavaScript, no agent): unassigned, duplicated, and foreign anchors from the plan;
  anchors no owning fragment covers; for spec, misnumbered, unowned, missing, and stray phases. Each becomes a
  **known gap** line that the synthesizer must land and the critics must check. None is dropped silently.
- **Synthesizer** writes the artifact from the fragments, splicing spec phase blocks verbatim, and lands every
  known gap. The artifact carries no anchor ids, partition names, or trace section.
- **Lens critics** run in parallel on `models.critic`. Their verdicts merge into one critique, each issue
  prefixed with its lens (`[<lens>] `); a dead lens becomes an issue restating what it would have checked,
  never clean. Scope's re-check is one critic over the whole artifact. Spec's re-check is partitioned: issues
  are grouped by prefix and each group is re-checked (`spec:critic:recheck:<lens>`) within the read its lens
  had, and the surviving issues are re-prefixed, so the lens names survive the round.
- The return adds `composition`: `{mode, partitions, rationale, unassigned_anchors, uncovered_anchors,
  agents_run}` (spec adds `phases_planned`). The gate stops when either anchor list is non-empty and the final
  critique is not clean.

- Drafter and reviser share the stage's tier (`models.triage`/`scope`/`spec`, or `args.model`), so a
  revision is never written by a weaker model than the draft it overwrites. For scope and spec, the plan,
  the partition drafters, and the synthesizer share it too.
- The critic uses the same `agentType` as the drafter (same domain context) on `models.critic`.
- Every reviser receives `OQ_GUIDANCE` and its stage's contract (mirroring, frozen frontmatter, plus
  triage's status and block-answering rules or spec's upstream binding to the scope). On compose rounds it is
  handed the previous round's `open_questions` to carry forward verbatim, because critics audit the file and
  never see the returned questions.
- The returned `critique` is the verdict on the final on-disk artifact. `null` = the critic died; unknown,
  never clean.

### Triage

| | |
|---|---|
| Agent | `triage_agent`, or the first lane's architect |
| Reads | your idea, `<specs_dir>/triage-template.md`, the lane table built from config, the steering file's routing table, `git rev-parse` |
| Prompt ORDER | idea → verified facts → lane → change type → target region → exclusions → residual decisions (reasoning only; not recorded in the artifact) |
| Writes | `<specs_dir>/<slug>-triage.md`: six frontmatter lines, five sections (`## AS`, `## OBSERVE`, `## CONSIDERING`, `## VALIDATE`, `## OUTPUT`) |
| Returns | `{stage, triage: {status, lane, architect, dev, branch_prefix, blocked_on, blocked_reason, triage_path, open_questions}, critique}` |

The schema's `lane`, `architect`, `dev`, and `branch_prefix` enums are built at runtime from the config.
`status` is `routed` or `blocked`; the two branches' disjoint field sets are described in field descriptions
because the API rejects a top-level `oneOf`. The script then classifies:

- **dead drafter**: `{stage, error: "draft agent returned no result"}`; nothing written;
- **blocked**: returned as is; no lane, architect, or prefix was chosen;
- **malformed**: a `routed` return missing a routing field, or whose architect is not the named lane's
  architect: `{stage, error, triage: {...status: "malformed"}, critique}`. A drafter failure, never a question;
- **routed**: `{stage, triage, critique}`.

The command then compares the return with the artifact's `**Status**:` line; a disagreement is a
**divergent return** (the file wins).

### Scope

| | |
|---|---|
| Agent | `args.architect`, on `models.scope` |
| Plan | the triage plus every source document it names → anchors (a decision register's IDs, or stable section ids) → partitions by subsystem and source section |
| Drafter (per partition) | its source sections → goals (each check run, with its observed number) → non-goals → files (swept with `grep -rn`) → dependencies → open questions, every item tagged with its anchors |
| Synthesizer | fragments → executive summary (a causal mechanism between two named surfaces) → merged goals, non-goals, files affected, dependencies, open questions → self-check |
| Lens critics | `template` (Part A, the five rules drafters most often miss), `fidelity:<partition>` (each anchor lands, neither widened nor narrowed), `tree` (Part B: paths resolve, observed numbers re-run, sibling copies swept); plus `fidelity:unassigned` when the plan left anchors unassigned |
| Writes | `<specs_dir>/<slug>-scope.md` |
| Returns | `{stage, scope: {scope_path, open_questions}, critique, composition}` |

### Spec

| | |
|---|---|
| Agent | `args.architect`, on `models.spec` (the top tier by default) |
| Plan | the scope (binding Goals and Non-Goals) and triage → anchors (`G<n>` per scope goal; `OQ<n>` for a closed scope question that lands in no goal) → core principle → phase outline (titles `Phase <n>: <name>`, routing, dependencies, anchors delivered) → partitions of anchors, phases, and design subsections → cross-cutting interfaces |
| Drafter (per partition) | its anchors, phases, design subsections, and surfaces → current state (path and symbol), design elements, alternatives, terminology, full phase blocks (each with a `**Design**:` line naming headings from every partition's listed subsections), standards, `interface_notes`; every rule matching its surfaces opened by name |
| Synthesizer | executive summary, goals, non-goals, dependencies from the scope → merged terminology and current state → proposed design (core principle first; headings kept as drafted, or every `**Design**:` line updated with them) → `## Invariance` (reframing, surviving claim, one concrete falsifier) → phase blocks spliced verbatim in plan order → standards → open questions → self-check |
| Lens critics | `phases:<partition>` (reads only its phase blocks, the `### ` headings under `## Proposed Design`, terminology, and the scope's non-goals; owns phase-block form and the acceptance-criteria rule; returns an index per phase: agent, depends on, design headings, Scope IN paths, criteria count, test runs), `template` (reads everything above the plan plus Standards References and Open Questions, never the phase blocks; owns the document-level Part A bullets; returns the `### ` headings under `## Proposed Design`), `fidelity:<partition>` (reads its scope goals, `### Goals`, its design subsections and those its phases name, and its phases; each anchor lands, and each phase's Tasks and Scope IN agree with the subsections its Design line names), then `coherence` (a second hop, only above one partition: reads only the grep hits of files in more than one phase's Scope IN and of the cross-cutting decisions, plus terminology); plus `phases:unassigned` / `fidelity:unassigned` for unowned phases or anchors |
| Plain-JS checks | over the indexes, as `[check]` issues: every agent routable, every Design heading among the template lens's headings (skipped, and logged, when it returned none), Depends on names only earlier planned phases, at most six criteria, no criterion run equal to a configured suite command (flags and a leading `cd <dir> &&` ignored); they also compute the shared-file list the coherence lens reads |
| Writes | `<specs_dir>/<slug>.md` with `Status: Draft` |
| Returns | `{stage, spec: {spec_path, open_questions}, critique, composition}`; deliberately **no phases** |

Each phase has `**Goal**:`, `**Agent routing**:` (exactly one bare routable agent name), `**Depends on**:`,
`**Design**:` (the `## Proposed Design` subsection headings it implements, `; `-separated, or `None`),
`#### Scope` (**IN**/**OUT** as paths), `#### Tasks`, `#### Tests`, and `#### Acceptance Criteria`: at most
six bullets, one command or test selection each, each passing or failing on behaviour (a named test
selection, a stated output on a program path, a benchmark threshold). The only shape check allowed is an
absence grep that names its source: a symbol the phase's **IN** retires, an **OUT** exclusion, a scope
non-goal, or a steering-file constraint. No criterion names a whole-suite run or constrains a change by
`git diff` against `HEAD`. A phase over the cap is collapsed into named tests; a genuine split is never done
by the reviser and reaches the gate. The reviser leaves `**Status**` as it found it.

## Implement

Guards first: `architect` must be a configured lane architect; `phases` must be a non-empty array of
`{title, agent, scope, acceptance}` strings with an optional `design` (null or an array of headings); every
`agent` must be routable. Otherwise `{stage, error}`.

Then, strictly in sequence (one working tree, no worktrees), for each phase:

```
(a) dev agent (p.agent)            implModel || model || models.impl
      │ null ─► halt, sound: null
(b) criteria checker               models.check   runs named tests, reads named files
      │ not passed ─► halt, sound: null (review not run)
(c) architect review               model || models.review   agentType = the agent's lane architect,
      │                                                     or args.architect for unlaned agents
      │ unsound / null / any blocking concern ─► halt, sound: false
(d) committer                      models.commit  stages the tree minus <specs_dir> (artifacts are committed
      │                                           by the command, Steps 4 and 4a), commits with a
      │                                           `Spec-Phase: <slug> / <title>` trailer
      │ failed commit / null ─► halt (the phase passed; its work is on the tree, uncommitted)
      ▼ next phase
```

- Reads are scoped to the phase. The dev agent opens the spec only for `### Core Principle`, the subsections
  its `design` names (all of `## Proposed Design` when `design` is null), and its own phase block; the
  reviewer reads the same plus `## Invariance`; the checker sees the criteria alone; the committer reads only
  the phase block. A named heading that does not exist stops the agent before any work.
- The dev prompt carries the phase scope verbatim, the rules instruction, the "one test that fails if this
  change is reverted" rule with `mandatory_tests` as exceptions, and `SCOPED_TESTS`.
- The checker reports per criterion `{criterion, met, deferred}`. A criterion that names a whole-suite run is
  judged on a narrow substitute and marked `deferred: true`. `passed` is recomputed fail-closed: every row
  must be met.
- The review judges design fit, each configured invariant, simplicity, and test proportionality (step 3b,
  citing "Tests a wrong program passes too" and "Source-shape assertions with no named invariant").
  `protected_guards` and source-shape guards that mechanize an invariant are never findings. Every concern
  carries `severity` (`blocking`/`observation`) and an `anchor`.
- The committer writes a subject in the repository's own convention (a conventional commit where the log
  shows none), a short prose body, and the `Spec-Phase` trailer. It reports staged paths the phase scope does
  not name as `unexpected` but commits them anyway. It never passes `--no-verify`, never amends, and never
  edits source to satisfy a hook. Nothing staged is `committed: false` with no error, which is not a halt.

Return: `{stage: "implement", results: [{phase, passed, sound, criteria, review, commit?, error?}], halted}`. The log
line counts deferred criteria, which validate settles.

## Validate

One agent on `models.validate` runs every `suites[]` entry exactly as written, from its `cwd`, after its
`setup`, adding no flags. A suite whose `timeout_ms` exceeds 600000 (the Bash tool's foreground cap) is run
with `run_in_background: true` and its own timeout, and the agent waits for the completion notification
rather than polling. It reports exact counts from each runner's summary line and the failing test ids with
one-line reasons. It fixes nothing and never re-runs flaky tests to green.

Return: `{stage: "validate", validation: {passed, suites: [{suite, passed, summary, failures?}]}}`. `passed`
is recomputed fail-closed: every suite passed and every configured suite was reported.

## Review and the gate (Step 6)

The command reports which artifact was written and a one-line result (lane; scope composition; spec phase
count and composition; per-phase results with commit SHAs; per-suite results), then:

- re-reads the triage `**Status**:` line before acting on a triage return (divergent, blocked, malformed);
- reports the critique (`clean: false` lists residual issues; `null` = verdict unavailable);
- reports implement results with care: `sound: null` is "review not run"; deferred criteria are a count, not
  failures; blocking concerns first, observations separately and marked non-blocking;
- surfaces `open_questions` via `AskUserQuestion` (context verbatim as the lead paragraph, recommended option
  first with ` (Recommended)`, at most 4 per call, never dropped or merged). Entries whose `question` begins
  `Blocking - ` are triage `B` entries; the marker is stripped and the paragraph is prefixed with
  `Blocking - triage cannot route until this is decided.`

### The gate

| Stage just returned | Advance only if |
|---|---|
| any | no `error`; no divergent return; `open_questions` is empty |
| `triage` | not `Blocked` or malformed, and `**Status**` reads `Decided` |
| `triage` / `scope` / `spec` | `critique` is non-null and `clean: true` |
| `scope` / `spec` | both `composition` anchor lists are empty, or `critique` is non-null and `clean: true` |
| `implement` | `halted` is null |
| `validate` | `validation.passed` is true, then ship |

When the gate stops on open questions and you answer them, the command applies the answers and re-checks the
gate against the artifact on disk; if everything is closed and nothing was structural, the chain resumes.
For any other stop, it waits for you to advance, refine, or rewind.

## Agent call kinds

These labels appear in the workflow's progress view:

| Label | Stage | `agentType` | Tier | Schema |
|---|---|---|---|---|
| `triage` | triage | triage agent | `models.triage` | triage return |
| `triage:critic` | triage | triage agent | `models.critic` | `{clean, issues}` |
| `triage:revise` | triage | triage agent | `models.triage` | triage return |
| `scope:plan` | scope | architect | `models.scope` | anchors, partitions, cross-cutting, rationale |
| `scope:draft:<partition>` | scope | architect | `models.scope` | anchored fragments |
| `scope:synthesize` | scope | architect | `models.scope` | `{scope_path, open_questions}` |
| `scope:critic:<lens>` | scope | architect | `models.critic` | `{clean, issues}` |
| `scope:critic` | scope | architect | `models.critic` | `{clean, issues}` (re-checks, feedback rounds) |
| `scope:revise` | scope | architect | `models.scope` | `{scope_path, open_questions}` |
| `spec:plan` | spec | architect | `models.spec` | anchors, core principle, phase outline, partitions, cross-cutting, rationale |
| `spec:draft:<partition>` | spec | architect | `models.spec` | anchored fragments with full phase blocks |
| `spec:synthesize` | spec | architect | `models.spec` | `{spec_path, open_questions}` |
| `spec:critic:<lens>` | spec | architect | `models.critic` | `{clean, issues}`, plus `phases[]` (phases lenses) or `design_headings[]` (template) |
| `spec:critic:recheck:<lens>` | spec | architect | `models.critic` | `{clean, issues}` (per-lens re-checks) |
| `spec:critic` | spec | architect | `models.critic` | `{clean, issues}` (feedback rounds) |
| `spec:revise` | spec | architect | `models.spec` | `{spec_path, open_questions}` |
| `impl:<title>` | implement | the phase's routed agent | `implModel` / `models.impl` | none (text) |
| `verify:checks:<title>` | implement | default workflow agent | `models.check` | `{passed, criteria[]}` |
| `verify:review:<title>` | implement | the agent's lane architect | `models.review` | `{sound, concerns[]}` |
| `commit:<title>` | implement | default workflow agent | `models.commit` | `{committed, sha, subject, unexpected[], error}` |
| `validate:full-suite` | validate | default workflow agent | `models.validate` | `{passed, suites[]}` |

`args.model`, when set, replaces the tier of plans, drafters, synthesizers, revisers, dev agents, and
reviews; critics, the checker, the committer, and validate keep theirs. `implModel` wins over `model` for dev agents.

## Ship (Step 7)

Only after a validate return with `passed: true` and no code change since:

1. **Leftover commits.** Step 4 committed the artifacts and implement committed each phase. Any code change
   still on the tree (a direct fix after a failed validate) is committed first, on its own:
   `git add -A -- . ':(exclude)<specs_dir>'`, then commit if anything was staged. Never `git add -A` over the
   specs directory: other workstreams' drafts would ride along. Then any artifact revision still on the tree
   is committed per Step 4a (or, for a run begun before Step 4 committed the artifacts, Step 4's commit runs
   now). Record `git rev-parse HEAD` as `<spec-sha>`: the tip holding the artifacts' final text, and the
   parent of the removal commit.
2. `git push -u <remote> <prefix>/<slug>`.
3. `gh pr create`. The body includes the project name, the per-phase acceptance results with each phase
   commit's short SHA, the architect
   **observations** from passing phases with their anchors, and the validate per-suite results. With
   `remove_artifacts_after_pr: true` it links the spec by SHA permalink
   (`<repo-url>/blob/<spec-sha>/<specs_dir>/<slug>.md`); with `false`, by branch path.
4. **Removal commit** (only when `remove_artifacts_after_pr` is true, and only after the PR exists):
   `git rm` exactly the three files, commit `chore(specs): remove <slug> pipeline artifacts`, push. Never glob
   the specs directory. Requires merge commits.

If a PR already exists, the command reports it rather than opening a second one, and runs step 4 if the
artifacts are still on the branch tip.

The branch reads: the spec commit, one commit per phase with revision commits wherever an artifact was
edited, any ship-time leftovers, then the removal commit last. Nothing else commits under `<specs_dir>/`.

## Rework after ship

Restore the artifacts first, because implement rebuilds phases from the spec:

```sh
git restore --source=<spec-sha> -- <specs_dir>/<slug>-triage.md <specs_dir>/<slug>-scope.md <specs_dir>/<slug>.md
```

`<spec-sha>` is in the PR body's permalink, or is the parent of the newest removal commit. The restored files
are untracked again, and the committer's `<specs_dir>` exclusion keeps them out of phase commits. A rework that
re-runs implement commits its phases itself. After validate passes again, commit any direct fix without the
artifacts and push to the existing PR, then delete the restored files. If the rework changed an artifact,
commit the changed artifacts on their own (Step 4a's form, with the `add` subject since they were untracked),
push, run the removal step again, and update the PR body's permalinks to the new `<spec-sha>`
(`gh pr edit <n> --body-file`), so the revision is recorded and linked before it is removed. With
`remove_artifacts_after_pr: false` the artifacts never left the branch: rework edits them in place and commits
each revision per Step 4a.
