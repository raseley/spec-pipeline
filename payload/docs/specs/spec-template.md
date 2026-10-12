# [Feature/Change Name] Specification

**Date**: [YYYY-MM-DD]
**Status**: Draft
**Source**: [issue link, scope artifact at `docs/specs/<slug>-scope.md`, or hand-seeded]

<!-- ADOPT: This template assumes the defaults `specs_dir: docs/specs`, `steering.file: CLAUDE.md`, `agents_dir: .claude/agents`, and `rules_dir: .claude/rules`; if .claude/spec-pipeline.json sets any of them differently, replace every occurrence in this template. Then delete this marker. -->
<!--
SPEC TEMPLATE for workstreams in this repository. The rules in these comments
come from "The Geometry of Intent". You do not need to read it to fill this in.

This template structures the spec written at the end of the triage → scope →
spec progression. The spec is the source of truth that drives implementation.

The spec lands at `docs/specs/<slug>.md`. The implement stage does not read it
as prose. From each phase it copies four fields into the implement prompts:
the phase title, its `**Agent routing**:` line, its `#### Scope`, and its
`#### Acceptance Criteria`. No other spec text reaches those prompts verbatim.
Three readers receive different parts:

  - The dev agent receives `#### Scope` inlined, plus an instruction to open
    this file at its own phase heading. It treats `#### Scope` as the
    boundary it must not work outside. It is not a summary.
  - The criteria checker receives `#### Acceptance Criteria` alone. It is
    never told to open the spec. It cannot see the phase around the criteria.
    Its verdict halts every later phase in the workstream.
  - The architect reviewer receives the whole file, but only after the
    criteria check has passed. It cannot rescue a phase whose criteria block
    failed.

Everything above `## Implementation Plan` reaches the implement stage only
when an agent chooses to open the file. Write each phase block for the agents
that receive it copied. Write the sections above it for the reader who opens
the file.

The spec ends at `## Open Questions`.

The three `**Key**: Value` lines under the H1 are the spec frontmatter. They
form one contiguous block between the H1 and the first `##` heading. Keep all
frontmatter fields inside this block. `Status` advances from `Draft` to
`Final` when the spec is approved for implementation.

Delete all HTML comments before finalizing.
-->

## Executive Summary

<!--
Write 2-3 paragraphs that define what the work must produce.

A reader who stops here should be able to:
  1. State what changes and why
  2. Describe what "done" looks like in concrete terms
  3. Decide whether this spec is relevant to their work

Diagnostic check: If an agent read only this section, would it understand the
problem well enough to ask the right clarifying questions? If not, the summary
is too vague.

Ground the summary in observable behavior on the surfaces of this repository.
"A concrete surface of this repository" means a repo-rooted path, a symbol, a
route, a test id, or a command's output. The kinds this repository has are
listed next; every later rule that asks for such a surface means one of them.
-->
<!-- ADOPT: List the kinds of concrete surface this repository exposes (routes, fields, records, payload keys, migrations, test ids, components, commands). Replace the example below with one from this repository, then delete this marker. -->
<!--
The surfaces of this repository: a route under `/api/v1/` and its response
body, a Pydantic model field, an `Order`/`Refund` model attribute, a job
payload key in `api/jobs/payloads.py`, a migration revision under
`api/migrations/`, a pytest node id under `api/tests/`, a Vitest test case
under `web/tests/`, or a React component prop under `web/src/`.
-->
<!--
Avoid abstractions that could equally describe any other codebase built on the
same stack.
-->

[Describe the current problem in concrete terms — what breaks, what's missing,
what's suboptimal — anchored in observable behavior of the surfaces this work
touches. Then state the proposed change and its expected effect on the same
surfaces.]

### Goals

<!--
List the outcomes the work must reach.

Number the goals. Write one goal per distinct, independently verifiable
outcome. The number of goals follows from the work, not a target. Do not pad
to a count. Do not collapse distinct outcomes. Use the pattern:
"[Action verb] [specific thing] — [observable consequence]"
-->
<!-- ADOPT: Give one vague goal and one good goal from this repository that names a real check and its observed number. Replace the examples below with ones from this repository, then delete this marker. -->
<!--
Bad: "Refunds are robust" (too vague — robust against what? on which route?
      for which amounts?)
Good: "`POST /api/v1/orders/{order_id}/refunds` rejects a refund that would
       push the refunded total past the captured total — verifiable by
       `test_refund_exceeds_captured` in `api/tests/unit/test_refunds.py`
       (observed: 0 such tests exist today)."
-->
<!--
Every path in a goal is a path you resolved in the tree. This includes the
paths inside a worked example. Do not cite a test module that does not exist.

