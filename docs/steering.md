# Steering: the context that makes the pipeline precise

The pipeline's prompts are deliberately generic. What makes an agent's output specific to your project is
the context around it: the steering file, path-scoped rules, agent definitions, pattern docs, tests, and
hooks. This page explains how to build each. Starter versions of all of them are in
[`starter-kit/`](../starter-kit/).

## The steering file

Claude Code injects `CLAUDE.md` into every session and every subagent. If your project standardizes on
`AGENTS.md`, keep it and add a `CLAUDE.md` containing `@AGENTS.md`, then set `steering.file` to whichever
file holds the headings.

### Headings are an interface

The pipeline cites the steering file **by heading**: the routing table (`steering.routing_heading`), the
invariants (`steering.invariants_heading` plus each `invariants[]` entry), the anti-patterns
(`steering.anti_patterns_heading`), and the reference table (`steering.reference_heading`). Renaming a
heading without updating `.claude/spec-pipeline.json` silently breaks a citation. Treat headings as stable
identifiers.

### Recommended structure

```
<one paragraph: what the project is, what a violation costs, pointer to the pattern-doc index>
<the rule-loading caveat paragraph>

## Critical Constraints
### <Invariant 1>          one heading per invariant; the name is copied into invariants[]
### <Invariant 2>
## Testing Requirements
## Anti-Patterns
### LLM-Behavior Corrections
### Architecture Violations
## Workflow & Agent Routing
### Agent Selection         Task Type | Agent | When, listing every agent
### Prompt Structure for Specialists
## When Exceptions Are Appropriate
## Reference                Working On | Read Doc, plus "Key source files"
## Environment Setup
## Critical Recall          Constraint | Violation Consequence
```

### The placement test

Content earns a place in the steering file only when it is **catastrophic** (a build failure, a runtime crash,
data corruption, a security hole), **always applies** (every route, every test, every job), and is **not
obvious** from the code or the types. Everything else (examples, templates, rationale, one-off cases) goes in
a pattern doc, or nowhere. A steering file that grows past what passes this test dilutes the parts that do.

### One invariant per heading

Each invariant gets its own `###` heading with: the rule in one or two sentences, where it applies (a small
table if the answer differs by context), a do/don't pair, and key files. One heading per invariant lets the
architect review anchor a concern to it by name, and lets `invariants[]` list it. Orderly's four:

| Heading | Rule in one line |
|---|---|
| `### Money as Integer Cents` | every amount is an `int` of cents (`amount_cents`); never `float`, never `Decimal` across the API boundary |
| `### Tenant Scoping` | every route reads through `require_tenant` (`api/deps/tenant.py`); no query crosses tenants |
| `### Background Job Payloads` | a payload (`api/jobs/payloads.py`) holds IDs and plain dicts only, never ORM objects or sessions |
| `### Migrations Are Additive` | migrations add with defaults; destructive changes take two steps and a contract test |

