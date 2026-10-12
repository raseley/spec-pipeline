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
| Owns | intent classification, stage derivation, `args` assembly, return review, the gate, inline edits, branch setup, ship | one stage's drafting, critiquing, implementing, checking, reviewing, or validating |

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
6. **Step 4, prepare the branch** when entering implement.
7. **Step 5, invoke once** and wait.
8. **Step 6, review the return**: report, check the artifact against the return, surface open questions,
   run the gate.
9. **Step 7, ship** after a green validate.

## Stage derivation (Step 2)

The stage is never stored. The first matching rule wins.

**Precondition, before rule 1:** if `<specs_dir>/<slug>-triage.md` reads exactly `**Status**: Blocked`, the
slug is at a blocked triage regardless of anything else. Report its `B` entries and stop. `advance` is an
error; the only legal move is a structural refine re-running triage with your answers.

| # | Condition | Position | `advance` runs |
|---|---|---|---|
| 1 | a merged PR for `<prefix>/<slug>` | done | nothing |
| 2 | an open PR for `<prefix>/<slug>` | shipped | nothing (reports the URL) |
| 3 | spec `Final`, branch carries implementation changes, no PR, and validate passed this session since the last code change | ship | ship (Step 7) |
| 4 | spec `Final`, branch carries implementation changes, no PR (validate not passed, stale, or unknown) | validate | `validate` (idempotent; when in doubt, validate again) |
| 5 | spec `Final` | implement | `implement` |
| 6 | spec `Draft` | spec drafted | `implement` (refine re-runs `spec`) |
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
| `phases` | **always** rebuilt from `<specs_dir>/<slug>.md`; on re-entry, the unpassed suffix |
| `model` | only when you ask ("run this stage on opus") |
| `implModel` | `models.escalation`, only when you ask to escalate, for that run only |

`branch_prefix` is command-only: the segment before `/` on the triage `**Branch**:` line.

**Re-entry slicing.** The script runs whatever `phases` array it receives. After a halt, the command resends
the suffix starting at the halted phase, using the previous return's `passed: true` **and** `sound: true` as
the pass record. A passed phase whose title, routing, Scope, or Acceptance Criteria changed since is sent
again. With no return in memory (after `/resume`), it walks the phases in order and checks each one's
criteria itself until the first unmet one.

## Branch setup (Step 4)

Only when entering implement and the `<prefix>/<slug>` branch is not current:

1. `git checkout <base> && git pull <remote> <base> && git fetch --prune <remote>`
2. `git checkout -b <prefix>/<slug>`, falling back to `git checkout <prefix>/<slug>` if it exists.

Guards: the slug's artifacts are untracked here on purpose (git carries them across checkout); a dirty tree
that blocks checkout stops the run; the spec must be present afterwards; never `git stash`. Entering
implement is the spec's approval: a `Draft` spec is set to `**Status**: Final` before the call.

## The document stages: triage, scope, spec

All three run through `refine()`:

```
compose (no feedback):   draft ──► critic (full audit) ──► [revise ──► critic (raised issues only)] × ≤2
feedback (structural):   revise (address every point) ──► critic (feedback points only)
```

- Drafter and reviser share the stage's tier (`models.triage`/`scope`/`spec`, or `args.model`), so a
  revision is never written by a weaker model than the draft it overwrites.
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
| ORDER | idea → verified facts → lane → change type → target region → exclusions → residual decisions |
| Writes | `<specs_dir>/<slug>-triage.md`: six frontmatter lines, six sections (`## AS` … `## OUTPUT`) |
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
| Agent | `args.architect` |
| Reads | the triage artifact (verified facts, CONSIDERING bullets, hand-off, Decided entries), `<specs_dir>/scope-template.md`, matching rules, the tree |
| ORDER | triage → executive summary (a causal mechanism between two named surfaces) → goals (one per verifiable outcome, each check run with its observed number) → non-goals → files affected (swept with `grep -rn`) → dependencies → open questions → self-check |
| Writes | `<specs_dir>/<slug>-scope.md` |
| Returns | `{stage, scope: {scope_path, open_questions}, critique}` |

### Spec

| | |
|---|---|
| Agent | `args.architect`, on `models.spec` (the top tier by default) |
| Reads | the scope (binding Goals and Non-Goals) and triage, `<specs_dir>/spec-template.md`, every rule matching the files (opened by name), the tree |
| ORDER | problem → goals → non-goals → current state (path and symbol) → proposed design → `## Invariance` (reframing, surviving claim, one concrete falsifier) → phased Implementation Plan → self-check |
| Writes | `<specs_dir>/<slug>.md` with `Status: Draft` |
| Returns | `{stage, spec: {spec_path, open_questions}, critique}`; deliberately **no phases** |