A goal is one short paragraph. When its observable condition is a grep, a
count, or a list of files, name the check in a few words and state the number
observed today. Do not put the full recipe in a goal: the exact command
pipeline, the fixture wiring, the patched methods, or the assertion text. That
recipe belongs in `#### Acceptance Criteria` of the phase that delivers the
goal, which is the only spec text the criteria checker reads.

Goals must be expressible as observable conditions on a concrete surface of
this repository (one of the kinds listed in the `## Executive Summary`
comment), a named test's assertion, or a benchmark threshold.
-->

1. **[Goal]** — [why this matters; observable condition that confirms it]

### Non-Goals

<!--
List the adjacent work this spec excludes.

Non-goals stop the agent from solving problems you did not ask about.

The number of non-goals follows from the work, not a target. Do not pad to
reach a count. Do not collapse distinct exclusions to stay under one. A spec
whose goals reach nothing adjacent has few non-goals, and that is a correct
spec.

A non-goal names something an implementing agent could plausibly reach from
this spec's own numbered goals. It is an adjacent surface that a reasonable
reading of goal N would extend into. Do not use this section to restate an
invariant the repo holds regardless. A standing invariant (one of the headings
under `CLAUDE.md` -> *Critical Constraints*) is true of every workstream here
and excludes nothing goal N made reachable. If the goals genuinely put an
invariant at risk, address it in `## Proposed Design`, where the design has to
answer for it.

State the exclusion at the granularity you would defend it: a path, a symbol,
or a line range — not a subsystem noun.

Pattern: "[Thing a goal above could plausibly reach] — [why it's excluded or
deferred]"
-->

- [Thing explicitly out of scope] ([reason — future work / separate spec / not needed])
- [Thing explicitly out of scope] ([reason])

### Dependencies

<!--
List what must exist before this work begins.

List the specs, features, or code paths this work depends on. If one spec
produces an artifact a later spec consumes, state the dependency direction.
State what crosses the boundary.
-->
<!-- ADOPT: List the boundaries a change in this repository commonly crosses, each with its real path. Replace the example below with one from this repository, then delete this marker. -->
<!--
In this repository, common boundaries are: a new Pydantic response model
under `api/models/<resource>.py`, a new route under
`api/routes/<resource>.py`, a new background job payload in
`api/jobs/payloads.py` consumed by a job such as `api/jobs/notify.py`, a new
column added by a migration under `api/migrations/`, a new field on the
`Order` or `Refund` model, a new call in `web/src/api/client.ts`, or a
new component or hook under `web/src/`.
-->

- **Depends on**: [spec / feature / module] — [what it provides that this spec consumes]
- **Depended on by**: [spec / feature / module] — [what this spec provides downstream]

---

## Terminology

<!--
Define the vocabulary the spec relies on.

Define terms where the spec uses words that have meaning specific to this
codebase or the domain it models. Some words have precise internal meanings
that differ from casual usage:
-->
<!-- ADOPT: List three to five words with a precise meaning in this repository's domain that differs from casual usage. Replace the examples below with ones from this repository, then delete this marker. -->
<!--
  - "order" — a customer's purchase, the resource behind `/api/v1/orders`;
    not a sort order.
  - "captured total" — the amount actually charged for an order, in integer
    cents; the ceiling every refund is measured against. Not the order's
    list price.
  - "refunded-so-far" — the sum of `amount_cents` over an order's refunds; it
    never exceeds the captured total.
  - "tenant" — the merchant account a request acts for, resolved by
    `require_tenant` in `api/deps/tenant.py`; not a user.
-->
<!--
Define additional terms only where the spec uses domain-specific vocabulary or
everyday words with precision that differs from casual usage.

Skip this section if all terms are obvious from context.
-->

| Term | Definition | Example |
|------|------------|---------|
| **[Term]** | [Precise definition in this context] | [Concrete instance from this repo] |

---

## Current State

<!--
Ground the problem in specific code.

An agent that starts from the wrong code will not reach the right solution.

Requirements:
  - Specific file paths (not "the service layer")
  - Concrete examples of the problem behavior (not "it sometimes fails")
  - Real artifacts where possible — a data slice, a field listing, a route
    response body, a job or message payload, a stored record, a test fixture,
    a test case.

Name a path only where you can state the symbol or line range the change must
touch. You must also state the behavior observed there today. A path you
cannot pin to a symbol is a path you have not read. This section has no list
of paths on purpose. Derive the paths from this workstream.

Resolve every path against the tree at the commit you are writing on. A dead
path is worse than no path. It sends the implementing agent to a file that
does not exist.

Diagnostic check: Could an agent who has never seen this codebase find the
relevant code from this section alone?
-->

<!-- ADOPT: Show the **Files** placeholder and the table's example input with real paths and a real call from this repository. Replace the examples in the subsection below with ones from this repository, then delete this marker. -->
### [Subsystem/Component Name]

