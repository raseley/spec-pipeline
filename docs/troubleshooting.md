# Troubleshooting

Symptoms first, then cause and fix.

### "spec-pipeline is not configured: `.claude/spec-pipeline.json` is missing/invalid"

The command reads the config at Step 0 of every invocation and refuses to guess. Create it (see
[`ADOPT.md`](../ADOPT.md) Step 4) or fix the JSON (`python3 -m json.tool .claude/spec-pipeline.json`).

### `error: "invalid config: <reason>"`

The script validated the config and rejected it before running anything. Common reasons: `version` is not
`1`; a lane is missing `name`, `description`, `architect`, `dev`, `targeted_tests`, or `paths`; two lanes share
a name; `suites` is empty; a `timeout_ms` is outside 1-1800000; `git.branch_prefixes` is empty; a `models`
value is empty. Run `bash <spec-pipeline checkout>/scripts/verify-adoption.sh` for a full check.

### The command or workflow is not found

Commands and workflows are discovered at session start. Start a new Claude Code session after installing.
Confirm the files are at `.claude/commands/spec-pipeline.md` and `.claude/workflows/spec-pipeline.js`, and
that the script's `meta.name` is `spec-pipeline`.

### "draft agent returned no result" (or "plan agent returned no result", or "implementation agent returned no result")

`agent()` returned `null`: the subagent was skipped or died on a terminal API error. Usual causes:

- **A model tier your account cannot use.** Change `models.*` (for example `spec` and `escalation` to
  `opus`) or ask for "run this stage on opus".
- **An agent name that does not resolve.** Every name in the config must be `<agents_dir>/<name>.md` with
  `name: <name>` in its frontmatter, or `general-purpose`.
- **A schema the API rejects** (see the next entry).

Nothing was written for a dead drafter or a dead scope or spec plan agent; re-run the stage after fixing the
cause. A single dead partition drafter does not end the stage: its anchors become known gaps that the
synthesizer lands and the critics check, and the return lists them under `composition.uncovered_anchors`.

### Scope or spec reports unassigned or uncovered anchors

The plan left a commitment in no partition, or no drafter covered it. The synthesizer was told to land each
one, and the lens critics checked it. If the final critique is clean, the gate still advances. If it is not,
check each named anchor in the artifact and `refine:` where one was dropped. Persistent gaps on a very large
source usually mean the plan hit its 6-partition cap; split the workstream at triage.

### A scope or spec run spawned many agents

That is by design for a large source: up to 6 drafters plus one lens critic per partition (two for spec: a
`phases` and a `fidelity` lens, beside one `template` and one `coherence` lens), capped by the script itself. The `composition` line reports `agents_run`. A small change plans one partition and runs a
handful of agents.

### Implement halted with "phase passed but its commit failed"

The phase passed its checker and review, but `git commit` failed, almost always on a pre-commit hook. The
committer never edits source or passes `--no-verify`, because that would bypass the review. Fix what the hook
reported; the orchestrator then commits the phase by hand (`git add -A -- . ':(exclude)<specs_dir>'` and a
`Spec-Phase: <slug> / <title>` trailer) and `advance` continues from the next phase.

### `input_schema does not support oneOf, allOf, or anyOf at the top level`

Someone added a top-level `oneOf`/`anyOf`/`allOf` to a schema in the workflow script. The API rejects it at
tool registration, the agent never starts, and the stage reports "draft agent returned no result". Express the
split in `description` strings and enforce it in the script, as triage's `status` field does.

### Triage is "malformed"

A `routed` return was missing `lane`, `architect`, `dev`, or `branch_prefix`, or its architect did not belong to
its lane. That is a drafter or schema failure, not a decision for you, and it never becomes a question. The
artifact on disk is authoritative: if its `**Lane**:` and `**Branch**:` lines are good, `advance` recovers
routing from them; otherwise re-run triage.

### "divergent return"

The triage return said `routed` while the file reads `Blocked`, or the reverse. The orchestrator carries
nothing forward and does not advance. Read the artifact; it wins. Fix it with a refine, or re-run triage.

### Triage is `Blocked`

Not an error: triage declined to route (two workstreams in one idea, a falsified premise, or a lane only a human
can choose). Answer its `B` questions. Your answer always re-runs triage, which rewrites the frontmatter out
of the blocked state. Do not hand-edit `**Status**`, `**Lane**`, or `**Branch**` out of `Blocked`.

### `advance` keeps stopping at scope with open entries

