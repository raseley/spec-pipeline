# Design principles

The pipeline encodes a set of lessons learned the hard way on a real codebase. Each principle below states
the rule, **why** it exists, and the **mechanism** that enforces it (a schema, a prompt, a command step, or
git). When you change the pipeline, keep the mechanism; a principle without one decays into a suggestion.

Terms: the **command** is `.claude/commands/spec-pipeline.md` (the orchestrator), the **script** is
`.claude/workflows/spec-pipeline.js` (the Dynamic Workflow), and an **artifact** is one of a workstream's
`<specs_dir>/<slug>-triage.md`, `<slug>-scope.md`, or `<slug>.md`.

---

### 1. State lives in git-tracked artifacts and is re-derived every time

**Why.** A pipeline that keeps its state in a process dies with the process. Sessions end, contexts
compact, machines reboot. If the only record of "we are at implement, phase 3" is a conversation, a new
session has to guess.

**Mechanism.** The next stage is never stored. Command Step 2 derives it from which artifacts exist, the
spec's `**Status**:` line, the branch, and `gh pr` state. Command Step 3 recovers `architect` from the triage
artifact's `**Lane**:` line and `branch_prefix` from its `**Branch**:` line. After `/resume`, `advance` just
works.

### 2. One stage per call, strictly in sequence; the orchestrator is the only place to steer

**Why.** A workflow cannot prompt a human mid-run (`AskUserQuestion` is a main-loop tool). A script that runs
all five stages back to back would guess past every decision it hits. One stage per call gives a human a
place to stand between every pair of stages.

**Mechanism.** The script branches on `args.stage` and returns after exactly one stage. The command issues
one `Workflow` call at a time and never issues the next before reviewing the previous return.

### 3. Auto-advance runs through an explicit gate and stops on anything that needs a human

**Why.** Stopping after every stage is tedious; never stopping is reckless. The gate makes "nothing needs
you" a checkable condition instead of a judgment call.

**Mechanism.** Command Step 6.6's gate table: no error, no divergent return, empty `open_questions`; triage
not `Blocked` or malformed and `Decided`; a non-null, clean critique for document stages; `halted` null for
implement; `validation.passed` for validate. Any Step 4 guard that stops (dirty tree, missing spec) stops
the chain too.

### 4. The artifact is the authority; the return is a report

**Why.** A workflow return can disagree with the file it describes (a drafter that says "routed" but wrote
"Blocked"). The next stage and the next session read the file, not the return. Acting on the return would
diverge from what everyone else sees.

**Mechanism.** Before acting on any triage return, the command re-reads the artifact's `**Status**:` line.
A mismatch is a **divergent return**: reported, nothing carried forward, no advance. The script's `STATUS`
contract tells drafters and revisers to read the status off the file they wrote.

### 5. Open questions are a first-class channel

**Why.** An agent that cannot decide something will otherwise pick an answer silently. Questions are only
useful if a human can answer them quickly, which means plain language, enumerated choices, and no need to
open the artifact. Paraphrasing at render time loses the reasoning, because only the stage that raised the
question still holds it.

**Mechanism.** The `OQ` schema requires `question`, `context`, and 2-4 `options` (a schema bound, so a
violation forces a retry). `OQ_GUIDANCE` defines the plain-language rule for `context`. The `MIRRORING`
contract makes the return a verbatim copy of the artifact's question section. The command renders
`context` verbatim, lists the recommended option first, and records closures in the template's own
closed-entry shape, keeping **Context** and **Options** verbatim so the closure is a reviewable diff.

### 6. Rules go in the schema where possible; otherwise descriptions plus fail-closed checks

**Why.** A rule in prose tends to be ignored in a long prompt. A schema violation is retried by the
platform. Where a schema cannot express a rule, a description reaches the model and a check in the script
catches what slips through.

**Mechanism.** Option counts (2-4), required `context`, closed enums for lane/architect/dev/prefix built at
runtime from the config. Top-level `oneOf`/`anyOf`/`allOf` is rejected by the API, so triage's routed/blocked
split lives in field descriptions, and the script reports a `routed` return missing a routing field as
`malformed`.

### 7. Draft, one full audit, narrow re-checks, capped

**Why.** A fresh critic on every round finds fresh nitpicks and the loop never ends. Re-checking only the
issues already raised lets it terminate as soon as they are fixed. A structural feedback round has already
passed a full audit once; redrafting would waste it.

