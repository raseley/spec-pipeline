# Configuration reference

Everything project-specific lives in **`.claude/spec-pipeline.json`** in the adopting repository: plain JSON,
no comments. The command reads it at Step 0 of every invocation and passes the parsed object, untrimmed, as
`args.config` on every `Workflow` call. The workflow script has no filesystem access, so this object is its
only view of your project.

- Missing or unparsable file: the command stops with "spec-pipeline is not configured" and points at
  `ADOPT.md`. It never guesses.
- Invalid content: the script returns `{stage, error: "invalid config: <reason>"}` before running anything.
- The JSON Schema is [`schema/spec-pipeline.schema.json`](../schema/spec-pipeline.schema.json) in this
  repository. It is used by `scripts/verify-adoption.sh` and is not copied into your repository.
- The pipeline never edits this file. Re-read it after `/resume` (the command does so at Step 0).

## The example project: Orderly

Every example in this repository describes one fictional project, **Orderly**, a small order-management
web app:

- **Lane `api`**: a Python/FastAPI service under `api/`, tests under `api/tests/{unit,integration,contract,perf}/`.
  Targeted run: `pytest api/tests/unit/test_refunds.py -q` from the repo root. Full suite: `pytest api/tests/ -q`
  (about 6 minutes). `api/tests/perf/` skips itself unless targeted explicitly.
- **Lane `web`**: a TypeScript/React client under `web/`, tests under `web/tests/`. Targeted run:
  `npx vitest run tests/orders/OrderTable.test.tsx` from `web/`. Full suite: `npx vitest run` from `web/`
  (about 3 minutes).
- **Agents**: `api-architect`, `api-dev`, `web-architect`, `web-dev`, plus the unlaned `docs-writer`.
- **Invariants**: Money as Integer Cents; Tenant Scoping; Background Job Payloads; Migrations Are Additive.
- **Git**: base `main`, remote `origin`, prefixes `feat`/`fix`, merge commits, GitHub with `gh`.

## Full example

```json
{
  "version": 1,
  "project": {
    "name": "Orderly",
    "description": "An order-management web app: a Python API that owns orders, refunds, and tenants, and a TypeScript web client that renders them."
  },
  "specs_dir": "docs/specs",
  "agents_dir": ".claude/agents",
  "rules_dir": ".claude/rules",
  "steering": {
    "file": "CLAUDE.md",
    "routing_heading": "### Agent Selection",
    "invariants_heading": "## Critical Constraints",
    "anti_patterns_heading": "### LLM-Behavior Corrections",
    "reference_heading": "## Reference"
  },
  "git": { "base_branch": "main", "remote": "origin", "branch_prefixes": ["feat", "fix"] },
  "ship": { "forge": "github", "remove_artifacts_after_pr": true },
  "triage_agent": "api-architect",
  "lanes": [
    {
      "name": "api",
      "description": "Python/FastAPI service under api/: routes, domain models, migrations, background jobs.",
      "architect": "api-architect",
      "dev": "api-dev",
      "other_agents": [],
      "paths": ["api/**"],
      "targeted_tests": "pytest <file or node id> -q from the repo root, e.g. pytest api/tests/unit/test_refunds.py -q",
      "narrow_dirs": ["api/tests/contract/"]
    },
    {
      "name": "web",
      "description": "TypeScript/React client under web/: components, hooks, API client, Vitest tests.",
      "architect": "web-architect",
      "dev": "web-dev",
      "other_agents": [],
      "paths": ["web/**"],
      "targeted_tests": "npx vitest run <path> from web/, e.g. npx vitest run tests/orders/OrderTable.test.tsx",
      "narrow_dirs": []
    }
  ],
  "unlaned_agents": ["docs-writer"],
  "suites": [
    {
      "name": "api",
      "lane": "api",
      "setup": "",
      "command": "pytest api/tests/ -q",
      "cwd": ".",
      "timeout_ms": 900000,
      "notes": "api/tests/perf/ skips itself unless targeted explicitly (enforced by the api test configuration). Do not add an exclusion flag of your own. Do not run the benchmarks."
    },
    {
      "name": "web",
      "lane": "web",
      "setup": "",
      "command": "npx vitest run",
      "cwd": "web",
      "timeout_ms": 300000,
      "notes": ""
    }
  ],
  "whole_suite_patterns": ["a bare `pytest` from the repo root", "`npm test`, `npm run test`, or `npx vitest run` with no path"],
  "invariants": ["Money as Integer Cents", "Tenant Scoping", "Background Job Payloads", "Migrations Are Additive"],
  "protected_guards": [
    "the job-payload isolation contract test (api/tests/contract/test_job_payloads.py)",
    "the additive-migration contract test (api/tests/contract/test_migrations.py)",
    "a source-shape guard that mechanizes an invariant no runtime test can observe (the integer-cents guard, api/tests/contract/test_money_types.py)"
  ],
  "mandatory_tests": [
    {
      "when": "a change adds or alters a database migration",
      "requires": "an additive-migration contract test in api/tests/contract/test_migrations.py",
      "rule": ".claude/rules/migrations.md"
    },
    {
      "when": "a change adds or moves a background job entry point",
      "requires": "a payload-isolation contract test in api/tests/contract/test_job_payloads.py",
      "rule": ".claude/rules/background-jobs.md"
    }
  ],
  "models": {
    "triage": "opus",
    "scope": "opus",
    "spec": "fable",
    "critic": "opus",
    "impl": "opus",
    "check": "opus",
    "review": "opus",
    "commit": "sonnet",
    "validate": "sonnet",
    "escalation": "fable"
  }
}
```

