# Prerequisites

Two lists: the **hard requirements** without which the pipeline does not run, and the **supporting things**
that decide how well it runs. [`steering.md`](steering.md) explains how to build each supporting piece.

## Hard requirements

### 1. Claude Code with the features the pipeline uses

| Feature | Used for |
|---|---|
| The `Workflow` tool (Dynamic Workflows) and `.claude/workflows/` | the script runs as the named workflow `spec-pipeline` |
| Custom slash commands (`.claude/commands/`) | `/spec-pipeline` is the orchestrator |
| Custom subagents (`.claude/agents/`) | every name in the config must resolve as an `agentType`; `general-purpose` always exists |
| `AskUserQuestion` | rendering open questions: at most 4 questions per call, a 12-character header, 2-4 options |
| Bash with `run_in_background` | validate runs long suites in the background: 10-minute foreground cap, 30-minute hard cap |
| `/resume` | picking a workstream back up; state is re-derived from disk |

Commands and workflows are discovered when a session starts. After installing, start a new session.

Workflow scripts run without filesystem access, without a clock, and without randomness. That is why the
command passes the configuration and the date in `args`, and why the script never reads your files itself.

### 2. git, with a base branch and a remote

The orchestrator runs `rev-parse`, `checkout` / `checkout -b`, `pull`, `fetch --prune`, `add` with an
`:(exclude)` pathspec, `commit`, `push -u`, `rm`, `restore --source`, `log` with a trailer format, and two
`diff` shapes. The implement stage's per-phase committer runs `add`, `diff --cached`, `log`, and
`commit -F`; it never bypasses a pre-commit hook, so a hook that rejects a phase halts implement until you
fix what it flagged. **What good looks like**: `git pull <remote> <base>` works non-interactively, and git is
2.22 or newer (re-entry after `/resume` reads `git log --format='%(trailers:key=Spec-Phase,valueonly)'`).

### 3. The `gh` CLI, authenticated

Used for `gh pr list` / `gh pr view` (stage derivation: is there an open or merged PR?), `gh pr create`
(ship), and `gh repo view --json url` (the spec permalink). **What good looks like**: `gh auth status`
succeeds in the shell Claude Code uses, and `gh repo view` recognizes the remote (it must be on GitHub, the
only forge implemented). Without `gh` or a GitHub remote, everything up to validate works; ship commits and
pushes but cannot open the PR, and PR-based stage derivation is skipped.

### 4. Merge commits, or keep the artifacts

With `ship.remove_artifacts_after_pr: true` (default), ship links the spec at the pre-removal branch tip's SHA
and then removes the artifacts from the branch tip. A squash merge rewrites that commit away, and the
permalink no longer resolves from the base branch. Either allow merge commits or set
`remove_artifacts_after_pr` to `false`. Merge commits also keep the one-commit-per-phase history that
implement writes; a squash merge folds it into one commit on the base branch.

### 5. A specs directory with two rules

The specs directory (`docs/specs/` by default) holds the three templates and every workstream's artifacts.
Artifacts stay **untracked until the spec is approved**, when the orchestrator commits this slug's three on
its `<prefix>/<slug>` branch. Two rules protect the directory: never `git add -A` over it (another
workstream's drafts would ride along into your PR), and never glob-delete in it (it holds the templates and
other drafts).

### 6. One working tree

No git worktrees, no `git stash`. Agents verify the tree they see; anything hidden in a stash or another
worktree is invisible to the checker and the reviewer. Enforce it twice: a steering anti-pattern, and a
`permissions.deny` entry for `Bash(git stash)` and `Bash(git stash:*)`
([`starter-kit/settings.snippet.json`](../starter-kit/settings.snippet.json)).

### 7. A clean enough tree when entering implement

The orchestrator checks out the base branch before creating `<prefix>/<slug>`. If uncommitted changes make
git refuse that checkout, the run stops and asks you to commit or discard. (The workstream's own untracked
artifacts are expected and carried across, then committed on the new branch as the spec commit.)

### 8. Model tiers your account can run

The pipeline sets a model on every agent call from `models.*`. If the top tier is not available, set
`models.spec` and `models.escalation` to `opus`. Agent frontmatter `model:` matters only when you use an
agent interactively.

## Supporting things, and what good looks like

| Item | What good looks like | Without it |
|---|---|---|
| **Steering file** (`CLAUDE.md`, or `AGENTS.md` imported by `CLAUDE.md`) | Stable headings; one `###` per invariant under a constraints heading; an Agent Selection table listing every agent; the anti-patterns list with "Tests a wrong program passes too" and "Source-shape assertions with no named invariant"; a Reference table; a Critical Recall table | Prompts cite headings that do not exist; the review has no invariants to judge against |
| **Rule-loading caveat paragraph** in the steering file | States that path-scoped rules load only on a matching Read, and the four consequences | Agents assume rules are always present and miss them silently |
| **Path-scoped rules** (`.claude/rules/*.md`) | One short shim per invariant with a path footprint: `paths:` globs, a pointer to the pattern doc, 3-5 rules, key files, anti-patterns, explicit absence statements | Rules live only in the steering file, so they are always loaded or never specific |
| **Architect and dev agent per lane** | ~60-line definitions: role, position, initialization reading list, input/output interfaces, one project-critical classification (architect), a change-kind → test-tier mapping (dev), "report, don't absorb", "don't block; state assumptions" | `general-purpose` works, with less lane context |
| **Pattern docs** per lane | An index (Doc / Purpose / Routing surface); each doc elaborates one steering surface; full-path cross-references; ground-truth anchors re-checked when anchored code changes; a testing doc per lane | The spec's Standards References has little to point at |
| **Targeted tests** | A single file or test id runs in seconds; each lane's `targeted_tests` sentence names a real example | Phases are slow, and agents drift toward running everything |
| **One correct full-suite command per lane** | Correct with no flags added; self-skipping tiers configured in the runner, not in prompts; duration known | Validate reports noise, or misses tests |
| **Mandatory contract tests** | Stated as "a change crossing boundary X owes test Y, defined in rule Z", listed in `mandatory_tests` | A move or rename that crosses a boundary ships untested |
| **Enforcement hooks** (optional) | `PostToolUse` on `Edit|Write`, exit 2 with a precise stderr message, scoped by path, excluding the definition file and tests, low false-positive rate; mirrored as a git pre-commit hook | The steering text is the only guard (usually enough) |
| **Branch conventions** | The prefix decided at triage; the slug equals the branch segment; branches created off the latest base only when implement starts; dev agents never touch branches | |

## Deliberately never shipped

This repository ships **shapes**, not content: no domain invariants, no stack-specific pattern docs, no
domain hooks, no tech-stack content inside agents, and no local settings. The starter kit's Orderly examples
exist to be replaced, and ADOPT.md's "Done when" gates check that they are gone.
