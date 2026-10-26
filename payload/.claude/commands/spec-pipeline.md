---
description: Drive the spec pipeline (triage -> scope -> spec -> implement -> validate -> ship) for a workstream in plain English.
argument-hint: <idea prose> | advance | refine: <notes> | rewind to <stage>
---

You are the **orchestrator** for the `spec-pipeline` Dynamic Workflow
(`.claude/workflows/spec-pipeline.js`). The developer steers in plain English. You
translate that prose into `Workflow({ name: "spec-pipeline", args })` calls and review
what each call returns. An inline refine (Step 1a) makes **zero** calls. The workflow runs
one stage per call and then hands control back to you. You are the only place a human can
steer. After reviewing a return you do one of two things:

- **auto-advance** to the next stage, when Step 6.6's gate is clear (nothing needs the developer);
- **stop** and surface what needs the developer.

Calls are strictly sequential. Never issue a second call while one is running. Never issue
the next call before you have reviewed the previous return.

**The developer never types a JSON args block.** The `args` object the workflow body
reads is an internal contract you assemble. It has ten fields:

| Field | Filled by | Meaning |
|---|---|---|
| `config` | you, Step 0 | the parsed `.claude/spec-pipeline.json`, verbatim, on **every** call |
| `stage` | you, Step 2 | `triage` \| `scope` \| `spec` \| `implement` \| `validate` |
| `slug` | you, Step 2 | kebab-case workstream slug; names `<specs_dir>/<slug>-*.md` and the `<prefix>/<slug>` branch |
| `date` | you, Step 3 | today, `YYYY-MM-DD`, from session context |
| `idea` | the developer | triage only: their raw prose |
| `feedback` | the developer | this round's notes, structural refine only |
| `architect` | you, Step 3 | scope / spec / implement: one of `config.lanes[].architect` |
| `phases` | you, Step 3 | implement only: rebuilt from the on-disk spec |
| `model` | you, on request | optional tier override for drafters, revisers, devs, and reviews |
| `implModel` | you, on request | optional tier for implement's dev calls only (escalation) |

Of those ten fields the developer ever supplies only two: `idea` (their sentence) and
`feedback` (their review prose). `config` is read from `.claude/spec-pipeline.json`. You fill
in or carry forward the rest. `branch_prefix` is not an arg: only you use it (Steps 4 and 7).
If you find yourself about to ask the developer for a slug, a date, a stage name, or any
structured field, stop and work it out instead. Never ask the developer to confirm a slug.
Pick it, announce it, and proceed.

The developer's prose arrives as: $ARGUMENTS

## Step 0 — load configuration

Before anything else in every invocation, read `.claude/spec-pipeline.json` with the Read tool
and parse it. If the file is missing, is not valid JSON, or its `version` is not `1`, stop and
report: "spec-pipeline is not configured: `.claude/spec-pipeline.json` is missing/invalid. See
ADOPT.md." Never guess a configuration, and never write or edit this file yourself.

Keep the parsed object for the session (re-read it after `/resume`, and whenever the
developer says they changed it). Apply only these defaults for your own use; the workflow
applies the full set itself:

| Name used below | Value |
|---|---|
| `<specs_dir>` | `config.specs_dir`, default `docs/specs` (no trailing slash) |
| `<agents_dir>` | `config.agents_dir`, default `.claude/agents` |
| `<rules_dir>` | `config.rules_dir`, default `.claude/rules` |
| `<base>` | `config.git.base_branch`, default `main` |
| `<remote>` | `config.git.remote`, default `origin` |
| `<prefixes>` | `config.git.branch_prefixes`, default `feat`, `fix` |
| `<remove_after_pr>` | `config.ship.remove_artifacts_after_pr`, default `true` |
| `<escalation>` | `config.models.escalation`, default `fable` |

On **every** `Workflow` call, set `args.config` to the full parsed object, as a JSON object
inside the tool call: never a string, never trimmed, never with your defaults merged in. The
workflow script has no filesystem access; `args.config` is its only view of the project. A
call without it returns `{ stage, error: "invalid config: ..." }`; so does a config the script
rejects. Report that error verbatim and stop: the fix is in the config file, which is the
developer's to edit.

Every path below is built from `<specs_dir>`, and every git command from `<base>` and
`<remote>`.

## Terms

- **artifact**: a file under `<specs_dir>/` for this slug (`<specs_dir>/<slug>-triage.md`, `<specs_dir>/<slug>-scope.md`, or `<specs_dir>/<slug>.md`). Untracked until Step 4 commits it; after that, tracked on `<prefix>/<slug>` and on disk only with that branch checked out.
- **stage**: one step of the pipeline: `triage`, `scope`, `spec`, `implement`, or `validate`. Ship follows validate and is done by you (Step 7).
- **the next stage**: the stage the next advance runs. It is never stored. You work it out from which files exist, plus git and `gh` (Step 2).
- **return**: what one workflow call hands back to you.
- **carry forward**: reuse a value from the previous return in the next call's `args`.
- **lane table**: `config.lanes[]`. Each lane has a `name`, an `architect`, a `dev`, and optional `other_agents`. `config.unlaned_agents` are routable on a phase but belong to no lane.
- **inline refine**: a refine you apply yourself with a direct `Edit` to the artifact, with no workflow call (Step 1a); once the artifact is tracked, followed by one revision commit (Step 4a).
- **structural refine**: a refine that re-runs the same stage with the developer's notes as `feedback` (Step 1a).
- **blocked triage**: a triage artifact whose `**Status**:` line reads exactly `Blocked`. Triage declined to route, and no downstream stage may run until it is resolved.
- **divergent return**: a triage return whose status disagrees with the `**Status**:` line of the artifact on disk (Step 6 item 1). The file wins.
- **malformed return**: a triage return with an `error` string and `triage.status === "malformed"`. It is a drafter or schema failure, not a triage decision (Step 6 item 1).
- **deferred criterion**: an acceptance criterion with `deferred: true`. It named a whole-suite run, a narrower selection ran instead, and validate settles it (Step 6 item 3).
- **observation vs blocking concern**: the two `severity` values of an architect review concern. A blocking concern halts the phase. An observation is true but does not halt it (Step 6 item 3).
- **lens**: one critic of the spec or scope compose panel, named by its label prefix on each issue it raises (spec: `[template]`, `[phases:<partition id>]` or `[phases:unassigned]`, `[fidelity:<partition id>]` or `[fidelity:unassigned]`, `[coherence]`; scope: `[template]`, `[fidelity:<partition id>]` or `[fidelity:unassigned]`, `[tree]`; `[check]` for a plain-JS check) (Step 6 item 2).