## Keys

**R** = required. Otherwise the default shown is applied identically by the script (`withDefaults`). The
command applies only the defaults it needs itself (`specs_dir`, `agents_dir`, `git.*`, `ship.*`,
`models.escalation`).

### Top level

| Key | Type | Default | Meaning |
|---|---|---|---|
| `version` | integer | **R**, must be `1` | Contract version. Any other value is an error. |
| `project.name` | string | **R** | Inlined into prompts ("routing analyst for the `Orderly` workstream ...") and the PR body. |
| `project.description` | string | `""` | One sentence inlined into the triage prompt so the drafter knows what is at stake. |
| `specs_dir` | string | `"docs/specs"` | Where templates and artifacts live. No trailing slash. Every path the command, script, and ship step build starts here. |
| `agents_dir` | string | `".claude/agents"` | Where agent definitions live. Cited in role sentences ("Its definition, where the project ships one, is `.claude/agents/api-dev.md`"). |
| `rules_dir` | string | `".claude/rules"` | Path-scoped rules. Prompts say "if that directory exists", so an absent directory is fine. |
| `triage_agent` | string or null | `null` → `lanes[0].architect` | The `agentType` that drafts, critiques, and revises triage. One lane's architect borrows the routing role; pick whichever architect knows the whole repository best. |

### `steering`

Prompts cite the steering file **by heading**, so these must match the file exactly.

| Key | Default | Used by |
|---|---|---|
| `steering.file` | `"CLAUDE.md"` | Every heading citation. If you use `AGENTS.md`, make sure a `CLAUDE.md` imports it (`@AGENTS.md`) so Claude Code injects it. |
| `steering.routing_heading` | `"### Agent Selection"` | Triage and its critic cite it as the routing table. The script also inlines a lane table built from `lanes[]`, so this heading is a cross-reference, not the only source. |
| `steering.invariants_heading` | `"## Critical Constraints"` | The architect review: each `invariants[]` entry is a heading under this one. |
| `steering.anti_patterns_heading` | `"### LLM-Behavior Corrections"` | The review's test-proportionality step. The two anti-pattern definitions it relies on are inlined in the prompt regardless. |
| `steering.reference_heading` | `"## Reference"` | The scope template's pointer to key source files. |

### `git` and `ship`

