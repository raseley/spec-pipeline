<!--
Paste-in steering section for spec-pipeline, filled in for the example project "Orderly".
Merge it into your CLAUDE.md (or AGENTS.md imported from CLAUDE.md); never paste it blindly:
  - Where your file already has an equivalent section, extend that section and point
    .claude/spec-pipeline.json "steering.*" at your existing heading instead of adding a duplicate.
  - Replace every Orderly fact (paths, invariants, agents, commands) with your project's own.
  - Keep, verbatim, the two anti-pattern names marked "cited by the pipeline".
  - Keep the rule-loading caveat paragraph; adjust only the examples in it.
Headings are an interface: the pipeline cites them by name (see docs/steering.md). Delete this comment
after merging.
-->

# Claude Configuration

Engineering constraints for LLM-assisted development on Orderly, an order-management web app: a Python/FastAPI API under `api/` that owns orders, refunds, and tenants, and a TypeScript/React client under `web/`. Violations leak data across tenants, corrupt money, or break deployments. For detailed patterns, examples, and templates, see the per-topic docs under `api/docs/patterns/` (index: `api/docs/patterns/README.md`) and `web/docs/patterns/` (index: `web/docs/patterns/README.md`).

Rules under `.claude/rules/` are path-scoped by a `paths:` frontmatter field: each one loads when the **Read tool** opens a file matching one of its patterns — not at launch, and not on every tool use. Four consequences are accepted deliberately: a rule is absent until a matching file is read; after `/compact` it reloads only on the next matching Read; *creating* a new matching file does not load its rule, so an agent authoring a new route, component, or contract test from scratch should read a sibling of the same kind first; and reaching a matching file through Bash (`cat`, `head`, `sed -n`, `grep`) does **not** load its rule either, so a session mode that steers agents away from the Read tool suppresses path-scoped delivery almost entirely — look at the session mode, not the frontmatter, when a rule is mysteriously absent.

---

## Critical Constraints

### Money as Integer Cents

Every monetary amount is an `int` number of cents, named `*_cents` (`amount_cents`, `captured_cents`, `refunded_cents`).

| Context | Representation |
|---|---|
| Models and database columns | `int` cents |
| API request and response bodies | `int` cents; never `float`, never `Decimal` across the API boundary |
| Web client | integer cents until render; format only in the view |

- **Do**: convert at the edge with the helpers in `api/models/money.py`.
- **Don't**: `float(...)` or `Decimal(...)` applied to a `*_cents` value; arithmetic on formatted strings.
- **Enforced by a PostToolUse hook** and by the source-shape guard `api/tests/contract/test_money_types.py`.

Key file: `api/models/money.py`.

### Tenant Scoping

Every route reads data through the `require_tenant` dependency (`api/deps/tenant.py`): `tenant: Tenant = Depends(require_tenant)`. No query touches rows outside the caller's tenant, including counts and existence checks.

Key file: `api/deps/tenant.py`.

### Background Job Payloads

A job payload (`api/jobs/payloads.py`, e.g. `RefundNotificationPayload`) holds IDs and plain dicts only. It is legal only because it holds no ORM object and no session: the job re-reads what it needs inside its own tenant scope. New or moved job entry points owe the payload-isolation contract test `api/tests/contract/test_job_payloads.py`.

### Migrations Are Additive

A migration under `api/migrations/` adds columns or tables with defaults. A destructive change (drop, rename, type change) takes two migrations across two releases and the contract test `api/tests/contract/test_migrations.py`.

---

## Testing Requirements

Test tiers: **Unit** (`api/tests/unit/`, domain logic), **Integration** (`api/tests/integration/`, routes with a real database), **Contract** (`api/tests/contract/`, the guards below), **Performance** (`api/tests/perf/`, explicit run only: it skips itself unless targeted), and **Web** (Vitest under `web/tests/`).

**Required contract tests**: a new or altered migration owes `api/tests/contract/test_migrations.py`; a new or moved job entry point owes `api/tests/contract/test_job_payloads.py`. See `api/docs/patterns/testing.md` and the path-scoped rules for specifics.

Targeted runs: `pytest api/tests/unit/test_refunds.py -q` from the repo root; `npx vitest run tests/orders/OrderTable.test.tsx` from `web/`. Full suites: `pytest api/tests/ -q` (about 6 minutes) and `npx vitest run` from `web/` (about 3 minutes).

---

## Anti-Patterns