Each phase has `**Goal**:`, `**Agent routing**:` (exactly one bare routable agent name), `**Depends on**:`,
`#### Scope` (**IN**/**OUT** as paths), `#### Tasks`, `#### Tests`, and `#### Acceptance Criteria`. The spec
critic additionally checks that routing lines parse and that no criterion names a whole-suite run or
constrains a change by `git diff` against `HEAD`.

## Implement

Guards first: `architect` must be a configured lane architect; `phases` must be a non-empty array of
`{title, agent, scope, acceptance}` strings; every `agent` must be routable. Otherwise `{stage, error}`.

Then, strictly in sequence (one working tree, no worktrees), for each phase:

```
(a) dev agent (p.agent)            implModel || model || models.impl
      │ null ─► halt, sound: null
(b) criteria checker               models.check   runs named tests, reads named files
      │ not passed ─► halt, sound: null (review not run)
(c) architect review               model || models.review   agentType = the agent's lane architect,
      │                                                     or args.architect for unlaned agents
      │ unsound / null / any blocking concern ─► halt, sound: false
      ▼ next phase
```

- The dev prompt carries the phase scope verbatim, the rules instruction, the "one test that fails if this
  change is reverted" rule with `mandatory_tests` as exceptions, and `SCOPED_TESTS`.
- The checker reports per criterion `{criterion, met, deferred}`. A criterion that names a whole-suite run is
  judged on a narrow substitute and marked `deferred: true`. `passed` is recomputed fail-closed: every row
  must be met.
- The review judges design fit, each configured invariant, simplicity, and test proportionality (step 3b,
  citing "Tests a wrong program passes too" and "Source-shape assertions with no named invariant").
  `protected_guards` and source-shape guards that mechanize an invariant are never findings. Every concern
  carries `severity` (`blocking`/`observation`) and an `anchor`.

Return: `{stage: "implement", results: [{phase, passed, sound, criteria, review, error?}], halted}`. The log
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

The command reports which artifact was written and a one-line result (lane; phase count; per-phase results;
per-suite results), then:

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
| `implement` | `halted` is null |
| `validate` | `validation.passed` is true, then ship |

When the gate stops on open questions and you answer them, the command applies the answers and re-checks the
gate against the artifact on disk; if everything is closed and nothing was structural, the chain resumes.
For any other stop, it waits for you to advance, refine, or rewind.

## Agent call kinds

Thirteen labels appear in the workflow's progress view:

| Label | Stage | `agentType` | Tier | Schema |
|---|---|---|---|---|
| `triage` | triage | triage agent | `models.triage` | triage return |
| `triage:critic` | triage | triage agent | `models.critic` | `{clean, issues}` |
| `triage:revise` | triage | triage agent | `models.triage` | triage return |
| `scope` | scope | architect | `models.scope` | `{scope_path, open_questions}` |
| `scope:critic` | scope | architect | `models.critic` | `{clean, issues}` |
| `scope:revise` | scope | architect | `models.scope` | `{scope_path, open_questions}` |
| `spec` | spec | architect | `models.spec` | `{spec_path, open_questions}` |
| `spec:critic` | spec | architect | `models.critic` | `{clean, issues}` |
| `spec:revise` | spec | architect | `models.spec` | `{spec_path, open_questions}` |
| `impl:<title>` | implement | the phase's routed agent | `implModel` / `models.impl` | none (text) |
| `verify:checks:<title>` | implement | default workflow agent | `models.check` | `{passed, criteria[]}` |
| `verify:review:<title>` | implement | the agent's lane architect | `models.review` | `{sound, concerns[]}` |
| `validate:full-suite` | validate | default workflow agent | `models.validate` | `{passed, suites[]}` |

`args.model`, when set, replaces the tier of drafters, revisers, dev agents, and reviews; critics, the
checker, and validate keep theirs. `implModel` wins over `model` for dev agents.

## Ship (Step 7)

Only after a validate return with `passed: true` and no code change since:

1. **Implementation commit.** `git add -A -- . ':(exclude)<specs_dir>'`, then
   `git add <specs_dir>/<slug>-triage.md <specs_dir>/<slug>-scope.md <specs_dir>/<slug>.md`, then commit.
   Never `git add -A` over the specs directory: other workstreams' drafts would ride along. Record the SHA as
   `<spec-sha>`.
2. `git push -u <remote> <prefix>/<slug>`.
3. `gh pr create`. The body includes the project name, the per-phase acceptance results, the architect
   **observations** from passing phases with their anchors, and the validate per-suite results. With
   `remove_artifacts_after_pr: true` it links the spec by SHA permalink
   (`<repo-url>/blob/<spec-sha>/<specs_dir>/<slug>.md`); with `false`, by branch path.
4. **Removal commit** (only when `remove_artifacts_after_pr` is true, and only after the PR exists):
   `git rm` exactly the three files, commit `chore(specs): remove <slug> pipeline artifacts`, push. Never glob
   the specs directory. Requires merge commits.

If a PR already exists, the command reports it rather than opening a second one, and runs step 4 if the
artifacts are still on the branch tip.

## Rework after ship

Restore the artifacts first, because implement rebuilds phases from the spec:

```sh
git restore --source=<spec-sha> -- <specs_dir>/<slug>-triage.md <specs_dir>/<slug>-scope.md <specs_dir>/<slug>.md
```

`<spec-sha>` is in the PR body's permalink, or is the parent of the removal commit. The restored files are
untracked. After validate passes again, commit the rework without the artifacts and push to the existing PR,
then delete the restored files. If the rework changed an artifact, add it in that commit and run the removal
step again, so the revision is recorded before it is removed.