Triage reads `**Status**: Draft`: at least one `**Open**` entry remains. The scope agent cannot close them.
Answer them (the orchestrator closes them inline and flips the triage to `Decided`), then advance.

### A rule "was not applied"

Path-scoped rules load only when the Read tool opens a matching file: not through Bash (`cat`, `grep`,
`sed -n`), not when a new matching file is created, and after `/compact` only on the next matching Read. The
pipeline tells its spec drafter, spec critic, and reviewer to open matching rules by name, so a rule they
missed is usually one whose `paths:` globs do not match, or one that is not in `rules_dir`. If a session mode
discourages the Read tool, rules disappear almost entirely; look at the mode before the frontmatter.

### Implement ran the whole test suite in a phase

The forbidden list comes from `suites[].command` plus `whole_suite_patterns`. Add the phrasing the agent used
to `whole_suite_patterns`. If the spec's acceptance criteria named a whole-suite run, the spec critic should
have flagged it; tighten the criterion so it names targeted tests.

### A phase halted with "review not run"

`sound: null`: the criteria check failed, so the review was skipped deliberately (the phase halts either way,
and the review re-runs on the repaired tree). Look at the unmet criteria.

### A phase halted although the review said `sound: true`

The review listed a blocking concern while claiming soundness. The script fails closed on that contradiction.
Read the blocking concern.

### Validate times out or is cut off

A suite longer than 10 minutes must have `timeout_ms` above 600000 so the validate agent runs it in the
background. The hard cap is 1800000 (30 minutes); a longer suite must be split into several `suites[]` entries.

### Validate reports failures that were there before

Validate reports what it observes and fixes nothing. Pre-existing failures will keep blocking ship until they
are fixed or excluded through the runner's own configuration. Do not add exclusion flags to `suites[].command`
that a fresh run would not use.

### "git refused the checkout" when entering implement

Uncommitted changes conflict with checking out the base branch. Commit or discard them, then `advance`. The
pipeline never stashes. If instead git refuses to check out `<prefix>/<slug>` because untracked artifacts
would be overwritten, that branch already holds committed artifacts for this slug and the copies on disk
were written elsewhere; decide which copy survives, remove the other, then `advance`.

### The spec commit failed at approval

Usually a pre-commit hook. The spec already reads `Final` on disk, so the slug stays at implement and the
next `advance` retries the commit; implement does not start until it lands. Fix the hook's complaint first.

### My artifacts disappeared after switching branches

After approval they are tracked on `<prefix>/<slug>`, so they are on disk only with that branch checked
out. Say `advance` (the orchestrator finds the PR or the branch from the slug) or check the branch out.

### Implement stopped: a Design heading does not resolve

A phase's `**Design**:` line names a heading that is not a `### ` subsection of `## Proposed Design`,
usually after a hand-edit renamed one. Fix the heading or the line (`refine:` inline), then `advance`. The
phase was not sent.

### The spec stopped at the gate with issues after one revise round

The spec gets one revise round by design; what it leaves flagged is yours to judge. Each issue names its lens.
`advance` approves the spec as written; `refine:` addresses the issues first. An issue saying a phase needs
a split is a plan change no revise round makes: refine with the split you want.

### We squash-merge and the spec permalink is dead

A squash merge drops the spec commit the permalink points at. Either enable merge commits or set
`ship.remove_artifacts_after_pr: false` so the artifacts merge with the PR.

### The PR body links a spec path that 404s

With `remove_artifacts_after_pr: true` the PR must link by SHA permalink, because the removal commit deletes
the file from the branch tip. If you see a branch-path link with removal enabled, the command deviated; edit
the PR body to `<repo-url>/blob/<spec-sha>/<specs_dir>/<slug>.md`, where `<spec-sha>` is the parent of the
newest removal commit.

### `gh` errors during stage derivation or ship

Run `gh auth status` in the same shell. Without `gh`, everything up to validate works; ship does not.

### The model tier "fable" is not available

Set `models.spec` and `models.escalation` to `opus` (or another tier you have). Nothing else changes.

### Open questions show up with no context paragraph

`context` is required by the schema, so this indicates a schema violation. The orchestrator says so plainly
instead of inventing a paragraph. Re-run the stage.

### After `/resume`, where am I?

Say `advance`. The orchestrator re-derives the stage from the files, the branch, and `gh`, and recovers the
architect and branch prefix from the triage artifact. After an implement halt, it reads the `Spec-Phase`
trailers in `git log <base>..HEAD` to find the first phase that has not passed rather than guessing.