### LLM-Behavior Corrections
- **Never use git worktrees** — do not use `EnterWorktree`, do not set `isolation: "worktree"` on Agent calls. Always work directly on the current branch.
- **Never use git stash** — do not run `git stash` or any `git stash` subcommand. Commit or discard changes instead.
- **Creating unnecessary files** — prefer editing existing files
- **Creating documentation proactively** — only when explicitly requested
- **Adding features beyond request** — only make requested changes; no "while I'm here" additions
- **Premature abstractions** — three similar lines beats a premature helper
- **Tests a wrong program passes too** — don't assert a symbol exists, lives in a given file, or equals its own literal; call it and assert what it returns *(cited by the pipeline)*
- **Source-shape assertions with no named invariant** — reading production source text only where no runtime test can observe the invariant (the integer-cents guard); otherwise assert behavior *(cited by the pipeline)*
- **Tests over `docs/specs/` prose** — a spec is not a runtime input
- **A new file or symbol as the test trigger** — the trigger is a new behavior; a move or rename owes none
- **Docstrings for unchanged code** — only document what you modify; drive-by docs create noise in diffs
- **Naming things "enhanced"/"new"/"updated"** — name for what the thing is

### Architecture Violations
- **A route without `require_tenant`** — every data read is tenant-scoped
- **ORM objects in a job payload** — IDs and plain dicts only
- **Floats for money** — integer cents everywhere

---

## Workflow & Agent Routing

`/spec-pipeline` drives a workstream through triage → scope → spec → implement → validate, writing each stage's artifact under `docs/specs/`; reach for it when a request is large enough to want that written record (details in `.claude/commands/spec-pipeline.md`).

### Agent Selection

| Task Type | Agent | When |
|---|---|---|
| API structural decisions, data model and route design | api-architect | Design decisions, spec issue resolution, architectural tradeoffs |
| API implementation, bug fixes, tests | api-dev | Specification is clear |
| Web component and state design | web-architect | UI/state design decisions, architectural tradeoffs |
| Web implementation, React/TypeScript code | web-dev | Specification is clear |
| Documentation for either lane | docs-writer | Code exists to document |

### Prompt Structure for Specialists

Every prompt must include: **target region** (concrete success criteria), **scope boundary** (in AND out), **grounded file paths** (specific files, not "the module"), **standards references** (specific `CLAUDE.md` sections, rules shims, or pattern docs by name).

**Architect agents**: Product context, technical context (file paths), constraints, design request, success criteria, scope (in/out).

**Dev agents**: Context, specification (from the architect if applicable), applicable standards (by section name), file targets, test expectations, scope boundary (what NOT to build).

**Docs agents**: Audience, purpose, source material (code paths), format, style reference (an existing doc to match).

---

## When Exceptions Are Appropriate

- Does this violate an **engineering constraint** (tenant leak, money corruption, a destructive migration)? → Strong justification required.
- Or a **stylistic pattern** (naming, organization)? → May have good exceptions.

**Acceptable**: literal amounts in test fixtures, abbreviated names in small scopes, minimal docs for private internals.

**When in doubt**: Follow the standard.

---

## Reference

Consult the doc under `api/docs/patterns/` or `web/docs/patterns/` based on what you're working on:

| Working On | Read Doc |
|---|---|
| Money, amounts, currency formatting | `api/docs/patterns/money.md` |
| Background jobs, payloads | `api/docs/patterns/background-jobs.md` |
| API tests, contract guards | `api/docs/patterns/testing.md` |
| Web tests (Vitest, Testing Library) | `web/docs/patterns/testing.md` |
| Web components, state, styling | `web/docs/patterns/README.md` |

Key source files (a pointer, not a menu):
- **api/models/money.py** — integer-cents helpers
- **api/deps/tenant.py** — `require_tenant`, the tenant dependency
- **api/models/order.py**, **api/models/refund.py** — `Order`, `Refund`, `RefundResponse`
- **api/jobs/payloads.py** — job payload shapes
- **web/src/api/client.ts** — the typed API client

## Environment Setup

- Python commands run from the repo root with the project's virtual environment active.
- Web commands run from `web/` after `npm ci`.
- **Git pre-commit hook**: `git config core.hooksPath .githooks` (mirrors the money-literal PostToolUse hook on commit).

---

## Critical Recall

These are the constraints with the highest violation cost:

| Constraint | Violation Consequence |
|---|---|
| Every route reads through `require_tenant` | Cross-tenant data leak |
| Money is integer cents | Rounding errors in refunds and totals |
| Job payloads hold IDs and plain dicts only | Stale or detached objects in jobs; session leaks |
| Migrations are additive | Downtime or data loss on deploy |
| No worktrees, no `git stash` | Changes invisible to the agents that verify them |
