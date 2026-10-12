# ADOPT.md: installing spec-pipeline into a repository

**Audience: you, the coding agent.** A human has asked you to adopt this project into their software
repository. This file is your procedure. Execute it top to bottom. Each step ends with a **Done when**
gate; do not start the next step until the gate holds.

## Step 0: Read this first

- **Two locations.** `$SP` is a checkout of this spec-pipeline repository. `$REPO` is the root of the
  human's repository (the one you are installing into). If you only have a URL, clone it outside `$REPO`:
  `git clone https://github.com/raseley/spec-pipeline "$SCRATCH/spec-pipeline"` (use your scratch or temp
  directory) and set `$SP` to that path. Never clone it inside `$REPO`.
- **Ask only at steps marked ASK.** Derive everything else from the repository. When you ask, propose a
  concrete answer derived from evidence and let the human confirm or correct it. Batch questions: use
  `AskUserQuestion` (at most 4 questions per call) or one concise message.
- **Do not run the pipeline** during adoption, except the single triage dry run in Step 9, and only after
  the human allows it.
- **Do not commit, push, or open a PR** unless the human asks. Leave every change in the working tree and
  list it in the final report.
- **Never overwrite** an existing file the human owns (`README.md`, `CLAUDE.md`, `AGENTS.md`,
  `.claude/settings.json`, existing agents or rules). Merge into it, or ask.
- **Read before you write.** Read `$SP/README.md` (overview), `$SP/docs/configuration.md` (every config
  key), and skim `$SP/docs/steering.md`. Consult `$SP/docs/contracts.md` before touching any template text
  outside an `<!-- ADOPT: -->` slot.
- **Never rename the coupled literals** (section headings, frontmatter keys, the no-questions sentences,
  status tokens). They are matched by the command and the workflow script. `docs/contracts.md` lists them.
- **Examples in `$SP` describe a fictional project, "Orderly"** (lanes `api` and `web`). Every Orderly path,
  agent, invariant, and command you copy must be replaced with this repository's real equivalent.

**Done when:** `$SP` and `$REPO` are set, `$SP/payload/.claude/workflows/spec-pipeline.js` exists, and you
have read the three docs above.

## Step 1: Preflight

Run these from `$REPO` and record each result in a table (requirement, observed, status):

| Check | Command | If it fails |
|---|---|---|
| inside a git repository | `git rev-parse --show-toplevel` | stop; tell the human the pipeline needs git |
| a remote exists | `git remote -v` | record it; ship will need one. ASK whether to continue without one |
| base branch | `git symbolic-ref refs/remotes/<remote>/HEAD` (fails when the remote was added rather than cloned; then try `git remote show <remote>` and its `HEAD branch:` line, then `git branch -a`) | propose `main` or `master` by what exists |
| `gh` authenticated | `gh auth status` | record "ship and PR checks need `gh`"; continue |
| merge strategy | `gh repo view --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed` | unknown is fine; ask in Step 2. If `gh` says no remote points to a known GitHub host, record "remote is not on GitHub": ship's PR step and the PR-based stage checks will not work (Step 2 asks how to proceed) |
| working tree state | `git status --porcelain` | note it; do not clean it |
| `node` available | `node --version` | optional; without it the verify script skips the workflow syntax check |
| `python3` available | `python3 --version` | optional; used by the hook and the verify script for JSON |
| Claude Code features | confirm you have the `Workflow` tool and can use custom subagents (`.claude/agents/`) | if `Workflow` is absent, stop: this Claude Code build cannot run the pipeline |
| prior adoption | `ls .claude/spec-pipeline.json` | if present, this is an upgrade: follow the "Upgrading" section at the end instead |

**Done when:** the preflight table is recorded, and no "stop" condition fired.

## Step 2: Discover the stack, propose lanes (ASK)

Inventory, without asking:

1. Top-level directories and what each holds (source roots, test roots, docs, infrastructure).
2. Languages and frameworks per directory (manifests: `pyproject.toml`, `package.json`, `go.mod`,
   `Cargo.toml`, `pom.xml`, `*.csproj`, and so on).
3. Test runners and their full-suite commands, from manifests, CI config (`.github/workflows/*`,
   `.gitlab-ci.yml`, `Makefile`, `justfile`, `tox.ini`, `noxfile.py`, `package.json` scripts). Note where
   each must run from (`cwd`) and any environment setup it needs (a virtualenv activation, `nvm use`).