| Key | Default | Meaning |
|---|---|---|
| `git.base_branch` | `"main"` | Branch setup pulls it; the PR targets it. |
| `git.remote` | `"origin"` | Pull, fetch, and push target. |
| `git.branch_prefixes` | `["feat", "fix"]` | Triage's `branch_prefix` enum; the branch is `<prefix>/<slug>`. The first prefix means "new capability", the second "correcting behaviour". With one prefix, every workstream uses it. At least one. |
| `ship.forge` | `"github"` | Only GitHub is implemented (`gh pr list/view/create`, `gh repo view`). See "Other forges" below. |
| `ship.remove_artifacts_after_pr` | `true` | `true`: ship commits the artifacts, links the spec by SHA permalink, then removes them from the branch tip (needs merge commits). `false`: the artifacts stay on the branch and merge into the base; the PR links the spec by branch path (use with squash or rebase merging). |

### `lanes[]` (at least one)

A lane is a routing domain: an independently tested surface with its own architect and dev.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `name` | string, kebab-case, unique | **R** | The lane token in `**Lane**:` and the triage `lane` enum. |
| `description` | string | **R** | One line, inlined into the triage lane table. |
| `architect` | string | **R** | `agentType` that drafts scope and spec and reviews this lane's phases. In the triage `architect` enum. |
| `dev` | string | **R** | `agentType` that implements phases. In the triage `dev` enum. |
| `other_agents` | string[] | `[]` | Further routable agents that belong to this lane (a lane docs agent). Reviewed by this lane's architect. |
| `paths` | string[] (globs) | **R** | What the lane owns; inlined into the triage lane table so routing is derivable from the tree. |
| `targeted_tests` | string | **R** | One sentence: the runner, the shape of a selection, the `cwd`, one real example. Inlined into the scoped-test policy, the spec critic, and the dev prompt. |
| `narrow_dirs` | string[] | `[]` | The only directories a phase may run whole, and only where its surface genuinely is that whole tier (typically a contract-test directory). |

### Agents outside lanes

| Key | Type | Default | Meaning |
|---|---|---|---|
| `unlaned_agents` | string[] | `[]` | Routable on a spec's `**Agent routing**:` line, never a triage `## AS` role, reviewed by the workstream's architect (`args.architect`). Typical: a docs agent. |

The **routable roster** is every lane's `architect`, `dev`, and `other_agents`, plus `unlaned_agents`. Every
name must resolve as an `agentType`: `<agents_dir>/<name>.md` with a matching `name:`, or the built-in
`general-purpose`.

### Tests

| Key | Type | Default | Meaning |
|---|---|---|---|
| `suites[]` | array | **R**, at least one | The full suites validate runs. Their commands are also forbidden during implement. |
| `suites[].name` | string, unique | **R** | Report label. |
| `suites[].lane` | string or null | `null` | Informational link to a lane. |
| `suites[].setup` | string | `""` | Run first, in the same shell (an environment activation). Empty = none. |
| `suites[].command` | string | **R** | The exact command. It must be correct with no flags added: suite membership belongs in the runner's configuration. |
| `suites[].cwd` | string | `"."` | Repo-relative directory to run from. |
| `suites[].timeout_ms` | integer, 1 to 1800000 | `600000` | The Bash timeout. **Above 600000** (the 10-minute foreground cap) the validate agent runs the suite with `run_in_background: true` and this timeout, and waits for the completion notification. 1800000 is the tool's hard limit; a suite stopped by its timeout is a failure. |
| `suites[].notes` | string | `""` | Runner caveats inlined verbatim (a tier that skips itself, "do not run the benchmarks"). |
| `whole_suite_patterns` | string[] | `[]` | Extra phrasings of "the whole suite" to forbid during implement, beyond the `suites[].command`s. |

### Judgment inputs

| Key | Type | Default | Meaning |
|---|---|---|---|
| `invariants` | string[] | `[]` | Names of the load-bearing invariants, each exactly a heading under `steering.invariants_heading`. The architect review judges every phase against them. With none, it judges against the spec's own `## Invariance` section. |
| `protected_guards` | string[] | `[]` | Guard-test kinds the review's test-proportionality step never flags. The script always appends "a source-shape guard that mechanizes an invariant no runtime test can observe". |
| `mandatory_tests[]` | `{when, requires, rule}` | `[]` | Tests a change still owes even under "a move or rename owes no new test". `rule` (optional) names the rule file the dev agent is told to open by name. Omitted from the dev prompt entirely when empty. |