**Mechanism.** `refine()`: compose = draft, one full adversarial audit, at most two rounds of revise plus a
scoped re-check. Feedback = one reviser plus one critic checking only the feedback points. The critique
returned is the one after the last write. A `null` critique means the critic died: the command reports
"verdict unavailable", never clean, and the gate stops. Scope and spec build their own draft and audit
(principle 8) and then hand both to the same `reviseLoop()`, so a large composition is revised and
re-checked exactly as a small one is.

### 8. Large documents are planned, partitioned, and checked for coverage

**Why.** One drafter holding a large source writes the whole artifact from one context and drops
commitments without saying so, and a single template critic never checks fidelity to the source. A dropped
goal surfaces only phases later, as a gap in the implementation.

**Mechanism.** Scope and spec open with a plan agent that lists the source's enumerable commitments as
**anchors** (a decision-register ID or section id for scope; `G<n>` per scope goal for spec) and assigns each
to exactly one of 1-6 partitions, sized to the source. The spec plan also fixes the phase outline, the core
principle, and every interface two partitions must agree on, because parallel drafters see only the plan.
Drafters return fragments, never the file (parallel writers to one file lose each other's updates), and
every fragment item lists the anchors it serves. Plain JavaScript computes unassigned, duplicated, and
uncovered anchors and missing or stray phases; each becomes a known gap handed to the synthesizer and the
critics, and is reported in the return's `composition`. One synthesizer writes the artifact, and parallel
lens critics audit it; a dead lens is an issue, never clean. The gate stops when an anchor was listed as a
gap and the final verdict is not clean. A dead plan agent ends the stage with an error rather than drafting
without anchors. Caps (`MAX_SCOPE_PARTITIONS`, `MAX_SPEC_PARTITIONS`) bound the agent count; a source with
more divisions gets coarser partitions, never dropped ones.

### 9. Inline vs structural refine

**Why.** Most feedback is selecting an option or fixing a word. Spinning up a reviser and a critic for a
two-line edit costs minutes and tokens and invites unrelated rewrites.

**Mechanism.** Command Step 1a classifies every refine. Inline edits are applied directly with no workflow
call, following an eight-rule recording procedure. Only cascading changes (lane, change type, goals,
non-goals, design, phase decomposition, answers to unfillable ORDER/VALIDATE entries, any blocking answer)
go back as `feedback`. When unsure, inline.

### 10. A blocked triage is a result; a malformed return is never turned into a question

**Why.** "This is two workstreams" or "the premise is false" is a valuable finding, and forcing a lane onto
it poisons every later stage. Conversely, a schema failure is not something a human can answer; asking
them to would waste their time and hide a bug.

**Mechanism.** The triage template's blocking unfillable forms, Status `Blocked`, Lane `unresolved`, and
`B<n>` entries. The command refuses `advance` on a blocked slug and routes any answer to a structural
re-run. The script's malformed path returns an `error` alongside the artifact and carries no question.

### 11. Claims in the idea are checked against the code

**Why.** An idea often carries a wrong premise ("the endpoint already validates this"). Carrying it forward
builds a spec on sand.

**Mechanism.** Triage ORDER step 1 records every claim as surviving (with `path:line`), falsified (with the
citation), or non-resolving. Falsifying the premise is a valid outcome and can block triage.

### 12. The on-disk spec is the single source of truth for implement

**Why.** If implement ran from the spec stage's return, every inline edit and refine round after it would
silently be ignored.

**Mechanism.** The spec stage returns no phases array. Command Step 3 rebuilds `phases` from the spec file's
`### Phase N:` headings, `**Agent routing**:` lines, `#### Scope`, and `#### Acceptance Criteria` on every
implement call.

### 13. Spend the top tier where defects are expensive

**Why.** A subtle spec defect costs a halted phase, a repair, and a re-run per phase it touches. A critique is
a checklist; a suite run is mechanical. Uniform tiers either overspend or underperform.

**Mechanism.** `models.spec` defaults to the top tier, and the spec's plan, partition drafters, synthesizer,
and reviser all share it; critics, checker, and review default to `opus`; the per-phase committer and validate
to `sonnet`. Every `agent()` call sets `model` explicitly, so nothing inherits the session model or an agent's
frontmatter. Escalation (`implModel`) is set only when the developer asks, for one run.

### 14. Each phase block is written for its narrowest reader

**Why.** The criteria checker receives `#### Acceptance Criteria` and nothing else, and its verdict halts
every later phase. A criterion that says "the new field" or "per Phase 2" forces a guess.

**Mechanism.** The spec template's phase rules and Part A self-check ("acceptance criteria stand alone",
"scope enumerates paths"); the spec critic's ORDER step 3; the drafter's VALIDATE step; and, on every
compose round, a narrowest-reader lens critic per partition that extracts only that partition's phase blocks
and judges each as if the rest of the spec did not exist.