**Files**: `api/routes/<resource>.py`, `web/src/<area>/<Component>.tsx`

[Describe how this component currently works. Include concrete examples — data
flows, edge cases, failure modes. Use tables for structured comparisons.]

| Input | Current Behavior | Expected Behavior |
|-------|------------------|-------------------|
| [concrete input — e.g., a `POST /api/v1/orders/{order_id}/refunds` whose `amount_cents` exceeds what remains of the order's captured total] | [what happens now] | [what should happen] |

### Problems Summary

<!--
List one entry per distinct problem the work addresses. The number of entries
follows from the work, not a target. Each problem should trace to a specific
goal above.
-->

1. **[Problem name]**: [Description grounded in specific code behavior]

---

## Proposed Design

<!--
Describe the design in full. This is the core of the spec.

This section must be specific enough that an architect-style agent can
evaluate tradeoffs. It must also be specific enough that a dev-style agent can
implement without ambiguity. Order information by dependency: principles
before mechanisms, mechanisms before details.

For each design element, provide:
  - what changes (the mechanism)
  - why this approach over alternatives (the reasoning)
  - how it interacts with existing code (the integration points)

Do not restate `CLAUDE.md` here. Cite it by section heading. Cite a section
only where you can name (a) the surface in this design the invariant
constrains and (b) the runtime symptom its violation produces. An invariant
you cannot tie to both is one this design does not touch. Naming it spends
reader attention and rules out changes the work may need. Restated invariants
drift: this block once carried a full restatement of them, and two of the
invariants had silently diverged from `CLAUDE.md` before anyone checked.

Shape-defined invariants are the one case to state in full, because the rule
is about a payload type rather than a heading. Where the design adds or
changes a path governed by one, name the shape you propose and state the
sentence that makes it legal. The shape enforces the invariant. Nothing else
prevents a violation.
-->
<!-- ADOPT: Name this repository's shape-defined invariant (if it has none, delete the example comment block below together with this marker, and keep the general paragraph above), the sentence that makes a shape legal, its exemplar type, and the steering and rule files that price it. Replace the example below with one from this repository, then delete this marker. -->
<!--
In this repository the shape-defined invariant is the background job payload.
Where the design adds or changes a background job, name the payload you
propose for `api/jobs/payloads.py`. State the sentence that makes it legal: it
holds IDs and plain dicts only, never an ORM object or a session, so it
survives serialization onto the job queue and the job reloads what it needs
under its own session. A record type (`RefundNotificationPayload`) and a plain
dict both satisfy that. See `CLAUDE.md` -> *Critical Recall*, which prices a
violation, and `.claude/rules/background-jobs.md` for entry-point conventions.
-->

### Core Principle

[State the single organizing idea behind the design. Every other decision in
this section should follow from it.]

<!-- ADOPT: Replace the Files affected line, the code shape, and the layer and exemplar names in the comment that follows it with this repository's own canonical shapes, each copied from a real file (a template shape no file matches gets copied into the spec and then contradicted). Replace the example below with one from this repository, then delete this marker. -->
### [Design Element 1]

**Files affected**: `api/models/<resource>.py`

[Describe the change. Include formulas, pseudocode, type definitions, or state
transitions when prose would leave room. Example signature shape:]

```python
# api/models/refund.py

from pydantic import BaseModel


class RefundResponse(BaseModel):
    """Wire schema for one refund.

    Named by ``response_model=`` on ``POST /api/v1/orders/{order_id}/refunds``.
    """

    refund_id: int
    order_id: int
    amount_cents: int
    refunded_total_cents: int
```

<!--
Keep two layers. The ORM model `Refund` in `api/models/refund.py` is the
stored row. `RefundResponse` is the wire schema, and it is what
`response_model=` names. Never return the ORM model from a route. State which
layer each new type belongs to.

If the design adds a background job entry point, do not invent a shape for it.
Cite the real exemplar at `path:line`. State how your entry point differs from
it. The notification job in `api/jobs/notify.py` is the live entry point. It
is the shape a dev agent will copy. A template shape that no file in the tree
matches gets copied into the spec and then contradicted by the first file the
implementer opens.
-->

<!-- ADOPT: Replace the Files affected line and the canonical route or entry-point shape below with this repository's own, copied from a real file. Replace the example below with one from this repository, then delete this marker. -->
### [Design Element 2]

**Files affected**: `api/models/<resource>.py`,
`api/routes/<resource>.py`, `web/src/<area>/<Component>.tsx`

[Continue for each distinct design element. Order by dependency — if element 2
depends on element 1, it comes second.]

If the design touches the API surface, show the canonical route shape:

```python
# api/routes/refunds.py

from fastapi import APIRouter, Body, Depends

from api.deps.tenant import Tenant, require_tenant
from api.models.refund import RefundResponse

router = APIRouter(prefix="/api/v1", tags=["refunds"])


# Tenant scoping is the dependency, not an in-body call:
# require_tenant (api/deps/tenant.py) resolves the caller's tenant and
# rejects the request before the handler body runs.
@router.post("/orders/{order_id}/refunds", response_model=RefundResponse)
async def create_refund(
    order_id: int,
    amount_cents: int = Body(..., embed=True),
    tenant: Tenant = Depends(require_tenant),
) -> RefundResponse:
    ...
```

### System Boundaries

<!--
State what this design touches and what it does not.

Explicit boundaries stop the agent from extending the design into adjacent
systems. Use two subsections: what the design does affect and what it does
not affect.

"Does Not Affect" names surfaces this design comes close enough to touch: the
module one import away, the model the route reads but does not change, the
field adjacent to the one being added. It is not a list of repo-wide
invariants. Those hold whether this spec mentions them or not. Restating them
here spends the reader's attention on surfaces the work never opened.
-->

#### This Design Affects

- [Module / route / type / data field / job or worker entry point / migration / UI component] — [how and why]

#### This Design Does Not Affect

- [Module / surface] — [why it's excluded despite apparent proximity]

---

## Alternatives Considered

<!--
List the approaches the design deliberately rejected.

Recording rejected alternatives keeps the implementing agent from sliding
into the obvious answer the problem suggests and "rediscovering" it
mid-implementation. This section does not say what would prove the design
wrong. That is `## Invariance` below, and this section does not substitute
for it.

Name each alternative concretely enough that an agent recognizes it as the
thing it was about to propose.
-->

### [Alternative Name]

[Describe the alternative. Explain why it was rejected. Where it breaks an
invariant, name the invariant by its `CLAUDE.md` section heading.]

---

## Invariance

<!--
State what would prove this design wrong. This is the one place the spec
says so. The architect reviewer at the implement stage drops any concern it
cannot tie to a named spec section. A spec without this section leaves that
reviewer unable to say the design is wrong under a different frame.

Write three parts, one or two sentences each:

  1. **Reframing**: one frame genuinely independent of the one that produced
     the design. From "make this correct", reframe as "explain why the
     current behavior was ever acceptable". From "make this fast", reframe as
     "explain what this costs at 10x data volume".
  2. **Surviving claim**: what must still hold under that reframing. State it
     so its negation is a sentence someone could assert.
  3. **Falsifier**: one concrete observation that would defeat the claim: a
     route response, a stored value after N operations, a named test that
     would fail, a benchmark threshold, a command's output.

If you cannot state a falsifier, do not invent one. Write
"**Falsifier**: not yet identified". Raise the gap in `## Open Questions`.
-->

**Reframing**: [The independent frame the design must survive]

**Surviving claim**: [What must still hold under that reframing]

**Falsifier**: [One concrete observation on a concrete surface of this
repository that would defeat the claim]

---

## Implementation Plan

<!--
Order the phases by dependency.

Each phase should:
  - Produce a working system (no phase leaves the codebase broken)
  - Have explicit scope IN and scope OUT
  - Include its own test work, where it has any (tests do not trail the
    implementation, and a phase that changes no behavior owes none)

The `**Agent routing**:` line is machine-read to pick the subagent for the
phase. It is exactly one bare agent name from the roster in
`.claude/spec-pipeline.json`: every `lanes[].architect`, `lanes[].dev`,
`lanes[].other_agents`, and `unlaned_agents` entry, each defined under
`.claude/agents/` where the project ships a definition. The placeholder on the
Phase 1 routing line below lists them. It carries no parenthetical.
It carries no trailing clause. It carries no second name. Move any
qualification into the phase's Scope. A phase that genuinely needs two agents
is two phases. There is no `manual` routing: nothing in `.claude/agents/`
answers to it and the stage cannot run it.

Architect agents own design decisions. Dev agents own implementation. Docs
agents own authored documentation. Do not introduce phase numbers into
identifiers, filenames, comments, or docstrings. Phase numbers belong to the
spec narrative, not the source.

Write each phase for its narrowest reader. The dev agent is told to open this
file at its own phase heading, so it can see the phase around its Scope. The
criteria checker cannot. It receives `#### Acceptance Criteria` as
free-standing text and nothing else. The criteria block in particular must
therefore stand on its own. See the rules under `#### Acceptance Criteria`
below.
-->

### Phase 1: [Short Imperative Name]

**Goal**: [One sentence — what's true after this phase that wasn't true before]

<!-- ADOPT: List every routable agent from .claude/spec-pipeline.json (every lane's architect, dev, and other agents, then every unlaned agent), separated by " | ". Replace the example names on the line below with this repository's, then delete this marker. -->
**Agent routing**: [exactly one of: api-architect | api-dev | web-architect | web-dev | docs-writer]

**Depends on**: [Prior phase | None]

#### Scope

<!--
This block is inlined into the dev agent's prompt verbatim. The agent treats
it as the boundary it must not work outside. List repo-rooted paths. Do not
refer to them indirectly. "the new model", "the affected routes", and "the
frontend surfaces" name nothing the agent can bound its work by. Write the
paths.
-->

<!-- ADOPT: Rewrite the e.g. examples in this phase's IN, OUT, Tasks, Tests, and Acceptance Criteria placeholders as one coherent worked phase from this repository, keeping every rule in the comments. Replace the examples below with ones from this repository, then delete this marker. -->
**IN**: [Specific files and behaviors — e.g., "in `api/routes/refunds.py`,
reject a refund whose `amount_cents` would push the order's refunded total past
its captured total; add `refunded_total_cents: int` to `RefundResponse` in
`api/models/refund.py`; keep `Depends(require_tenant)` as the route's only
tenant check"]

**OUT**: [What this phase explicitly does not touch — e.g., "does not modify
`api/jobs/notify.py` or `RefundNotificationPayload` in `api/jobs/payloads.py`;
does not add a migration under `api/migrations/`; does not touch `web/src/`"]

#### Tasks

<!--
List the tasks. Each task should reference a specific file. Each task should
describe the change at a level where the agent can implement without guessing.
Prefer
concrete signatures, route paths, field listings, entry-point signatures, and
test names over prose.
-->

1. [Task — e.g., "Add `refunded_total_cents: int` to `RefundResponse` in
   `api/models/refund.py`"]
2. [Task — e.g., "In `create_refund` in `api/routes/refunds.py`, sum the
   order's existing refunds' `amount_cents` and reject with HTTP 422 when the
   new refund would push that sum past the order's captured total; read the
   order only through `tenant: Tenant = Depends(require_tenant)`"]
3. [Task — e.g., "Keep every amount an `int` of cents through
   `api/models/money.py`; no `float()` or `Decimal()` applied to a `*_cents`
   value"]

#### Tests

<!--
Tests are part of the phase, not a follow-up. The tiers and their boundaries
are in the lane's testing pattern doc, cited in `## Standards References`
— do not restate them here.

Cardinality follows Scope IN, in both directions. One test line per behavior
this phase's `**IN**` commits to — no fewer, and no more. A phase whose IN
names four observable changes and whose Tests names one is under-specified. A
phase whose Tests names six lines for those same four behaviors is
over-specified: collapse the lines that assert one behavior through several
code objects into the one line that asserts the behavior. A new file, a new
class, a moved function, and a renamed symbol are not behaviors and earn no
line of their own. The mandated contract tests named below and any standing
structural guard this phase's IN commits to sit outside this count — they are
separate obligations, not duplicate lines.

Every test line names what it catches. Write each line as
`path::test_name — fails when <the specific condition it catches>`. For a
behavioral test that condition is a wrong outcome, never a restatement of the
code: "fails when the function is not in this file" and "fails when the symbol
is renamed" name a location, and a correct and an incorrect program pass them
equally. Rewrite such a line against the behavior the change was supposed to
preserve, or replace it with the covered-by form — do not simply drop it.

Structural guards are exempt. A payload-isolation check, a schema or
storage-format round trip, a fields-vs-declaration or enum-closure guard, an
accessor- or enum-coverage audit, a manifest-drift audit, a "no bare call
site" audit: these assert a code shape on purpose, and their failure is drift
rather than a wrong runtime outcome. Such a line still fills the clause and is
never removed for asserting a shape. If a line is one of these, say which
guard it is; otherwise fix the clause.
-->
<!-- ADOPT: Name this repository's guard inventory (from `protected_guards`) and its mandatory contract tests (from `mandatory_tests`), with real paths and rule files; where a list is empty, say so in one sentence instead ("This repository has no standing structural guards."). Replace the example below with one from this repository, then delete this marker. -->
<!--
This repository's guards, maintained by name under `api/tests/contract/`: the
job-payload isolation contract test (`api/tests/contract/test_job_payloads.py`),
the additive-migration contract test
(`api/tests/contract/test_migrations.py`), and the integer-cents source-shape
guard (`api/tests/contract/test_money_types.py`). Such a line fills the clause
like this: "fails when a job payload carries an ORM object", "fails when a
migration drops a column in one step", "fails when a `*_cents` field is typed
`float`".

Mandatory contract tests. A change that adds or alters a database migration
owes an additive-migration contract test in
`api/tests/contract/test_migrations.py` (defined in
`.claude/rules/migrations.md`). A change that adds or moves a background job
entry point owes a payload-isolation contract test in
`api/tests/contract/test_job_payloads.py` (defined in
`.claude/rules/background-jobs.md`). These are owed even where the covered-by
form below would otherwise be a complete answer.
-->
<!--
Covered-by is a complete answer. If an existing test already fails when that
condition occurs, write `Covered by <path::test_name> — no new test` instead of
a new line — after opening that test and confirming it does, not from its name.
For a phase whose only change is a move, a rename, or a re-home, that form — or
the unfillable form below — is the expected content of this block, not a
shortfall in it.

Test names follow the naming convention in the lane's testing pattern doc.
Assertions over results whose order is not guaranteed (parallel execution,
unordered queries) sort nondeterministic results by a stable key first.

Unfillable form. A phase with genuinely no test surface — a docs-only phase, a
comment-only change — writes "No test surface: [one clause saying why]" rather
than an empty block or a padded assertion. If you cannot write that clause
honestly, the phase has a test surface you have not found.
-->

- [ ] [Test description — what it verifies and where it lives, e.g.,
      `api/tests/unit/test_refunds.py::test_refund_exceeds_captured — fails when a refund pushing the refunded total past the captured total is accepted`]
- [ ] [Test description — e.g., `api/tests/unit/test_refunds.py::test_partial_refund_reports_refunded_total — fails when refunded_total_cents differs from the sum of the order's refunds`]
- [ ] [Test description — e.g., `Covered by api/tests/contract/test_money_types.py — no new test` for the integer-cents guard]

#### Acceptance Criteria

<!--
TARGET REGION for this phase — concrete, verifiable conditions. Each criterion
should be checkable by reading a file, calling a route, parsing a response
field, or running a TARGETED test selection.

EVERY CRITERION MUST BE ADJUDICABLE FROM ITS OWN TEXT PLUS THE WORKING TREE.
This block is the only spec text the criteria checker receives, and its verdict
halts every later phase. So: no "Phase N" — it cannot see the other phases; no
`## Section` reference — it was not given the file; no "the new field" or "the
model above" — name the path and the symbol. A criterion it cannot honestly
pass or fail is one it must guess at, and a wrong guess blocks the workstream.
-->
<!-- ADOPT: Name this repository's narrow tier directories (from `lanes[].narrow_dirs`, or say none is configured) and its whole-suite invocations (every `suites[].command` with its cwd, and every `whole_suite_patterns` entry). Replace the example below with one from this repository, then delete this marker. -->
<!--
SCOPE EVERY TEST RUN. A criterion names specific test modules or node ids, or
at most one narrow tier directory (`api/tests/contract/`) where the phase's
surface genuinely is that whole tier. Never write `pytest api/tests/`, a bare
`pytest`, or `npx vitest run` with no path into a phase's criteria.
-->
<!--
The whole-suite regression run belongs to the pipeline's validate stage, which
runs it ONCE for the finished workstream. A phase that copies it pays that run
twice per phase — the dev agent runs it to self-verify, then the criteria
checker runs it again — so an N-phase spec turns a single multi-minute suite
into ~2N of them for no signal validate would not produce anyway. If a phase's
real requirement is "nothing else regressed", state the phase-local assertion
here (which pre-existing tests may change, and how) and let validate confirm
the global claim.

CONSTRAIN *HOW* A FILE CHANGED BY CONTENT, NEVER BY `git diff` AGAINST `HEAD`.
A branch accumulates uncommitted work across phases, so "the diff on this file
is comment lines only" judges every phase since the last commit rather than the
phase under test. Assert content instead: a `grep` for text that must be
present or absent, a named test that must pass, a parse check.

Two `git diff` shapes remain sound: EMPTY `git diff <path>` for a path no phase
in the workstream may ever touch, and `git diff --name-only <commit>..HEAD`
naming its baseline commit explicitly.
-->

- [ ] [Observable condition — e.g., "`POST /api/v1/orders/{order_id}/refunds`
      with an `amount_cents` that would push the order's refunded total past
      its captured total returns HTTP 422 and stores no `Refund` row"]
- [ ] [Observable condition — e.g.,
      "`pytest api/tests/unit/test_refunds.py -q` passes;
       `pytest api/tests/contract/test_money_types.py -q` passes"]
- [ ] [Observable condition — e.g., "`grep -nE 'float\(|Decimal\(' api/routes/refunds.py`
      returns no hit"]

### Phase 2: [Next Phase Name]

[Repeat structure for each phase]

---

## Standards References

<!--
Cite the specific standards sections that apply, not "best practices."

This section tells the agent which constraints apply, by name. Without it, the
agent may apply constraints that do not apply. It may also miss constraints
that do.

Cite by relevance, not by truth. Keep a row where the work touches that
surface. Drop a row where the rule is merely true of the repository. A
spec confined to one lane that still carries another lane's invariant row has
not been pruned.
Each irrelevant row dilutes the ones that bind.

The table below is the full set to choose from, not the set to copy. A rule
absent from it is a rule specs will not cite. Treat an omission as a template
bug and add the row.
-->
<!-- ADOPT: Generate this table at adoption from your steering file headings, pattern docs, and rules; keep the rules 'cite by relevance, not truth' and 'an omission is a template bug'. Replace the example rows and the cite-at-least sentence below with ones from this repository, then delete this marker. -->
<!--
Cite at least the Money as Integer Cents and Tenant Scoping rows when the work
touches a route under `api/routes/` or any `*_cents` field.
-->

| Standard | Section | Relevance |
|----------|---------|-----------|
| `CLAUDE.md` | Money as Integer Cents | Every monetary amount is an `int` of cents (`amount_cents`); never `float`, never `Decimal` across the API boundary. Key file `api/models/money.py`. |
| `CLAUDE.md` | Tenant Scoping | Every route reads data through `require_tenant` (`api/deps/tenant.py`); no query touches rows outside the caller's tenant. |
| `CLAUDE.md` | Background Job Payloads | A payload in `api/jobs/payloads.py` holds IDs and plain dicts only, never ORM objects or sessions. |
| `CLAUDE.md` | Migrations Are Additive | Migrations under `api/migrations/` add columns or tables with defaults; destructive changes are two-step and carry `api/tests/contract/test_migrations.py`. |
| `CLAUDE.md` | Anti-Patterns / Agent Selection | No worktrees; no `git stash`; edit existing files; tests a wrong program passes too; subagent routing for api vs. web vs. docs work. |
| `api/docs/patterns/testing.md` | Testing Requirements | The four api test tiers (`unit`, `integration`, `contract`, `perf`); the guard inventory; required contract tests for new components. |
| `web/docs/patterns/testing.md` | Testing Requirements | Vitest conventions for components and the API client under `web/src/` and `web/tests/`. |
| `.claude/rules/background-jobs.md` | Payload Isolation | Job entry-point conventions and the payload-isolation contract test. |

---

## Open Questions

<!--
List the decisions the spec cannot settle. This is the last section of the
spec.

Raise a question rather than guessing past it.

Write each entry in one of the three shapes below. Number each entry once.
Never renumber. A closed entry keeps its number in place so later references
stay valid.

  1. OPEN:

     1. **[The decision as one direct sentence]**
        - **Context**: [One paragraph, PLAIN LANGUAGE, for someone who has not
          read this spec and does not know this subsystem — no paths, no type
          names, no pipeline jargon. What is being decided, what changes
          downstream, why it could not be settled automatically. A reader must
          be able to choose from this alone.]
        - **Options**: [2-4, each a short label plus what picking it means.
          Never free text where choices can be enumerated. One option is not a
          decision; five cannot be rendered to the developer.]
        - **Recommended**: [One label from above, character-for-character — or
          omit the line entirely if you have no lean.]

  2. CLOSED — answered since drafting, recorded in place:

     2. **Closed (YYYY-MM-DD)** — [the decision as one direct sentence]
        - **Context** / **Options**: [preserved verbatim from when it was open]
        - **Selected**: [the chosen option label] — [one clause on why]

  3. NONE — exactly this sentence and nothing else:

     No open questions — implementation may begin.
-->

No open questions — implementation may begin.

<!-- ===================================================================
     END OF EMITTED ARTIFACT
     The artifact saved to `docs/specs/<slug>.md` MUST stop at the
     line above. Everything below this fence is template reference for
     the writer's composition-time self-check and is NOT copied into
     the spec.
     =================================================================== -->

---

## Composition-Time Self-Check
*(Template reference — DO NOT copy this section into the emitted spec.)*

<!--
List what the writer verifies before saving `<slug>.md`. This is not the
section that says what would prove the spec wrong. That is `## Invariance`,
and it is part of the spec. These bullets never appear in the saved spec.

Part A is decidable from the saved spec alone. The stage's critic audits the
spec, so a critic can also check Part A.

Part B requires the working tree: resolving a path, reading a signature,
confirming a symbol exists. Run it. Do not assert it. No critic in the
pipeline can run Part B. Only the writer can, and an unverified spec fails
silently here.
-->

### Part A — decidable from the artifact alone

#### Spec Quality

- [ ] **Target region is concrete**: Could a reader describe success without
      referring back to the spec?
- [ ] **Scope boundaries are explicit**: Are both IN and OUT stated for the
      overall spec and each implementation phase?
- [ ] **Dependencies are ordered**: Does information flow from context →
      decisions → implementation with no forward references?
- [ ] **Alternatives rule out the obvious answers**: Does each entry under
      `## Alternatives Considered` name an approach an agent could plausibly
      have proposed instead? (This is separate from `## Invariance`.)
- [ ] **The invariance criterion is emitted**: Does `## Invariance` carry a
      reframing, a surviving claim, and either a concrete falsifier or the
      explicit "not yet identified" form with a matching `## Open Questions`
      entry? (The architect reviewer drops concerns it cannot tie to a named
      section, so a spec without this section leaves it unable to object.)
- [ ] **Open Questions is present in one of its three shapes**: still-open
      entries with Context / Options / Recommended, closed entries carrying
      `**Closed (YYYY-MM-DD)**` in place and unrenumbered, or the exact
      sentence "No open questions — implementation may begin."
- [ ] **No conflicting constraints**: Are all goals simultaneously satisfiable?

#### Agent Readiness

- [ ] **Acceptance criteria stand alone**: Read each `#### Acceptance Criteria`
      block with the rest of the spec covered. Is every criterion adjudicable
      from that text plus the tree — no `Phase N`, no `## Section` reference,
      no "the new field" without its path? (The criteria checker receives this
      block and nothing else, and its verdict halts every later phase)
- [ ] **Scope enumerates paths**: Does each `#### Scope` IN and OUT name
      repo-rooted paths rather than referring to them? (It is inlined into the
      dev agent's prompt as its off-limits boundary)
- [ ] **Test work is co-located**: Every phase that changes behavior states its
      test expectations under the right test tier of its lane (as that lane's
      testing pattern doc defines the tiers)? A phase that changes code
      without changing behavior states `Covered by …` or the UNFILLABLE FORM
      instead, and that is a complete answer, not a gap.
- [ ] **Test work is proportionate**: Does every Tests line name the condition
      it catches, and does the count track this phase's `**IN**` rather than
      the code objects it touches — no line whose subject is a symbol's
      location, existence, or name?
- [ ] **Test runs are scoped**: Does every acceptance criterion that runs tests
      name a targeted selection (specific modules, node ids, or at most one
      narrow tier directory)? No phase may name a whole-suite invocation (the
      ones listed in the `#### Acceptance Criteria` comment above) — the
      whole-suite regression run is the validate stage's, and a per-phase copy
      multiplies it across every phase.
- [ ] **Standards are cited by name and pruned by relevance**: Are the relevant
      `CLAUDE.md` sections, pattern docs, and `.claude/rules/*.md` sections
      referenced explicitly, not as "follow best practices"? Has every row the
      work does not touch been dropped?
- [ ] **Agent routing parses**: Is every `**Agent routing**:` line exactly one
      bare agent name from the roster in `.claude/spec-pipeline.json` — no
      parenthetical, no trailing clause, no second agent, no `manual`? (The
      line is machine-read to select the subagent; anything else is an
      unresolvable parse)
- [ ] **Status line present and set to Draft**: The metadata block under the
      title contains `**Status**: Draft`. The status advances to `Final` when
      the spec is approved for implementation.

---

### Part B — requires the working tree

*(Run these. No critic in the pipeline can.)*

#### Grounding

- [ ] **File paths resolve**: Does every code reference in this spec resolve to
      a real path in the tree at the commit you are writing on — including the
      paths inside worked examples? (Tests for grounding)
- [ ] **Cited symbols exist**: Does every function, class, dependency, and
      route named in `## Proposed Design` or a phase's Tasks appear in the tree
      with the signature the spec assumes, or is it explicitly new work?

#### Project Invariants

<!-- ADOPT: Write one bullet per entry of `invariants` in .claude/spec-pipeline.json (one per Critical Recall row of the steering file), each stating the checkable condition, and keep the final worktree/stash bullet verbatim. Replace the example bullets below with ones from this repository, then delete this marker. -->
- [ ] **Money as Integer Cents**: Every proposed monetary field and every
      arithmetic step on money is an `int` of cents (`amount_cents`); no
      `float` and no `Decimal` crosses the API boundary. Conversions go through
      `api/models/money.py`.
- [ ] **Tenant Scoping**: Every new or changed route takes
      `tenant: Tenant = Depends(require_tenant)` (`api/deps/tenant.py`), and no
      proposed query reads or writes rows outside the caller's tenant.
- [ ] **Background Job Payloads**: Every proposed job payload in
      `api/jobs/payloads.py` — record type or plain dict — holds IDs and plain
      dicts only, never an ORM object or a session. Jobs reload what they need
      under their own session.
- [ ] **Migrations Are Additive**: Every proposed migration under
      `api/migrations/` adds columns or tables with defaults. A destructive
      change is split into two migrations and carries a contract test in
      `api/tests/contract/test_migrations.py`.
- [ ] **No worktrees / no `git stash`**: The spec proposes neither a
      `git worktree add` invocation, an `Agent` call with
      `isolation: "worktree"`, nor any `git stash` subcommand. Work proceeds
      on the current branch; uncommitted changes are committed or discarded.