### `models`

Values are model names the Claude Code `model` option accepts (`fable`, `opus`, `sonnet`, `haiku`). Every
agent call sets its model explicitly from here, so agent frontmatter `model:` is ignored by the pipeline.

| Key | Default | Calls |
|---|---|---|
| `triage` | `opus` | triage draft and revise |
| `scope` | `opus` | scope plan, partition drafters, synthesizer, and reviser |
| `spec` | `fable` | spec plan, partition drafters, synthesizer, and reviser |
| `critic` | `opus` | every document critic, including the scope and spec lens critics and scoped re-checks |
| `impl` | `opus` | phase dev agents |
| `check` | `opus` | per-phase criteria checker |
| `review` | `opus` | per-phase architect review |
| `commit` | `sonnet` | per-phase committer (stages, writes the message, commits) |
| `validate` | `sonnet` | full-suite runner |
| `escalation` | `fable` | what the command sets `implModel` to when you ask to escalate |

## What the script builds from the config

- **Enums**: `lane` from `lanes[].name`; `architect` and `dev` from `lanes[].architect`/`dev`; `branch_prefix`
  from `git.branch_prefixes`. A single lane yields one-element enums, which are valid.
- **The lane table** inlined into triage: each lane's description, owned paths, architect, dev, and other
  agents; the unlaned agents; and "`manual` is not a routed outcome".
- **The scoped-test policy** (`SCOPED_TESTS`): the narrow directories, one `targeted_tests` line per lane, and
  the forbidden list (every `suites[].command` with its `cwd`, plus `whole_suite_patterns`).
- **Review routing**: an agent is reviewed by the architect of the lane that lists it; an unlaned agent by
  the workstream's architect.
- **Paths**: every artifact and template path from `specs_dir`; role sentences from `agents_dir`; the rules
  instruction from `rules_dir`.

## Recipes

### Single lane

One entry in `lanes[]`. Triage still verifies that the target region falls inside the lane's `paths` and
blocks if it does not. Template lines list the one lane: `**Lane**: [app | unresolved]`.

```json
"lanes": [{
  "name": "app",
  "description": "The whole service under src/.",
  "architect": "app-architect",
  "dev": "app-dev",
  "paths": ["src/**", "tests/**"],
  "targeted_tests": "pytest <file or node id> -q from the repo root, e.g. pytest tests/unit/test_parser.py -q"
}]
```

### No custom agents

Set `architect` and `dev` to `general-purpose` (always available). It works, but prompts lose
lane-specific context, and when several lanes share `general-purpose` review routing falls back to the
workstream's architect. Creating lean agents from `starter-kit/agents/` is the recommended default.

### Squash-merge or rebase-merge repositories

`"ship": { "forge": "github", "remove_artifacts_after_pr": false }`. The artifacts merge with the PR; delete
them in a later cleanup when you no longer want them on the base branch.

### Suites longer than 10 minutes

Set `timeout_ms` to about twice the observed duration (cap 1800000). The validate agent switches to a
background run automatically. A suite longer than 30 minutes must be split into several `suites[]` entries
(by directory or marker), each under the cap.

### Extra suites

Add more `suites[]` entries: an end-to-end suite, a lint or type-check pass that must be green before ship
(`"command": "npx tsc --noEmit", "cwd": "web"`). Each is run once at validate and forbidden during
implement. That second half is the trade-off: a fast whole-project check listed here can no longer be run
inside a phase. Leave it out of `suites[]` if phases should be free to run it (validate then never runs
it), or list it and let validate catch what phases could not.

### Different branch prefixes

`"branch_prefixes": ["feature", "bugfix"]`. Update the triage template's `**Branch**:` line to match.

### Other forges

Only GitHub is implemented. For another forge, the places to adapt are the command's Step 2 rules 1-2 (PR
lookup) and Step 7 (push, PR creation, permalink format). Keep `ship.forge` at `"github"` until the command
supports another value.