### 15. Verification is split: evidence first, judgment second

**Why.** The person who wrote the code is the worst judge of it. Evidence (tests run, files read) does not
depend on the implementer's blind spots; design fit and invariant adherence need judgment that tests cannot
give. Running an expensive review on a tree already known to fail wastes it.

**Mechanism.** Per phase: a criteria checker on `models.check` first; the lane architect's review only if it
passes. Review concerns are `blocking` or `observation` and must carry an `anchor`; unanchored concerns are
dropped. Observations travel to the PR body.

### 16. Targeted tests per phase; whole-suite claims deferred to validate

**Why.** A spec that names the whole suite in every phase turns an N-phase implement into about 2N full runs
(the dev self-verifies, then the checker re-runs), for no signal the single validate run would not produce.

**Mechanism.** `SCOPED_TESTS` (built from config) in the dev and checker prompts; the spec template and spec
critic reject whole-suite criteria; the checker substitutes a narrow selection and marks such criteria
`deferred: true`; validate runs every `suites[]` command once.

### 17. Halt at the first failing phase; re-enter with only what has not passed

**Why.** Phases are dependency-ordered, so a failed phase breaks every later one. Re-running a passed phase
rewrites work already on the tree.

**Mechanism.** The implement loop breaks at the first unmet criteria check, unsound review, failed commit, or
dead agent and returns `halted`. Every phase that passes is committed before the next starts, with a
`Spec-Phase: <slug> / <title>` trailer, so a halted phase's work is the only uncommitted work on the tree.
The command slices re-entry to the unpassed suffix; a pass is void once the phase's spec text changed; after
`/resume` it reads the pass record from the trailers in `git log <base>..HEAD` rather than guessing.

### 18. Fail closed everywhere

**Why.** Every "unknown" that is treated as "fine" eventually ships a defect.

**Mechanism.** A `null` agent result is failure. A review that sets `sound: true` while listing a blocking
concern is unsound. A checker whose `passed` disagrees with its own criteria rows is not trusted. A validate
`passed` that disagrees with its per-suite rows, or reports fewer suites than configured, is not trusted.
`sound: null` means "review not run", never "found a problem" and never "clean".

### 19. One working tree; dev agents never touch git state

**Why.** Worktrees and stashes hide changes from the agents that verify them, and a dev agent switching
branches mid-phase corrupts the run.

**Mechanism.** Dev prompts forbid staging, committing, branch operations, worktrees, and `git stash`. Only two
parties write git state: the command, and the implement stage's per-phase committer, which commits a phase
only after its checker and review pass, never amends or bypasses hooks, and never edits source to satisfy a
hook (that would bypass the review). The command creates the branch at Step 4 and refuses to proceed on a dirty tree that blocks checkout. Adopters enforce it twice: a
steering anti-pattern and a `permissions.deny` entry.

### 20. Ship keeps the record and cleans the tree

**Why.** The artifacts are the "why" behind a change and belong in history. Left on the base branch they
accumulate into clutter that future agents read as current intent.

**Mechanism.** The implementation is already committed phase by phase. Ship commits any later fix on its own,
then exactly this slug's three artifacts in a commit of their own, links the spec by that commit's SHA
permalink, opens the PR, and only then commits their removal (`chore(specs): remove <slug> pipeline
artifacts`). This relies on merge commits; `ship.remove_artifacts_after_pr: false` keeps the artifacts for
squash-merge repositories.

### 21. The developer never types JSON or confirms a slug

**Why.** Every structured field the developer has to supply is a chance to get it wrong and a reason not to
use the tool.

**Mechanism.** The command assembles `args` from prose. Of its ten fields the developer supplies only
`idea` and `feedback`; `config` comes from the file, `date` from the session, `slug` is chosen and
announced, everything else is carried forward or recovered from disk.

### 22. Prompts follow a fixed frame

**Why.** A fixed frame makes every prompt reviewable the same way and makes omissions visible: a prompt with
no VALIDATE step has no independent cross-check.

**Mechanism.** Every agent prompt in the script follows `AS.` (role), `OBSERVE.` (evidence), `CONSIDERING.`
(constraints and sources), `ORDER.` (ordered reasoning), `VALIDATE.` (an independent cross-check), `OUTPUT.`
(the exact output). The triage artifact itself uses the same six sections, a frame taken from "The Geometry
of Intent".