## Step 1 — classify the intent

Match `$ARGUMENTS` against these four shapes:

| Developer prose | Intent | What you assemble |
|-----------------|--------|-------------------|
| free-form idea text (anything not matching the rows below) | **start** | `idea` = the prose; `slug` = kebab-cased from it; `stage` = `triage` (or the next stage if `<slug>-*.md` already exist — see Step 2) |
| `advance` (or "next", "go on", "proceed") | **advance** | `stage` = the next stage (Step 2); carry forward `architect` from the prior return; when entering `implement`, reconstruct `phases` from `<specs_dir>/<slug>.md` (always — see Step 3); when entering `implement`, run Step 4 first (it approves and commits the spec the first time through) |
| `refine: <notes>` (or "refine", "revise", "change …") | **refine** | classify the notes first (Step 1a): **inline** ⇒ edit the artifact yourself, **no Workflow call**; **structural** ⇒ the **same** `stage` as last run, with this round's notes as `feedback`; an answer to a blocking (B) triage entry is always structural |
| `rewind to <stage>` | **rewind** | the named `stage`; classify the correction per Step 1a (inline edit vs. `feedback`); expect downstream stages to re-run afterward; a rewind to `triage`, `scope` or `spec` after the spec commit edits tracked files — commit each stage's revision per Step 4a before advancing again |

A request about tiers rides along with any of these: "run this stage on opus" sets `model`
for that one call; "retry that phase on <tier>" or "escalate" sets `implModel` (Step 3).

### Step 1a — classify refine feedback: inline edit vs. workflow round

Not every refine needs a workflow call. Before assembling `args`, classify the
developer's notes:

- **Inline** (the default for non-structural notes): decision selections that answer the
  stage's open questions, wording or terminology fixes, small factual corrections, and adding
  or dropping a detail whose consequences don't cascade into other sections. Apply these
  yourself with a direct `Edit` to `<specs_dir>/<slug>-*.md`. Stay within the template's
  section bounds. Close any Open Questions entry a note answers. If the artifact is tracked
  (Step 4 has committed it), commit the edit on its own per Step 4a. Then report what you
  changed and stop. **No Workflow call.** A two-line decision is a 30-second edit, not an
  agent fan-out; after the spec commit it is also one git commit.

  **Recording a decision.** Each template defines the closed-entry shape for its question
  section — triage's `## OUTPUT` Form 2 **Decided** entry, scope's and spec's `## Open Questions`
  closed entry — in the comment block above that section. The three shapes differ on purpose;
  use the one the artifact's own template defines. Close the answered entry in that shape,
  keeping its number and its **Context** and **Options** as the template says, and edit
  nothing else. Never add a section to hold decisions, and never record a decision outside
  the question section. Four things the template cannot know:
    1. **Date.** Stamp the closure with the session date. The artifact has no clock.
    2. **Label.** When the developer picked a listed option, write its label
       character-for-character from the entry's own Options list, stripping the
       ` (Recommended)` display suffix Step 6.5 added; never paraphrase it. When they answered
       off the list, use the template's off-list `Selected` form and record the answer as they
       gave it; never map it onto the nearest option.
    3. **Rationale.** Record the developer's stated rationale. Where they gave none, write
       exactly `selected by the developer without stated rationale`. Never manufacture one.
       Triage's `**Obliges scoping to**` is the only new prose you may write, and only where
       the selected option's own description creates a derivation obligation.
    4. **Status.** Scope stays `Draft`. A spec is `Draft` until Step 4 approves it and `Final`
       after; an inline edit never moves it either way, and a revision of an approved spec
       stays `Final`. A triage artifact is re-evaluated: it becomes `Decided` when no
       `**Open**` marker, no `B` entry, and no unfillable form remains anywhere; otherwise it
       stays `Draft`.

  Two kinds of closure are structural, not inline. Send them back as `feedback`:
  - an entry that a triage `## VALIDATE` unfillable form raised (that section must be written
    as specifically as the template requires);
  - any answer that invalidates a section: triage's lane or change type; scope's goals,
    non-goals, or files-affected map; spec's goals, non-goals, design, Invariance section, or
    phase decomposition. An off-list answer that introduces a mechanism the artifact does not
    describe is usually this kind.

  The spec reviser must re-read the scope before touching Goals or Non-Goals. An inline
  edit would skip exactly that check.

  **Answering a blocking (`B`) entry is always structural, never inline.** A blocking answer
  changes the lane or the change type, or splits the workstream, so it cascades through every
  section. Send the developer's selection back as `feedback` on a re-run of the `triage` stage.
  The stage revises the artifact in place. It replaces the unfillable section with real content,
  rewrites the frontmatter out of the blocked state, and returns `status: "routed"`. Do not
  hand-edit `**Status**`, `**Lane**`, or `**Branch**` out of the blocked state yourself. Do
  not accept a `routed` return whose artifact still reads `**Status**: Blocked` (Step 6.1).

- **Structural** (call the workflow): the note changes the lane or change type, adds or
  removes goals/non-goals, alters the design approach or phase decomposition, or otherwise
  cascades across sections so the artifact must be re-derived. Re-invoke the same stage
  with the notes as `feedback`. The stage revises the artifact **in place**, using one reviser
  plus one critic scoped to the feedback points. It does not redraft.

When unsure, prefer inline. The workflow round is the escalation, not the default.

## Step 2 — work out which stage comes next

The stage is **never stored**. Work it out each time from which files exist under
`<specs_dir>/` and from git and `gh`, using the rules below. The first rule that matches wins.

**Where the artifacts live.** Until Step 4 commits them, a slug's artifacts are untracked and
visible from any branch. From the spec commit on they are tracked on `<prefix>/<slug>` and
are on disk only while that branch is checked out. So before applying the rules, when no
`<specs_dir>/<slug>-*.md` is on disk, proceed in this order:

1. Query PRs for **every** prefix in `<prefixes>` first, open and merged alike
   (`gh pr list --head <prefix>/<slug> --state all`, once per prefix). The triage artifact
   that records the prefix may not be on disk, so never assume one. If a PR exists, rules 1
   and 2 answer from the query alone. Check nothing out. This is also how a **start** intent
   on a slug that collides with an old merged branch is answered: by the PR query, not by a
   checkout.
2. Only when no PR exists, look for the branch, locally and on `<remote>`, under every prefix
   (`git branch --list '<prefix>/<slug>'` and
   `git branch -r --list '<remote>/<prefix>/<slug>'`). If one exists, check it out (Step 4's
   dirty-tree guard applies; `git checkout -t <remote>/<prefix>/<slug>` when only the remote
   has it) and re-read `<specs_dir>/`.
3. A branch that exists with no PR and no `<specs_dir>/<slug>-*.md` on its tip is a ship
   that was closed unmerged: Step 7.4's removal commit landed and the PR was closed. Report
   it and stop. The only move is the restore recipe under **Rework after ship** (Step 7).

Rule 9 applies only when neither the files, nor a PR, nor a branch exist.

**Precondition, checked before rule 1.** If `<specs_dir>/<slug>-triage.md` exists and its
`**Status**:` line reads exactly `Blocked`, the slug is at a **blocked** triage. This holds
regardless of what other artifacts, branches, or PRs exist for the slug. Report the
artifact's `B` entries and stop. **advance** is an error in this state. No downstream stage
may run for a slug whose triage declined to route. The only legal move is a structural refine
that re-runs `triage` with the developer's answers to the `B` entries as `feedback`.
Match the token exactly.

1. a merged PR for `<prefix>/<slug>` exists (`gh pr list --head <prefix>/<slug> --state merged`) ⇒ **done** (report it; the pipeline does not run past ship).
2. an open PR for `<prefix>/<slug>` exists (`gh pr list --head <prefix>/<slug> --state open`) ⇒ **shipped** (report the PR URL; nothing left to advance).
3. `<slug>.md` exists with `Status: Final` **and** the `<prefix>/<slug>` branch carries implementation commits (any commit on `<base>..<prefix>/<slug>` other than the `docs(specs):` artifact commits and the `chore(specs):` removal commit) or implementation changes in the working tree, with no PR yet **and** a `validate` stage has returned `passed: true` this session since the last code change ⇒ at **ship**; **advance** runs the ship step (commit → push → open PR — see Step 7).
4. `<slug>.md` exists with `Status: Final` **and** the branch carries implementation commits or working-tree changes as in rule 3, with no PR yet (validate not yet passed, or its pass predates further code changes, or unknown — e.g. after `/resume`) ⇒ at **validate**; **advance** runs the `validate` stage. Validation writes nothing and is idempotent. When in doubt, validate again rather than assume a prior pass.
5. `<slug>.md` exists with `Status: Final` ⇒ at **implement** (the spec is approved and committed on `<prefix>/<slug>` by Step 4, and no implementation commit has landed yet). **refine** at a Final spec: an inline refine edits the tracked file and commits it per Step 4a; a structural refine re-runs `spec` as a `feedback` round on the tracked artifact, and its return is committed per Step 4a (Step 6 item 2). The spec stays `Final` either way.
6. `<slug>.md` exists with `Status: Draft` ⇒ spec drafted; **advance** approves the spec (Step 4: branch, Final, commit) and then runs `implement`, **refine** re-runs `spec`.
7. `<slug>-scope.md` exists but no `<slug>.md` ⇒ scoped; **advance** runs `spec`, **refine** re-runs `scope`.
8. only `<slug>-triage.md` exists (and the Blocked precondition did not fire) ⇒ triaged; **advance** runs `scope`, **refine** re-runs `triage`. If its `**Status**:` reads `Draft`, report the open entries per Step 6.5. Do **not** run `scope` until they are closed. The hand-off sentence requires every **Open** entry to be closed before it is acted on, and the scope agent cannot close them.
9. nothing exists ⇒ **advance**/**refine** are errors; ask the developer for an idea first.

Rules 1 and 2 use the `gh` CLI because `config.ship.forge` is `github`, the only forge
implemented. If `gh` is unavailable or unauthenticated, or the remote is not on GitHub, say so,
skip rules 1–2, and let the developer tell you whether a PR exists.

The `<prefix>` above is the branch prefix triage chose (one of `<prefixes>`, see Step 3).
Where a rule says **refine** re-runs a stage, it means a *structural* refine (Step 1a). An
inline refine edits the artifact directly and never invokes the workflow, whatever stage the
slug is at.

For a **start** intent, kebab-case a slug from the idea **automatically**. Do not ask
the developer to confirm it. Announce the chosen slug in your reply (e.g. "Using
slug `partial-refunds`.") and proceed to the first call. If artifacts for that slug already
exist — on disk, recorded by a PR, or committed on a `<prefix>/<slug>` branch per the ordered
list above — report the stage the rules above give. Then treat the request as
**advance**/**refine** rather than overwriting triage.

## Step 3 — fill the fields the developer never supplies

Fill each field as follows:

- **`config`** — the object from Step 0, on every call.
- **`date`** — the workflow body may not read a clock (`new Date()` is forbidden). Stamp
  today's date (YYYY-MM-DD) from session context into every `args.date`.
  Never ask the developer for it.
- **`architect` / `branch_prefix`** — carry these forward from the prior stage's
  validated return *within a session*. That return does **not** survive `/resume` or
  session death. When conversational memory is absent, **recover them from the artifacts
  on disk** (after Step 4 that means with `<prefix>/<slug>` checked out — see Step 2's
  first paragraph):
  - `architect` - read `**Lane**:` from the frontmatter of `<specs_dir>/<slug>-triage.md`,
    find the lane in `config.lanes[]` whose `name` equals it, and use that lane's `architect`.
    A `**Lane**: unresolved` line means the triage is blocked. Then carry nothing forward, run nothing
    downstream, and report per Step 2's Blocked precondition. A lane name that matches no
    configured lane means the config changed after triage: report it and stop.
  - `branch_prefix` - the segment before `/` on the `**Branch**:` line of the same file. It
    must be one of `<prefixes>`. It names the `<prefix>/<slug>` branch that the spec commit (Step 4),
    implement, and ship operate on. A line with no `/` is the blocked form (`**Branch**: unresolved - triage blocked on routing`).
    Report it and stop.

  For these two, **prefer the in-memory return, and fall back to reading the artifact**.
  The committed artifacts alone are enough to reconstruct every carried-forward field.
  That is what makes this entry point session-independent.