4. Test directory structure per runner: tiers (unit, integration, contract, e2e, perf), and any tier that
   skips itself unless targeted.
5. How to run one test file or one test id with each runner (this becomes `targeted_tests`).
6. Steering files: `CLAUDE.md`, `AGENTS.md`, `.claude/CLAUDE.md`, nested `CLAUDE.md` files. Their headings.
7. Existing `.claude/agents/*.md` (names, descriptions), `.claude/rules/*.md` (their `paths:`),
   `.claude/settings.json` (hooks, permissions), `.claude/commands/`, `.claude/workflows/`.
8. Pattern or convention docs (`docs/patterns/`, `CONTRIBUTING.md`, ADRs).
9. Candidate invariants: rules that are catastrophic to violate, apply everywhere, and are not obvious from
   the code. Look in the steering file, linters, contract tests, and code comments that say "never" or
   "must".

**Propose lanes.** A lane is one independently tested surface with its own architect and dev (for example a
backend and a frontend). Rules of thumb:

- One lane per test runner + source root pair that changes independently.
- A single lane is fine and common. Do not split a monolith just to have two lanes.
- Lane names are short kebab-case tokens (`api`, `web`, `core`, `cli`, `infra`).
- Shared docs or infrastructure without its own test suite is usually an unlaned agent, not a lane.

**ASK the human** (one batch), presenting your evidence and proposed answer for each:

1. **Lanes**: the proposed list, with each lane's owned paths.
2. **Full-suite command per lane**, its `cwd`, any setup, and roughly how long it takes. Mention any
   self-skipping tier you found.
3. **Base branch, remote, and merge strategy**: if the repository squash-merges, propose
   `ship.remove_artifacts_after_pr: false`. If the remote is not on GitHub (Step 1), say so: only the
   `github` forge is implemented, so the pipeline runs through validate, ship commits and pushes but cannot
   open the PR, and the human opens it by hand (or adapts the command per `$SP/docs/configuration.md`,
   "Other forges"). Ask whether to continue on those terms.
4. **Model tiers available**: default `fable` for `models.spec` and `models.escalation` if the account has
   it, otherwise `opus` there. Everything else defaults as in `$SP/docs/configuration.md`.

Also decide, asking only if the evidence is ambiguous:

- **Agents**: existing agents that already fill an architect or dev role for a lane (reuse them) versus
  lanes that need new ones (Step 5).
- **Steering file**: which file is authoritative (Step 6).

**Done when:** the human has confirmed lanes, suites, base branch, merge strategy, and model tiers, and you
have a written inventory of steering files, agents, rules, hooks, and pattern docs.

## Step 3: Copy the payload

Copy **exactly these files**. Do **not** run `cp -R "$SP/payload/." "$REPO/"`: `payload/README.md` is an
installer note and would overwrite the human's `README.md`.

Let `$SPECS` be the specs directory (default `docs/specs`; ask only if the human wants another location or
`docs/specs` already holds unrelated content).

```sh
mkdir -p "$REPO/.claude/commands" "$REPO/.claude/workflows" "$REPO/$SPECS"
cp "$SP/payload/.claude/commands/spec-pipeline.md"  "$REPO/.claude/commands/spec-pipeline.md"
cp "$SP/payload/.claude/workflows/spec-pipeline.js" "$REPO/.claude/workflows/spec-pipeline.js"
cp "$SP/payload/.claude/spec-pipeline.json"         "$REPO/.claude/spec-pipeline.json"
for f in README.md triage-template.md scope-template.md spec-template.md; do
  cp "$SP/payload/docs/specs/$f" "$REPO/$SPECS/$f"
done
```

Before each `cp`, check the destination. If it already exists and is not from a previous adoption, stop
and ASK. If `$SPECS/README.md` exists, merge the payload's content into it instead of replacing it.

Do not copy `$SP/schema/`, `$SP/scripts/`, `$SP/starter-kit/`, or `$SP/docs/` wholesale; Steps 5-9 use them
from `$SP`.

**Done when:** the seven files exist in `$REPO`, nothing pre-existing was overwritten, and you have listed
them.

## Step 4: Write the configuration

Edit `$REPO/.claude/spec-pipeline.json`. It ships filled in for Orderly; replace every value. The reference
for every key is `$SP/docs/configuration.md`; the schema is `$SP/schema/spec-pipeline.schema.json`.