The third is a **shape-defined invariant**: its legality is a property of a shape ("a payload holds IDs and
plain dicts"), so state the shape and the sentence that makes it legal, rather than listing forbidden types.

### Anti-patterns the pipeline relies on

The architect review's test-proportionality step cites two entries by name. Keep them, with these names:

- **Tests a wrong program passes too**: don't assert a symbol exists, lives in a given file, or equals its own
  literal; call it and assert what it returns.
- **Source-shape assertions with no named invariant**: read source text only where no runtime test can
  observe the invariant (for example an integer-cents guard); otherwise assert behaviour.

The rest of the recommended list: never use git worktrees; never use git stash; creating unnecessary files;
creating documentation proactively; adding features beyond the request; premature abstractions; tests over
specs-directory prose (a spec is not a runtime input); a new file or symbol as the test trigger (the trigger
is a new behaviour; a move or rename owes none); docstrings for unchanged code; naming things
"enhanced"/"new"/"updated".

### The routing table

`### Agent Selection` lists every agent the config names, with what kind of task it takes and when. Triage
reads it alongside the lane table the script builds from your config. Keep the two consistent.

### Critical Recall

End the file with a short table of the constraints with the highest violation cost and their consequence.
Long files get skimmed; the last table gets read.

## Path-scoped rules

A rule in `.claude/rules/*.md` with `paths:` frontmatter (a string or a list of globs) loads into context when
the **Read tool** opens a matching file. Four consequences:

1. **A rule is absent until a matching file is read.** It is not loaded at launch.
2. **Reaching a file through Bash** (`cat`, `head`, `sed -n`, `grep`) **does not load its rule.** A session
   that steers agents away from the Read tool suppresses rules almost entirely.
3. **Creating a new matching file does not load its rule.** An agent writing a new route or a new contract
   test from scratch should read a sibling of the same kind first.
4. **After `/compact`, a rule reloads only on the next matching Read.**

Put this caveat in the steering file so agents know when a rule is missing. The pipeline also works around
it: the spec drafter, the spec critic, and the architect review are told to list `rules_dir`, check each
rule's `paths:`, and **open every matching rule by name**, because "a rule you have not opened is not
applied". The dev agent is told to use matching rules and, for every `mandatory_tests` entry, to open the
named rule explicitly. So rules the pipeline depends on must be **findable by name** in `rules_dir`.

### Rule shape

A rule is a short shim, not a manual:

```markdown
---
paths:
  - api/jobs/**
  - api/tests/contract/test_job_payloads.py
---

# Background Job Payload Standards

See `api/docs/patterns/background-jobs.md` for complete patterns.

## Core Rules            3-5 rules, each one or two sentences
## Contract Tests         what a change here owes
## Key Files
## Anti-Patterns
## What Does Not Exist     explicit absence statements
```

**Absence statements** ("there is no retry field on a payload; retries are the queue's job", "there is no
end-to-end job harness") are disproportionately valuable: they stop an agent from inventing machinery it
assumes must exist. See [`starter-kit/rules/example-rule.md`](../starter-kit/rules/example-rule.md).

## Agents

Each lane needs an **architect** (drafts scope and spec, reviews phases, and, as `triage_agent`, may draft
triage) and a **dev** (implements phases). An unlaned docs agent is a useful extra. The file name is the
routing token: `<agents_dir>/api-dev.md` must have `name: api-dev`.

### Lean shape (about 60 lines)

| Section | Architect | Dev | Docs |
|---|---|---|---|
| Frontmatter | `name`, `description` (receives, produces, hands off to), `model`, `color` | same | same |
| Role sentence | specialization + "you receive scoped design requests" | "you receive implementation specifications" | "you receive documentation requests" |
| Position in System | who implements and documents its work | whose designs it builds | whose work it documents |
| Initialization | the steering file, the lane's pattern index, the core model files | same, plus "standards are not suggestions" | the steering file, the docs pattern |
| Input Interface | what prompts include; "state assumptions and proceed" | same | same |
| Output Interface | Decision, Rationale, Integration points, Implementation guidance, Open questions, **one project-critical classification** | What was built, Tests added, Integration notes, Standards applied, Scope notes | What was documented, Audience served, Standards applied, Notes |
| Boundaries | "you design; you don't" + **On scope discovery: report, don't absorb** with (A)/(B) options | same with (A)/(B)/(C) | same |
| Testing Requirement | | change kind → test tier mapping | |
| Clarification Pattern | **don't block; state assumptions** | same | same |

The project-critical classification is the one question every design in this lane must answer explicitly.
For Orderly's `api-architect`: "Tenant scope: which routes and queries are tenant-bound, and through which
dependency". The clarification pattern matters more than it looks: **workflow subagents cannot ask the human
anything**, so an agent that blocks on a question wastes its run. It should finish with stated assumptions,
and the stage's open-questions channel carries the real decisions to you.

The pipeline passes `model` on every call, so frontmatter `model:` only affects interactive use.

## Pattern docs

Pattern docs hold what is too long or too specific for the steering file: examples, templates, rationale.

- **An index per lane** (`api/docs/patterns/README.md`): a table of Doc / Purpose / Routing surface, where the
  routing surface is the rule or steering row that points at the doc.
- **Each doc elaborates one steering surface without contradicting it.** When they disagree, the steering
  file wins and the doc is a bug.
- **Full-path cross-references only**: `See api/docs/patterns/money.md`, never "see the pattern docs".
- **Ground-truth anchors**: `<!-- Ground truth: api/models/money.py:12-30 (to_cents) -->` above each section
  that describes code. Review the anchored claims in the same PR as any change to the anchored file,
  periodically, and after any architecture change.
- **A testing doc per lane**: the test taxonomy, naming, the guard inventory (which tests deliberately assert
  shape, and why), and fixtures.

Skeleton: [`starter-kit/patterns/README.md`](../starter-kit/patterns/README.md).

## Tests

- **Targeted selection must be cheap.** Phases run only the tests they name, the modules that exercise the
  files they touched, and at most one narrow directory. A single file should run in seconds. Describe the
  shape once per lane in `targeted_tests`.
- **The full suite runs once**, at validate, in the background when it exceeds 10 minutes.
- **The default command must be correct with no flags.** If a perf tier should not run by default, make it
  skip itself unless targeted (a marker, a runner config); never rely on a prompt remembering an exclusion
  flag.
- **Mandatory contract tests** take the form "a change crossing boundary X owes test Y, defined in rule Z".
  List them in `mandatory_tests`; they survive the "a move or rename owes no new test" rule.
- **Name the guards.** Tests that deliberately assert a shape (payload isolation, additive migrations, an
  integer-cents source guard) go in `protected_guards` so the review never flags them as shape-only.

## Hooks

A `PostToolUse` hook on `Edit|Write` receives the tool call as JSON on stdin. Exiting with status 2 feeds
its stderr back to the agent as corrective feedback. Use hooks for the few invariants a regex can check
reliably:

- parse `tool_input.file_path` (with a `python3` fallback, because `jq` is not guaranteed);
- scope by path, and exclude the file that defines the rule and the tests;
- filter comments and docstrings to avoid false positives;
- on a violation, print the file, the offending lines, the exact fix, and the steering section, then exit 2;
- mirror the same check as a git pre-commit hook (`git config core.hooksPath <dir>`) so humans get it too;
- only mechanize checks with a very low false-positive rate. A noisy hook trains agents to work around it.

Hooks back up the steering text; they never replace it. See [`starter-kit/hooks/`](../starter-kit/hooks/).

## Branches

The change type (and so the branch prefix) is decided at triage. The slug is the branch segment. The branch
is created off the latest base only when implement starts, by the orchestrator. Dev agents never create,
switch, or rename branches.