- **`phases`** — **always reconstruct from disk**, never from a return value. The spec
  stage deliberately returns no phases array. Every time you assemble an `implement`
  call, read these from `<specs_dir>/<slug>.md`: the `### Phase N: ` headings, the
  `**Agent routing**:` lines, the `**Design**:` lines, and each phase's `#### Scope` and
  `#### Acceptance Criteria`. Reconstruct `[{ title, agent, design, scope, acceptance }]`
  from them (`title` is the heading text, `agent` the single bare name on the routing line,
  `scope` and `acceptance` the blocks' text verbatim). `design` is the `**Design**:` line
  split on `; ` into an array of `## Proposed Design` subsection headings, copied character
  for character; `[]` when the line reads `None`; `null` when the spec has no such line
  (written before the line existed), which sends the dev agent and the reviewer to all of
  `## Proposed Design` as before. The `**Design**:` line is one physical line. After
  splitting it, verify each heading exists as a `### <heading>` line under
  `## Proposed Design` (`grep -nF '### <heading>' <specs_dir>/<slug>.md`, and the hit's line
  number falls inside that section). A miss is a spec defect: stop and report which phase and
  which heading. Do not send the phase. The on-disk spec is the single source of truth. This keeps hand-edits and
  `refine` rounds made after the spec stage from silently diverging from what implement
  executes. The workflow rejects a phase whose `agent` is not a configured agent; if that
  happens, the spec's routing line is wrong, so report it rather than rewriting the agent.

  **Re-entry slicing**: the workflow runs whatever array it receives, starting from
  `phases[0]`. When a prior `implement` run halted:
  - Do not resend phases that already passed. A dev agent re-running a completed phase
    rewrites work already on the tree.
  - Slice the reconstructed array to the suffix starting at the halted phase. Use the prior
    return's `results` (`passed: true` **and** `sound: true`) as the pass record.
  - A phase's pass counts only while its spec section is unchanged. If a `refine` round or
    hand-edit touched a passed phase's title, Agent routing, Design, Scope, or Acceptance
    Criteria since the run that passed it, include that phase again. With the artifacts
    tracked (Step 4), `git diff <phase-sha> -- <specs_dir>/<slug>.md` shows exactly what
    changed in the spec since that phase's commit. It compares against the working tree, not
    `HEAD`, so an uncommitted re-sync is visible.
  - With no in-memory return to consult (e.g. after `/resume`), do not guess. Do not blindly
    re-run from the top. Read the pass record from git instead. Every phase that passed was
    committed with a `Spec-Phase: <slug> / <title>` trailer:
    `git log --format='%(trailers:key=Spec-Phase,valueonly)' <base>..HEAD`. Phase commits made
    before the committer handed the trailer to git (spec-pipeline 0.3.0 and earlier) can carry
    the line as body text after a blank line, where git does not parse it, so also read
    `git log --format=%B <base>..HEAD | grep '^Spec-Phase: <slug> / '`. A phase is recorded if
    either read names it. Slice at the first phase, in spec order, that neither read names. The
    unchanged-spec-section rule above still applies. If the branch has implementation commits with no trailers (work from before
    per-phase commits; the `docs(specs):` artifact commits and the `chore(specs):` removal
    commit carry no trailer and are not implementation commits), fall back to checking each
    phase's Acceptance Criteria yourself (run the named tests, read the named files) until the
    first unmet one, and slice there.

- **`implModel`** (optional, `implement` only) — the dev agents run on `config.models.impl` by
  default; the criteria checker runs on `models.check` and the per-phase architect review on
  `models.review`. The top tier is held for spec drafting by default. Set `implModel` to
  `<escalation>` only when the developer asks to escalate (e.g. "retry that phase on the top
  tier"), or to the tier they name. This is typically on the re-entry call after a halt,
  where the slicing above already limits the resend to the halted suffix. Never set it on
  your own initiative. Do not carry it forward into later calls: each escalation is the
  developer's call for that run.
- **`model`** (optional, any stage) — overrides the tier of every drafter, reviser, dev, and
  architect-review call in that one run; critics, the criteria checker, and validate keep
  their configured tiers. Set it only when the developer asks ("run this stage on opus"), or
  when a configured tier is unavailable to this account and the developer agrees to the
  substitute. Do not carry it forward.

For a structural refine (Step 1a), pass only the current round's notes as `feedback`.
Each round's revision, and each inline edit, is already applied to the artifact on disk,
so prior rounds' notes are already in it. Re-sending them just makes the reviser re-address
settled points. Pass `feedback` only when the stage's artifact exists on disk (it always
does after a successful run). If the prior run errored before writing anything, re-run the
stage fresh with no `feedback`.

## Step 4 — approve the spec: branch, Final, commit

Run this step when the stage you are about to run is `implement`, before the Workflow call.
It is the spec → implement boundary: the moment the spec is approved. Approval is whichever
comes first: Step 6.6's gate clears on a `spec` return (including the re-check after the
developer's answers close every open question), or the developer says **advance** while
Step 2 places the slug at rule 6. No stage can do this for you: the spec stage returns
before approval exists, and the workflow's dev agents are forbidden from any branch
operation. Every sub-step is idempotent. Re-entering `implement` after a halt or a
`/resume` runs them again and they change nothing.

1. **Branch.** If `<prefix>/<slug>` is already checked out, skip to 2. Otherwise
   `git checkout <base> && git pull <remote> <base> && git fetch --prune <remote>`, then
   `git checkout -b <prefix>/<slug>`, falling back to `git checkout <prefix>/<slug>` if it
   already exists. The artifacts are untracked until sub-step 3 commits them, and git
   carries untracked files across `checkout`. Do not stop or ask the developer about them.
2. **Final.** If `<specs_dir>/<slug>.md` reads `**Status**: Draft`, set it to
   `**Status**: Final`. Without this, Step 2 (rules 3–5) cannot place the slug at implement,
   validate, or ship, and a `/resume` would send it back to spec.
3. **Commit.** `git add -- <specs_dir>/<slug>-triage.md <specs_dir>/<slug>-scope.md <specs_dir>/<slug>.md`
   (whichever exist). If anything is staged, commit it: the first time through (the files
   were untracked) as `git commit -m "docs(specs): add <slug> pipeline artifacts"`; on any
   later pass, in Step 4a's revision form. If nothing is staged there is nothing to do.
4. Confirm `<specs_dir>/<slug>.md` is present and reads `Final`. If it is missing, stop and
   report it.

Guards (the pipeline's own guardrail: one working tree; no worktrees; no `git stash`):
- If a dirty working tree blocks `git checkout <base>` (git refuses the checkout), **stop
  and report** it. Let the developer commit or discard first. Never stash it away.
- If `git checkout <prefix>/<slug>` refuses because untracked artifacts would be
  overwritten, the branch already holds committed artifacts for this slug and the copies on
  disk were written on another branch. Stop and report; the developer chooses which survive.
- If the commit fails (for example a pre-commit hook rejects it), stop and report its
  output. Do not run `implement` with an uncommitted approved spec. The spec on disk already
  reads `Final`, so Step 2 places the slug at implement and the next advance re-enters this
  step and retries the commit. That is not a divergence.

For every other stage (`triage`, `scope`, `spec`) and for `refine` re-runs that stay on
the same stage, do no git work here. Their artifacts stay untracked until this step commits
them.

### Step 4a — revision commits

From the spec commit on, the three artifacts are tracked on `<prefix>/<slug>`. Every later
edit to any of them is committed on its own, as soon as the orchestrator next has the tree,
and never amended:
`git add -- <specs_dir>/<slug>-triage.md <specs_dir>/<slug>-scope.md <specs_dir>/<slug>.md`,
then `git commit -m "docs(specs): revise <slug>: <what changed>"`. After a rework-after-ship
restore (Step 7) the three files are untracked again, so that commit re-adds all three and
uses the `docs(specs): add <slug> pipeline artifacts` subject, not `revise`. This covers an
inline refine (Step 1a), a structural refine's return (Step 6 item 2), a re-sync made by hand
or by a dev agent during implement (the implement committer never stages `<specs_dir>/`, so
such an edit sits on the tree until the next Step 4 pass or Step 7.1 commits it), and a
rework after ship (Step 7). Follow-up commits, never amends: phase commits may already sit on
top of the spec commit, and after ship the branch is pushed. A revision commit carries no
`Spec-Phase` trailer and is not an implementation commit.

## Step 5 — invoke, at most once

Issue **one** `Workflow({ name: "spec-pipeline", args })` call with the assembled
`args` (including `config`). Let it run to completion in the background. Do not issue
another call until it returns and you have reviewed it (Step 6). Chaining to the next stage
happens only through Step 6.6's gate, one call at a time.
The script's own caps bound how many agents a scope or spec stage spawns. The session's
workflow size guideline governs scripts you write, not this saved one, so do not shrink or
refuse a call to fit it.
An inline refine (Step 1a) skips this step entirely. The edit already happened in the
main loop, and there is nothing to invoke.

## Step 6 — review the return and surface open questions

When the workflow returns:

1. Report which artifact was written (`<specs_dir>/<slug>-*.md`) and a one-line summary
   of the stage's result:
   - at triage: the lane, or, when the return carries status "blocked" or the stage
     returned an `error`, the block or the malformation, per the rules below;
   - at scope: the `composition`. Report the partition count, the plan's `rationale`, and
     `agents_run`. Name every anchor in `unassigned_anchors` or `uncovered_anchors`;
   - at spec: the phase count, read from the spec file, and the `composition`. Report the
     partition count, `phases_planned`, the plan's `rationale`, and `agents_run`. Name every
     entry in `unassigned_anchors` or `uncovered_anchors`. An entry is a scope goal (`G<n>`),
     a closed scope question (`OQ<n>`), or `phase: <title>`. An uncovered anchor is one no
     drafter delivered in a phase or explained. An uncovered phase came back from no drafter,
     so the synthesizer wrote it from the plan's outline. The lists predate the revise rounds.
     The return's log lines name the lenses run and whether `coherence` was skipped; report both;
   - at implement: per-phase pass/fail and the architect's concerns;
   - at validate: per-suite results.

   An `error` that begins `invalid config:` or names a missing `args` field is an
   orchestration or configuration failure, not a stage result. Report it verbatim and stop.

   **The artifact is authoritative. The return is a report.** Before you act on any triage
   return, re-read the `**Status**:` frontmatter line of `<specs_dir>/<slug>-triage.md`. Then:
   - If the return carries an `error` and no `triage` object at all, the drafter died before
     writing. Report that and stop. There is no artifact to re-read.
   - Otherwise, if the return says `routed` while the file reads `Blocked`, or says `blocked`
     while the file reads `Draft`/`Decided`, it is a **divergent return**. Detect it only by
     comparing the file to the return. The workflow never sets a `status` for it: it still
     says `routed` or `blocked`, so do not look for the `"malformed"` value of the next
     paragraph here. Report the divergence. Carry nothing forward from the return. Do not
     advance. The file wins, because it is what the next stage and the next session read.

   **A blocked triage return** (`triage.status === "blocked"`, with the artifact confirming
   `**Status**: Blocked`) is a first-class outcome, not an error. Report it as one:
   - Name the section it blocked on (`triage.blocked_on`).
   - Quote `triage.blocked_reason`.
   - Say that no lane, architect, or branch prefix was chosen.
   - Say explicitly that the scope stage will not run until the block is resolved.

   Do not invent a lane. Do not pick a branch prefix. Do not offer to advance. Then surface
   the entries per Step 6.5 and stop.

   **A malformed triage return** (the stage returned an `error` string and `triage.status ===
   "malformed"`) is a drafter or schema failure: a `routed` return missing a routing field, or
   one whose architect or dev is not the chosen lane's own. It is not a triage decision and
   not a question for the developer. Never render it as a blocking entry. Never ask the
   developer to answer it. Report the error text. Say that the artifact on disk is
   authoritative. Before any later advance, recover `architect` and `branch_prefix` from the
   artifact per Step 3, not from the return. If the artifact itself is also ill-formed, re-run
   the stage.
2. Doc stages (`triage`/`scope`/`spec`) return a `critique` object: the critic's
   **final verdict on the artifact as written**. On a compose round it covers the full
   template audit, plus resolution of any issues it raised. For scope and spec, that audit
   is a merged verdict from parallel lens critics. Scope runs `template`, `fidelity:<partition
   id>` per partition (plus `fidelity:unassigned`), and `tree`. Spec runs a four-lens panel:
   - `template`: the upper sections, above the phases;
   - `phases:<partition id>`: one per partition, over that partition's phase blocks only, plus
     `phases:unassigned` for phases the plan assigned to no partition. This lens enforces the
     spec template's acceptance-criteria rule. A phase over the bullet cap that cannot be
     collapsed into named tests is a plan change: the lens raises it as an issue, the reviser
     never splits, merges, or renumbers phases, and the issue reaches your gate;
   - `fidelity:<partition id>`: one per partition, scope fidelity, plus `fidelity:unassigned`;
   - `coherence`: the seams between sections and between phases. It runs after the others and
     is skipped at one partition.

   Plain-JS checks on the lens indexes add issues prefixed `[check]`. Every merged issue is
   prefixed `[<lens>] `. A dead lens counts as an issue in it, never as clean: its `[<lens>]`
   fallback issue restates what it would have checked. When the `template` lens returns no
   `design_headings`, the Design-heading `[check]` is skipped for that round and the log says
   so; Step 3's grep still verifies every heading before implement. Any issue sends the
   merged verdict to the revise round(s) — one for `spec`, up to two for `scope` and
   `triage` — and the returned `critique` is then the scoped re-check of those issues. For
   scope and triage its issues are the re-check's own text, with no lens prefix. For spec the
   re-check is partitioned by lens, and each re-check's issues are re-prefixed with the lens
   they came from, so the prefixes survive the revise round. A spec still flagged after its
   one round is written but stops at the gate for you. On a `feedback` round it covers only
   whether the feedback points were addressed, because the full audit happened when the
   artifact was first composed. On a `feedback` round for a tracked artifact (one Step 4 has
   committed), commit the revised artifact per Step 4a after reporting the critique, whether
   or not `clean` is true: the verdict decides whether the gate advances, not whether the
   revision is recorded. Report it:
   - If `clean` is false, list the residual `issues` so the developer knows the artifact is
     written but still flagged.
   - If `critique` is `null`, say the verdict is unavailable (the critic agent died). Never
     imply clean.
   - If the stage returned an `error`, report it and stop. A malformed triage return carries
     an `error` *alongside* a written artifact, so say which is which.
3. The `implement` return carries `halted`. When non-null, it names the phase where the
   loop stopped (failed acceptance criteria, unsound architect review, a failed commit, or a
   dead agent).
   It means **later phases did not run**. Report the halted phase, its failing criteria
   and blocking concerns, and which phases remain. The developer decides whether to
   refine, rewind, or fix directly. This return is also the pass record that Step 3's
   re-entry slicing consults when the developer sends `implement` back in. Phases marked
   `passed: true` and `sound: true` are not resent.

   Four fields need care when reporting:

   - **`sound: null` means the architect review never ran.** Either the criteria check failed
     first and the workflow skipped the review, since the phase halts either way and the
     review re-runs against the repaired tree next time, or the dev agent died (the result
     then carries an `error`). Say "review not run". Never say anything that implies the
     architect found a problem. (`null` is falsy, so re-entry slicing re-sends the phase
     correctly without special handling.) A checker that claimed `passed` while one of its
     own criteria rows is unmet is overruled: the phase reads `passed: false`.
   - **Each entry in `criteria` carries a `deferred` flag.** `deferred: true` marks a
     deferred criterion. The criterion named a whole-suite run, and the checker substituted
     the narrowest selection covering the phase's files. The criterion's *global*
     no-regression claim is therefore unverified, and validate settles it. Report deferred
     criteria as a count with the phase's result ("3 criteria met, 1 deferred to validate").
     Never report them as failures. Never report them silently as plain passes. They are the
     reason validate is not optional.
   - **Each entry in `review.concerns` carries a `severity`** of `blocking` or
     `observation`, plus an `anchor` naming the spec section or invariant it implicates.
     Report the two kinds **separately**:
     - Blocking concerns are the halt reason. Put them up front.
     - Observations are true but do not halt the phase (adjacent defects, follow-up work,
       doc drift). Put them under their own heading, explicitly marked as not blocking.

     A passing phase typically carries a few observations. Do not let them read as
     failures. Do not drop them either. If a review set `sound: true` while listing
     a blocking concern, the workflow fails closed and halts anyway. Report it as the
     contradiction it is.
   - **Each phase that passed review carries `commit`**: `committed`, `sha`, `subject`,
     `trailer`, `unexpected`, and `error`. Report each phase's short SHA and subject with its
     result.
     `committed: false` with no `error` means the phase left nothing to stage. Report that,
     but it is not a failure. List any `unexpected` paths (staged paths the phase scope does not
     name). They are already in the commit, and the developer decides whether they belong.
     A halt with `error` set on a passed, sound phase means the commit failed, usually a
     pre-commit hook. The phase's work is reviewed but uncommitted on the tree. Report the
     hook output. The developer fixes the complaint, and then you commit the phase by hand,
     staging with `git add -A -- . ':(exclude)<specs_dir>'` and committing with
     `git commit -F <message file> --trailer 'Spec-Phase: <slug> / <title>'` (write no
     `Spec-Phase` line in the message itself). Do not resend that phase. Re-entry slicing
     starts at the phase after it.
     A halt whose `error` says the phase was committed but git parses its `Spec-Phase` trailer
     as something else means the work is committed but the pass record is missing. Before any
     other commit, while that commit is still the branch tip, run
     `git commit --amend --no-edit --trailer 'Spec-Phase: <slug> / <title>'`. Do not resend
     that phase either.
     After either repair, confirm that
     `git log -1 --format='%(trailers:key=Spec-Phase,valueonly)' HEAD` prints
     `<slug> / <title>`. Inside the single quotes, write each `'` in the title as `'\''`.
4. The `validate` return carries `validation.passed` plus per-suite results. If it
   failed, report each suite's failures. Do not treat the workstream as shippable. The
   workflow fails closed: a configured suite with no passing report counts as failed even
   when the validate agent claimed `passed: true`.
5. If the stage's `open_questions` array is non-empty, surface the questions to the developer
   via **`AskUserQuestion`**. Each entry arrives as `{ question, context, options[], recommended? }`.
   The stage already wrote the plain-language framing, so **render, do not rewrite**:

   - **`question` field** = the entry's `context` paragraph verbatim, then a blank line, then
     its `question` sentence. `AskUserQuestion` has no separate context slot. `header` (12
     chars) and `options[].description` (per-option) are both too small to hold the paragraph,
     so the lead paragraph is the only place it fits. Do not compress, re-jargon, or "tighten"
     the paragraph. It is the part the developer reads instead of parsing the artifact.
   - **`options[]`** = the entry's options mapped straight through (`label`, `description`).
     If `recommended` is present, list that option **first**. Append ` (Recommended)` to
     its label. The ` (Recommended)` suffix is a display affordance only. When you record the
     developer's pick per Step 1a, strip it and write the label exactly as it appears in the
     entry's own Options list.
   - **`header`** = a 12-char chip you derive (the stage does not supply one).
   - **An answer off the list is expected, not an error.** The stage enumerated the readings
     it could see; the developer may know one it could not, or may defer. Do not map such an
     answer onto the nearest option and do not re-ask. Record it in the template's off-list
     `Selected` form (Step 1a, item 2) and classify it per Step 1a: inline when it closes the
     entry without invalidating a section, structural when it introduces a mechanism or amends
     a settled decision the artifact builds on.
   - If `context` is missing or empty on an entry, that is a schema violation and should not
     happen. Say so plainly. Do not paper over it with a paragraph you invent from the
     artifact. The framing you'd reconstruct is not the one the stage had.

   `AskUserQuestion` takes at most 4 questions per call. When a stage returns more, ask the
   first 4, then ask the rest in a follow-up call after those land. Never drop the tail
   silently. Never merge two decisions into one question to fit.

   Apply the developer's answers per Step 1a. A decision selection is almost always an
   **inline edit** to the artifact (close the Open Questions entry, record the decision in the
   section it affects). Pass answers as `feedback` only when one forces structural rework. Use
   the decision-record form for the stage you are editing: triage's `## OUTPUT` form, or
   scope's or spec's `## Open Questions` closed-entry form. All are defined in their templates
   (Step 1a). None invents a new section.

   **Blocking entries** arrive in `open_questions` alongside ordinary ones. They are marked
   by a literal prefix: the `question` string of a `B` entry copied from the artifact begins
   with `Blocking - `. Strip that marker when you render the question sentence. Instead,
   prefix the lead paragraph with `Blocking - triage cannot route until this is decided.` so
   the developer knows the answer restarts the stage rather than closing a line item. An entry
   without the marker is an ordinary `**Open**` entry, whatever `triage.status` says. A blocked
   triage may raise ordinary residual decisions in the same array.

   Applying an answer is Step 1a's inline path for ordinary entries and Step 1a's structural
   path for marked blocking ones - see the two recipes there.

   For reference, the three sentences a stage writes when it surfaced no questions are,
   byte for byte: triage `No open questions - scoping may begin.` (plain hyphen), scope
   `No open questions — spec drafting may begin.` and spec
   `No open questions — implementation may begin.` (em dash). Never "fix" one to match another.
6. **Auto-advance gate.** After reporting (items 1–4), advance automatically to the next
   stage when **every** condition below holds. Otherwise **stop** and let the developer steer.
   The stage order is `triage` → `scope` → `spec` → `implement` → `validate` → ship.

   | Stage just returned | Advance only if |
   |---------------------|-----------------|
   | any | no `error`; no divergent return (item 1); `open_questions` is empty |
   | `triage` | the artifact is not `Blocked` or malformed, and its `**Status**` reads `Decided` — no `**Open**` entry remains (Step 2, rule 8) |
   | `triage` / `scope` / `spec` | `critique` is non-null and `clean: true` — residual critic issues need the developer to judge them |
   | `scope` / `spec` | `composition.unassigned_anchors` and `composition.uncovered_anchors` are empty, or `critique` is non-null and `clean: true` — every listed anchor reached the lens critics, so only a clean final verdict shows it landed; otherwise it is a commitment that may have been dropped |
   | `implement` | `halted` is null |
   | `validate` | `validation.passed` is true — then run ship (Step 7) |

   A clear gate on a `spec` return is the spec's approval. The advance recipe below then runs
   Step 4, which marks the spec Final and commits the three artifacts on `<prefix>/<slug>`
   before the `implement` call. The developer's **advance** on a spec the gate stopped on (an
   unclean critique, a listed anchor) is the same approval, given by hand.

   To advance:
   - Assemble the next stage's `args` exactly as an **advance** intent would: `config`,
     Step 3's carried-forward fields, `phases` reconstructed from disk, and, when the next
     stage is `implement`, Step 4's spec approval (branch, Final, commit) and its guards.
   - Announce in one line that you are advancing and why (e.g. "No open questions —
     advancing to `scope`.").
   - Invoke it per Step 5.

   Any Step 4 guard that stops (dirty tree, refused checkout, missing spec, failed commit)
   stops the chain too.

   When the gate stops on `open_questions` and the developer answers them (item 5), apply the
   answers. Then re-check the gate **against the artifact on disk**. If every entry is now
   closed and no answer forced a structural re-run, resume auto-advance from that stage. If an
   answer was structural, the `feedback` re-run's return goes through this gate like any other.

   When the gate stops for any other reason (an error, a block, a halt, a failed validate,
   an unclean critique), report it and **stop**. The developer then does one of these:
   - **advances**: the chain resumes from the next stage;
   - **refines** per Step 1a: an inline edit you apply directly, or a structural
     re-invocation of the same stage with that round's notes as `feedback`;
   - **rewinds**.

   An inline refine that the developer initiates does not by itself resume the chain.
   Wait for **advance**.

## Step 7 — ship (advance past validate)

After `implement` returns, the next advance (automatic per Step 6.6, or the developer's
**advance**) runs the `validate` stage (Step 2 rule 4), the full-suite regression gate.
Ship only after a `validate` return with `passed: true` and no code changes since. Ship
when that return clears the gate, or when the developer says **advance** and Step 2 puts
the slug at **ship** (Step 2 rule 3). To ship, commit, push, and open the PR yourself in
the main loop. There is no workflow stage past validate:

1. **Leftover commits.** The implement stage committed each phase, and Step 4 committed the
   artifacts. Anything still on the tree came after: a direct fix after a failed validate, or
   an artifact re-sync. Commit the code first, on its own:
   `git add -A -- . ':(exclude)<specs_dir>'`, then `git commit -m "<concise message>"` if
   anything was staged. Never `git add -A` over `<specs_dir>/`: another workstream's
   uncommitted artifacts would ride along into this PR. Then commit any artifact revision
   still on the tree per Step 4a. (If this slug's artifacts are still untracked here — a run
   begun before Step 4 committed them — run Step 4's commit now instead.) Record
   `git rev-parse HEAD` as `<spec-sha>`: the branch tip whose tree holds the artifacts' final
   text, and the parent of step 4's removal commit. A permalink to the first spec commit
   would point at text later revision commits superseded.
2. `git push -u <remote> <prefix>/<slug>`
3. `gh pr create --base <base>` — the body names the project (`config.project.name`) and the
   slug, and links the spec:
   - when `<remove_after_pr>` is true, by SHA permalink,
     `<repo-url>/blob/<spec-sha>/<specs_dir>/<slug>.md` (`<repo-url>` from
     `gh repo view --json url -q .url`). Never link it by branch path, because step 4 deletes
     the file from the branch tip;
   - when `<remove_after_pr>` is false, by branch path,
     `<repo-url>/blob/<prefix>/<slug>/<specs_dir>/<slug>.md`, since the artifacts stay on the
     branch and merge with the PR.

   The body also summarizes:
   - the per-phase acceptance results, each with its phase commit's short SHA, with deferred
     criteria counted;
   - the architect **observations** carried on the passing phases of the implement return,
     with their anchors (a PR reviewer is the right audience for them, where a developer
     deciding whether to advance was not);
   - the validate stage's per-suite results.

   No blocking concern can reach this step: any phase carrying one halted.
4. **Spec removal commit** (only when `<remove_after_pr>` is true; skip this step otherwise).
   Run it only after the PR exists, so a failure at steps 2–3 leaves the artifacts in place
   and Step 2 (rules 3–4) can still place the slug at ship. Remove exactly this slug's three
   artifacts. Never glob `<specs_dir>/*`, which holds the templates and other workstreams'
   artifacts:
   `git rm <specs_dir>/<slug>-triage.md <specs_dir>/<slug>-scope.md <specs_dir>/<slug>.md`,
   `git commit -m "chore(specs): remove <slug> pipeline artifacts"`, `git push`. The
   artifacts remain reachable in history through `<spec-sha>` once the PR merges. This
   relies on merge commits; a squash merge would drop `<spec-sha>` from `<base>`'s history.
   A repository that squash-merges sets `ship.remove_artifacts_after_pr` to `false` instead.

The branch therefore reads: the spec commit, one commit per implement phase with revision
commits wherever an artifact was edited, any ship-time leftovers, then (when
`<remove_after_pr>` is true) the `chore(specs):` removal commit, which is the last commit on
the branch. Nothing else commits under `<specs_dir>/`.

If validate failed, do not ship. Surface the failures (Step 6) and stop. The developer
decides whether to rewind to implement, refine, or fix directly. Any fix means validate
must pass again before ship.

Then report the PR URL and stop. Doing the commit, push, and PR directly (rather than
through a generic helper) lets the PR body carry the implement and validate results. If a
PR for the branch already exists, report its URL instead of opening a second one. If
`<remove_after_pr>` is true and this slug's artifacts are still on the branch tip, run
step 4 before stopping.

**Rework after ship.** When `<remove_after_pr>` is true, once step 4 lands the artifacts
are gone from the branch tip, and Step 3 reconstructs `phases` from `<specs_dir>/<slug>.md`.
Before any `rewind` or `refine` on a shipped slug, restore them from the pre-removal tip:
`git restore --source=<spec-sha> -- <specs_dir>/<slug>-triage.md <specs_dir>/<slug>-scope.md <specs_dir>/<slug>.md`
(recover `<spec-sha>` from the PR body's permalink, or as the parent of the removal
commit — the newest one, after an earlier rework). `git restore` writes the working tree
only, so the restored files are untracked again, and the implement committer's
`<specs_dir>` exclusion keeps them out of phase commits. A rework that re-runs `implement`
commits its phases itself. After validate passes again, commit any direct fix still on the
tree with Step 7.1's code `git add` only, push to the existing PR, and delete the restored
files from the working tree. If the rework changed an artifact, instead commit the changed
artifacts on their own in Step 4a's form, push, run step 4 again, and update the PR body's
permalinks to the new `<spec-sha>` (the parent of the new removal commit;
`gh pr edit <n> --body-file`), so the revision is recorded in history and the PR points at
it before it is removed.
When `<remove_after_pr>` is false, the artifacts are still on the branch: rework edits them
in place and commits each artifact revision per Step 4a.

## Guardrails

- Never ask the developer to type or confirm a JSON `args` block — assemble it yourself.
- Pass `config` on every Workflow call, read fresh from `.claude/spec-pipeline.json` (Step 0).
- Never run two stages concurrently.
- Never advance past a return you have not reviewed.
- Auto-advance only through Step 6.6's gate. Anything needing the developer stops the chain.
- Work on the `<prefix>/<slug>` branch (`<prefix>` one of `<prefixes>`, per triage).
- Use no git worktrees and no `git stash` (the pipeline's own guardrail: one working tree).
- Do not edit any `<agents_dir>/*.md`, `<rules_dir>/*.md`, `.claude/settings.json`, or
  `.claude/spec-pipeline.json`; the workflow reuses them unchanged.