- `version`: `1`.
- `project.name`, `project.description`: from the repository's README; one sentence of stakes framing.
- `specs_dir`: `$SPECS`, no trailing slash. `agents_dir`: `.claude/agents`. `rules_dir`: `.claude/rules`.
- `steering`: the file chosen in Step 6 and the exact headings it will contain. If the human's steering file
  already has equivalents under different names, use their names here rather than renaming their headings.
- `git.base_branch`, `git.remote`: from Step 1/2. `git.branch_prefixes`: keep `["feat", "fix"]` unless the
  repository uses other conventions (the first prefix means "new capability", the second "correcting
  behaviour").
- `ship.forge`: `"github"` (the only implemented forge). `ship.remove_artifacts_after_pr`: `true` for
  merge-commit repositories, `false` for squash or rebase.
- `triage_agent`: `null` (uses the first lane's architect) unless the human prefers a specific architect.
- `lanes[]`: one object per confirmed lane. `paths` are globs of what the lane owns. `targeted_tests` is
  **one sentence** naming the runner, the shape of a selection, the `cwd`, and one real example from this
  repository. `narrow_dirs` lists only test directories that **exist** and that a phase could legitimately
  run whole (a contract tier, for example); otherwise `[]`. `other_agents`: `[]` unless a lane-owned extra
  agent exists.
- `unlaned_agents`: agents routable to a phase that belong to no lane (a docs agent). `[]` if none.
- `suites[]`: one per full suite. `command` must be correct **with no flags added**. `timeout_ms` = the
  human's duration estimate × 2, minimum 120000, capped at 1800000 (the tool's hard limit). Above 600000 the
  validate agent automatically runs it in the background. `setup`: environment activation, else `""`.
  `notes`: runner caveats (a self-skipping tier, "do not run the benchmarks"), else `""`.
  Every suite command is also **forbidden during implement**. A fast whole-project check that phases
  should be free to run (a type check, a linter) is therefore a trade-off: as a suite it runs once at
  validate and never inside a phase; left out, validate never runs it. Mention the choice to the human
  when you add one.
- `whole_suite_patterns`: other phrasings of "run everything" for these runners (a bare `pytest`, `npm test`
  with no path, `go test ./...`, `cargo test` with no filter).
- `invariants`: filled in Step 6. `protected_guards`, `mandatory_tests`: filled in Step 8, else `[]`.
- `models`: from Step 2.

Validate it: `python3 -m json.tool "$REPO/.claude/spec-pipeline.json" >/dev/null` (or
`node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$REPO/.claude/spec-pipeline.json"`).

**Done when:** the file parses, no Orderly value remains (`grep -nE 'Orderly|api-architect|web-dev|_cents'`
returns nothing unless those genuinely are this repository's names), every `suites[].cwd` exists, and every
`narrow_dirs` entry exists.

## Step 5: Agents

Every agent name in `lanes[].architect`, `lanes[].dev`, `lanes[].other_agents`, `unlaned_agents`, and
`triage_agent` must resolve as a Claude Code `agentType`: a file `<agents_dir>/<name>.md` whose frontmatter
`name:` equals the file name, or the built-in `general-purpose`.

Choose one path per lane:

**A. The lane already has suitable agents.** Use their exact names in the config. Do not rewrite them. If
one lacks an "On scope discovery: report, don't absorb" boundary or a "don't block; state assumptions"
clarification pattern, ASK before adding those sections (workflow subagents cannot ask questions mid-run,
so the pattern matters).

**B. The lane has no agents (default).** Create `<agents_dir>/<lane>-architect.md` and
`<agents_dir>/<lane>-dev.md` from `$SP/starter-kit/agents/` (`api-architect.md` and `api-dev.md` are the
templates; `web-*` show a second stack). For each new file:

1. Set `name:` to the file name and rewrite `description:` for this lane (what it receives, what it produces,
   whom it hands off to).
2. Resolve every `<!-- ADOPT: -->` marker: the stack sentence, the Initialization reading list (the steering
   file, this lane's pattern index if one exists, the core model files), the architect's one project-critical
   classification line, and the dev's Testing Requirement mapping (change kind → test tier, using this
   repository's real tiers). Delete each marker once resolved.
   The markers also cover every place a starter agent names a sibling agent (`api-dev`, `api-architect`,
   `docs-writer`) or a pattern doc: name this repository's agents there, and drop a line whose agent or
   doc does not exist (most repositories have no docs agent).
3. Keep the Boundaries, "On scope discovery", and Clarification Pattern sections as they are, apart from
   those agent names.
4. Keep the files lean (around 60 lines). The pipeline passes a model on every call, so frontmatter `model:`
   matters only for interactive use.

If a docs agent is wanted, adapt `starter-kit/agents/docs-writer.md` and list it in `unlaned_agents`.

**C. The human declines custom agents.** Set every `architect` and `dev` to `general-purpose`. Warn the
human: prompts lose lane-specific context, and phase review falls back to the workstream's architect when
an agent belongs to several lanes. Path B is recommended.

**Done when:** for every agent name in the config, either it is `general-purpose`, or
`<agents_dir>/<name>.md` exists with `name: <name>` and contains no `ADOPT:` marker, and
`grep -nE 'Orderly|api-|web-|docs-writer|api/|web/' <agents_dir>/*.md` shows nothing that is not this
repository's own (Step 9's check 11 repeats this).

## Step 6: Steering file and invariants (ASK)

Decide the steering file:

| Repository has | Do this |
|---|---|
| `CLAUDE.md` | merge into it; `steering.file` = `CLAUDE.md` |
| only `AGENTS.md` | merge into `AGENTS.md`; set `steering.file` = `AGENTS.md`; create a `CLAUDE.md` whose first line is `@AGENTS.md` (Claude Code injects `CLAUDE.md`, and the import pulls in `AGENTS.md`) unless one already imports it |
| both | ASK which is authoritative; merge there; make sure the other imports or points to it |
| neither | create `CLAUDE.md` from the starter section |

Merge `$SP/starter-kit/steering/CLAUDE.section.md` into that file. The section is filled for Orderly;
rewrite its content for this repository. Merge rules:

- **Existing headings win.** If the file already has a routing table, a constraints section, or an
  anti-patterns list, extend it in place and point `steering.*` at the existing headings. Never create a
  duplicate section. The same holds for any section whose content overlaps a starter section (a
  `## Commands` section already covers Testing Requirements and Environment Setup: extend it). When the
  file already has an H1, drop the starter section's `# Claude Configuration` H1.
- **Rules written as bullets.** If the file states its invariants as bullets under one heading (for
  example `## Conventions`), make that heading `steering.invariants_heading` and promote each invariant
  the human confirms to its own `###` heading in place, keeping their original sentence as the rule's
  first line. Leave unconfirmed bullets as they are.
- **Required content**, wherever it lands:
  - the rule-loading caveat paragraph (verbatim apart from paths);
  - an anti-patterns list that includes, by these exact names, **"Tests a wrong program passes too"** and
    **"Source-shape assertions with no named invariant"** (the architect review cites them), plus "never use
    git worktrees" and "never use git stash";
  - the routing table under `steering.routing_heading` listing **every agent in the config** with Task Type
    and When columns;
  - Prompt Structure for Specialists, When Exceptions Are Appropriate, a Reference table (Working On / Read
    Doc) plus key source files, Environment Setup, and a closing Critical Recall table. With no pattern
    docs yet, the Reference table's Read Doc column points at the real source files, tests, rules, or
    `README.md` that answer each topic; never cite a doc that does not exist.
- A one-line pointer to the pipeline: "`/spec-pipeline` drives a workstream through triage → scope → spec →
  implement → validate, writing each stage's artifact under `<specs_dir>/`."

**ASK the human for the invariants**: present 2-5 candidates from Step 2 (each with the evidence: file,
linter rule, or comment) and ask which are genuinely catastrophic, always-applicable, and non-obvious. Zero
is acceptable; the review then judges against each spec's own Invariance section. For each confirmed
invariant, write one `###` heading under `steering.invariants_heading` with: the rule, where it applies, a
short do/don't, and key files. Copy the heading texts, exactly, into `invariants` in the config.

**Done when:** the steering file contains `steering.routing_heading`, `steering.invariants_heading` (if any
invariants), every invariant heading named in `invariants`, both anti-pattern names verbatim, and a routing
row for every configured agent; and `CLAUDE.md` exists (directly or importing `AGENTS.md`).

## Step 7: Fill the templates

Open each template in `$SPECS`. Every adopter-specific example sits directly below a marker:

```
<!-- ADOPT: <instruction>. Replace the example below with one from this repository, then delete this marker. -->
```

List them: `grep -n 'ADOPT:' "$REPO/$SPECS"/*-template.md`. For each marker:

1. Follow its instruction, replacing the Orderly example below it with a real example from this repository.
2. Confirm every path you write resolves (`ls` it) and every symbol exists (`grep` it). An example that does
   not resolve teaches agents to invent paths.
3. Delete the marker line.

Then enforce these exact correspondences with the config:

- triage template, `**Lane**:` line: `[<every lane name, separated by " | "> | unresolved]`.
- triage template, `**Branch**:` line: one `<prefix>/<slug>` alternative per `git.branch_prefixes` entry,
  then `unresolved - triage blocked on routing` (unchanged).
- spec template, `**Agent routing**:` placeholder: `[exactly one of: <every routable agent, " | "-separated>]`,
  where routable = every lane's architect, dev, and other agents, plus `unlaned_agents`.
- spec template, Part B `#### Project Invariants`: one checklist bullet per entry of `invariants`, then the
  unchanged "No worktrees / no `git stash`" bullet.
- spec template, Standards References: one row per steering heading, pattern doc, and rule this repository
  actually has. Keep the rules "cite by relevance, not truth" and "an omission is a template bug".
- triage template, forbidden-surfaces grep in the self-check: keep `git[ -]stash|worktree` and add this
  repository's own forbidden patterns, or none.

Change nothing outside the markers except those lines. In particular keep every heading, every
`**Field**:` key, the `END OF EMITTED ARTIFACT` fences, and these sentences byte for byte:
`No open questions - scoping may begin.`, `No open questions — spec drafting may begin.`,
`No open questions — implementation may begin.`

**Done when:** `grep -rn 'ADOPT:' "$REPO/$SPECS" "$REPO/.claude/agents"` returns nothing, the correspondences
above hold, and `grep -rnE 'Orderly|api/|web/|_cents|tenant|refund|Background Job|api-architect|web-dev|docs-writer' "$REPO/$SPECS"`
returns nothing (unless those are genuinely this repository's names). Step 9's check 11 repeats this.

## Step 8: Optional supporting pieces

Offer each; install only what the human accepts or what clearly fits. Each is described in
`$SP/docs/steering.md`.

1. **Path-scoped rules** (`$SP/starter-kit/rules/example-rule.md`): one per invariant that has a clear path
   footprint. `paths:` lists the globs; the body is a short shim with a pointer to its pattern doc, 3-5 rules,
   key files, anti-patterns, and explicit absence statements. Never duplicate a rule that exists.
2. **Mandatory tests** (`mandatory_tests` in the config): for each boundary that always owes a contract test
   ("a change that adds a migration owes test X, defined in rule Y"), add `{when, requires, rule}`.
3. **Protected guards** (`protected_guards`): guard tests the review must never flag as shape-only (for
   example a payload-isolation contract test). List existing ones by kind and path.
4. **Enforcement hook** (`$SP/starter-kit/hooks/`): only for an invariant that a regex can check with a very
   low false-positive rate. Copy the script to `.claude/hooks/`, adapt its path scope, exclusions, pattern,
   and message, `chmod +x` it, and register it in `.claude/settings.json` under `hooks.PostToolUse` with
   matcher `Edit|Write`. Follow `$SP/starter-kit/hooks/README.md`.
5. **Settings snippet** (`$SP/starter-kit/settings.snippet.json`): merge `permissions.deny` entries
   `Bash(git stash)` and `Bash(git stash:*)` into `.claude/settings.json`. Create the file if absent. Never
   replace an existing file; never drop existing entries.
6. **Pattern index** (`$SP/starter-kit/patterns/README.md`): per lane, only if the lane has or will have
   pattern docs.

**Done when:** each item is either installed (and listed) or explicitly declined, `.claude/settings.json`
(if touched) parses as JSON, and any hook script passes `bash -n`.

## Step 9: Verify

1. **Static checks**: `bash "$SP/scripts/verify-adoption.sh" --repo "$REPO"`. Fix every FAIL and re-run until
   none remain. It checks the config (and the schema, when python3 has `jsonschema`), the payload files,
   the workflow script's syntax (with `node`), agent files, leftover markers, the template's Lane, Branch,
   hand-off, and Agent routing lines, the no-questions sentences, the steering file (routing and
   invariants headings, both cited anti-pattern names, a mention of every agent, the `@` import when
   `steering.file` is not `CLAUDE.md`), suite directories, rule files, and leftover example-project
   (Orderly) names. It never runs tests.
2. **Suites**: run each `suites[].command` once, from its `cwd`, after its `setup`, with a timeout matching
   `timeout_ms` (background when above 600000). Record pass/fail and the duration. If a duration exceeds half
   of `timeout_ms`, raise `timeout_ms` (cap 1800000). A suite that fails before any change is a
   pre-existing failure: report it to the human, do not fix it. Validate will report it on every run until
   it is fixed or excluded through the runner's own configuration.
3. **One targeted run per lane**: run the example from each lane's `targeted_tests` and confirm it collects
   only the named tests and finishes quickly.
4. **Triage dry run (ASK first: it spends a few agent calls).** Read `.claude/spec-pipeline.json` and call
   the Workflow tool directly:

   ```
   Workflow({ name: "spec-pipeline", args: {
     config: <the parsed config object, not a string>,
     stage: "triage",
     slug: "adoption-dry-run",
     date: "<today, YYYY-MM-DD>",
     idea: "<one small, real improvement in this repository, one sentence>"
   }})
   ```

   If the named workflow is not found (sessions discover workflows at start), retry with
   `scriptPath: ".claude/workflows/spec-pipeline.js"` instead of `name`, or ask the human to start a new
   session and run it there. Expect a return with `stage: "triage"` and a `triage` object whose `status` is
   `routed` or `blocked` (either proves the wiring), and the file `<specs_dir>/adoption-dry-run-triage.md`
   with the six frontmatter lines `**Slug**:`, `**Branch**:`, `**Lane**:`, `**Date**:`, `**Status**:`,
   `**Source**:`. An `error` of `invalid config: ...` points at Step 4; "draft agent returned no result"
   usually means an agent name or model tier does not resolve. Then delete exactly that one file:
   `rm "$REPO/<specs_dir>/adoption-dry-run-triage.md"`. Never glob-delete in the specs directory.

**Done when:** the verify script reports no FAIL, every suite and targeted run has a recorded result, and
the dry run either succeeded (artifact deleted) or the human declined it.

## Step 10: Report

End with this report, filled in. Keep it factual.

```markdown
## spec-pipeline adoption report

**Repository**: <name>   **Specs directory**: <specs_dir>   **Base**: <remote>/<base_branch>
**Ship**: forge github, remove_artifacts_after_pr <true|false> (<merge strategy observed>)

### Lanes and agents
| Lane | Owns | Architect | Dev | Targeted tests | Full suite (cwd, timeout) |
|---|---|---|---|---|---|
| ... |

Unlaned agents: <list or none>. Triage agent: <name>.

### Invariants
<one line each, with its steering heading>, or "none configured".

### Files added or changed
| File | Added / Merged / Edited | Note |
|---|---|---|
| .claude/commands/spec-pipeline.md | Added | |
| ... |

### Verification
- verify-adoption.sh: <PASS count> PASS, <SKIP count> SKIP, 0 FAIL
- Suites: <name: pass/fail, duration> ...
- Targeted runs: <lane: ok> ...
- Triage dry run: <routed to <lane> | blocked on ## <section> | declined>; artifact deleted

### Decisions the human still owes
- <e.g. pre-existing failing tests in suite X; whether to add a hook for invariant Y; enable merge commits>

### Nothing was committed
All changes are in the working tree. Suggested commit: `chore: adopt spec-pipeline`.

### How to use it
| You say | What happens |
|---|---|
| `/spec-pipeline <idea>` | picks a slug, runs triage, auto-advances while nothing needs you |
| `/spec-pipeline advance` | runs the next stage derived from disk (ship after a green validate) |
| `/spec-pipeline refine: <notes>` | inline edit, or re-run the same stage with your notes |
| `/spec-pipeline rewind to <stage>` | re-run an earlier stage |
| "retry that phase on <escalation tier>" | re-sends unpassed phases on models.escalation |
| after /resume | say `advance` |
Start a new Claude Code session first so the command and workflow are discovered.
```

**Done when:** the report is delivered.

## Upgrading an existing adoption

If `.claude/spec-pipeline.json` already exists:

1. Keep the human's config. Compare it with `$SP/schema/spec-pipeline.schema.json` and add any new keys with
   their documented defaults (`$SP/docs/configuration.md`); if `version` differs, read `$SP/CHANGELOG.md`
   for migration notes.
2. Replace `.claude/commands/spec-pipeline.md` and `.claude/workflows/spec-pipeline.js` with the new payload
   versions (the human should not have edited them; if `git diff` shows local edits, ASK).
3. For each template, diff the old payload version against the new one and apply the upstream changes to
   the human's filled-in copy, preserving their resolved `ADOPT` slots.
4. Run Step 9 and report as in Step 10.
