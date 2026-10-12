# Walkthrough: one workstream, end to end

A condensed run on the example project **Orderly** (a Python/FastAPI `api` lane and a TypeScript/React `web`
lane; see [`configuration.md`](configuration.md#the-example-project-orderly)). Artifact excerpts are
abbreviated with `...`; real artifacts follow the templates in full.

## 1. The idea

```
/spec-pipeline Partial refunds: let a support agent refund part of an order; the refunded total may never
exceed the captured amount; show the refunded-so-far figure in the order table.
```

The orchestrator reads `.claude/spec-pipeline.json`, picks a slug, and announces it:

> Using slug `partial-refunds`. Running triage.

It calls `Workflow({ name: "spec-pipeline", args: { config, stage: "triage", slug: "partial-refunds",
date: "2026-03-14", idea: "Partial refunds: ..." } })`.

## 2. Triage

The triage agent (`api-architect`, per `triage_agent`) checks every claim in the idea against the tree,
routes the work with the lane table, and writes `docs/specs/partial-refunds-triage.md`. A critic audits it
against the template's self-check; one revise round fixes an exclusion that lacked a falsifiable check.

```markdown
# Partial Refunds Triage

**Slug**: partial-refunds
**Branch**: feat/partial-refunds
**Lane**: api
**Date**: 2026-03-14
**Status**: Draft
**Source**: hand-seeded

## AS

`api-architect`, reasoning over refund creation in `api/routes/refunds.py` and the tenant-bound order reads
behind `api/deps/tenant.py`.

## OBSERVE

Ref `main` at `4f2a9c1`.

- Surviving: refunds are created by `POST /api/v1/orders/{order_id}/refunds` (`api/routes/refunds.py:41`).
- Surviving: the order table renders captured totals (`web/src/orders/OrderTable.tsx:58`).
- Non-resolving: "may never exceed the captured amount" is a requirement, not a present behaviour: no
  comparison against the captured total exists in `api/routes/refunds.py:41-78`, and
  `api/tests/unit/test_refunds.py` has no test named `test_refund_exceeds_captured`.

## CONSIDERING
...
- **Invariants**: Money as Integer Cents (`CLAUDE.md` -> *Money as Integer Cents*): the refunded-so-far
  figure is an `int` of cents end to end.
...

## ORDER
...

## VALIDATE

Reframe as "what would a support agent double-clicking the refund button observe?" - under that reframing
this must still read as a ceiling enforced at the API, not a check the dialog happens to perform. It is
falsified if a refund whose `amount_cents` exceeds the order's captured total is accepted.

## OUTPUT

**Hand-off to scoping**: `docs/specs/partial-refunds-scope.md` is drafted by `api-architect` against the target region in ## CONSIDERING, on branch `feat/partial-refunds`, taking every **Decided** entry below as settled input. Every **Open** entry must be closed before this hand-off is acted on.

1. **Open** - Should the refunded-so-far figure be computed when an order is read, or stored on the order?
   - **Context**: Each order needs to show how much has been refunded so far. We can add it up from the
     individual refunds every time the order is shown, or keep a running total on the order that is updated
     with each refund. Adding it up is always correct but does a little more work per page; a running total
     is cheaper to show but has to be kept in step with refunds, including any created before this change.
     The code does not settle which trade-off you want.
   - **Options**:
     - **Compute on read** - add up refunds whenever an order is shown; no stored total to keep in step
     - **Store on the order** - keep a running total; needs a migration and a backfill of existing refunds
   - **Recommended**: Compute on read
   - **Closes on**: the developer's choice, recorded against `api/models/order.py` (`Order`)
```

The return is `routed` with `lane: "api"`, `architect: "api-architect"`, `dev: "api-dev"`,
`branch_prefix: "feat"`, and one open question. The orchestrator re-reads the artifact's `**Status**:`
(`Draft`, consistent), reports, and the gate stops on the open question.

## 3. Answering the question

The orchestrator renders it through `AskUserQuestion`: the Context paragraph verbatim as the lead, then the
question, then the options with the recommended one first:

> Each order needs to show how much has been refunded so far. We can add it up ...
>
> Should the refunded-so-far figure be computed when an order is read, or stored on the order?
>
> - **Compute on read (Recommended)** - add up refunds whenever an order is shown; ...
> - **Store on the order** - keep a running total; ...

You pick "Compute on read" without comment. That is an **inline** closure: the orchestrator edits entry 1 in
place (no workflow call), keeping Context and Options verbatim:

```markdown
1. **Decided (2026-03-14)** - The refunded-so-far figure is computed when an order is read.
   ...
   - **Recommended**: Compute on read
   - **Selected**: Compute on read
   - **Because**: selected by the developer without stated rationale
   - **Obliges scoping to**: name the read path that sums refunds for an order, and exclude any migration.
```

No open entry remains, so triage becomes `**Status**: Decided`. The gate is clear:

> No open questions — advancing to `scope`.

## 4. Scope

`api-architect` writes `docs/specs/partial-refunds-scope.md`. Every goal names its check and the number it
observed; non-goals name things a spec author could reach for:

```markdown
## Goals

1. `POST /api/v1/orders/{order_id}/refunds` rejects a refund that would push the refunded total past the
   captured total (check: `test_refund_exceeds_captured` in `api/tests/unit/test_refunds.py`; observed: 0
   such tests exist today).
2. `GET /api/v1/orders` returns `refunded_cents` per order, summed from that order's refunds (check: field
   present in the `api/models/order.py` response model; observed: absent today).
3. `web/src/orders/OrderTable.tsx` shows a "Refunded" column from `refunded_cents` (check: a column test in
   `web/tests/orders/OrderTable.test.tsx`; observed: 0 such columns today).

## Non-Goals

- Does not change the refund notification email body (`api/jobs/notify.py`) — out of scope; the figure it
  quotes is already the per-refund amount.
- Does not add a stored running total or a migration — triage decision 1 selected compute on read.
...

## Open Questions

No open questions — spec drafting may begin.
```

The critic's audit is clean, there are no questions, so the chain advances to `spec`.

## 5. Spec

The spec stage runs on the top tier (`models.spec`). It writes `docs/specs/partial-refunds.md` with a
current-state section anchored at path and symbol, a design that cites real exemplars at `path:line`, an
Invariance section, and two phases:

```markdown
## Invariance

**Reframing**: a support agent submits the same partial refund twice in quick succession.
**Surviving claim**: the ceiling is enforced inside the request that creates the refund, against the
refunds already stored for that order and tenant.
**Falsifier**: a refund whose `amount_cents` exceeds the order's captured total is accepted.

## Implementation Plan

### Phase 1: Enforce the refund ceiling and expose refunded_cents

**Goal**: The API rejects over-refunds and reports the refunded-so-far figure per order.

**Agent routing**: api-dev

**Depends on**: None

#### Scope

**IN**: the ceiling check in `api/routes/refunds.py` (`create_refund`), reading refunds through
`tenant: Tenant = Depends(require_tenant)`; `refunded_cents: int` on the order response model in
`api/models/order.py`; the sum in `api/routes/orders.py`.

**OUT**: does not modify `api/jobs/notify.py` or `api/jobs/payloads.py`; adds no file under
`api/migrations/`; does not touch `web/`.

#### Tasks
...

#### Tests

- [ ] `api/tests/unit/test_refunds.py::test_refund_exceeds_captured` — fails when a refund past the captured total is accepted
- [ ] `api/tests/unit/test_refunds.py::test_refunded_cents_sums_refunds` — fails when `refunded_cents` omits or double-counts a refund

#### Acceptance Criteria

- [ ] `pytest api/tests/unit/test_refunds.py -q` passes, and `test_refund_exceeds_captured` and
      `test_refunded_cents_sums_refunds` are among the collected tests.
- [ ] `pytest api/tests/contract/test_money_types.py -q` passes.
- [ ] `git diff --name-only 4f2a9c1..HEAD -- api/migrations/` prints nothing.

### Phase 2: Show refunded-so-far in the order table

**Goal**: The order table shows each order's refunded total.

**Agent routing**: web-dev

**Depends on**: Phase 1
...

## Open Questions

No open questions — implementation may begin.
```

Note what the criteria avoid: no "Phase 1", no "the new field" without a path, no whole-suite run, and no
`git diff` against `HEAD`. The checker will see this block and nothing else.

The critique is clean and there are no questions, so the gate advances to implement.

## 6. Implement

Entering implement is the spec's approval. The orchestrator:

1. sets the spec to `**Status**: Final`;
2. runs `git checkout main && git pull origin main && git fetch --prune origin`, then
   `git checkout -b feat/partial-refunds` (the three untracked artifacts come along);
3. rebuilds `phases` from the spec file (`[{ title: "Enforce the refund ceiling and expose refunded_cents",
   agent: "api-dev", scope: "...", acceptance: "..." }, { title: "Show refunded-so-far in the order table",
   agent: "web-dev", ... }]`) and calls the workflow with `architect: "api-architect"`.

Per phase: the dev agent implements, the checker runs the named tests, and the architect of the agent's own
lane reviews (`api-architect` for phase 1, `web-architect` for phase 2). The return:

```json
{
  "stage": "implement",
  "halted": null,
  "results": [
    {
      "phase": "Enforce the refund ceiling and expose refunded_cents",
      "passed": true, "sound": true,
      "criteria": [
        { "criterion": "pytest api/tests/unit/test_refunds.py -q passes ...", "met": true, "deferred": false },
        { "criterion": "pytest api/tests/contract/test_money_types.py -q passes.", "met": true, "deferred": false },
        { "criterion": "git diff --name-only 4f2a9c1..HEAD -- api/migrations/ prints nothing.", "met": true, "deferred": false }
      ],
      "review": {
        "sound": true,
        "concerns": [
          { "severity": "observation",
            "concern": "GET /api/v1/orders/{order_id} still omits refunded_cents; only the list route gained it.",
            "anchor": "## Goals, goal 2" }
        ]
      }
    },
    { "phase": "Show refunded-so-far in the order table", "passed": true, "sound": true, "criteria": [...], "review": {...} }
  ]
}
```

The orchestrator reports both phases as passed, lists the observation separately as non-blocking, and
advances to validate.

Had phase 1 failed its criteria, the return would carry `halted: "Enforce the refund ceiling ..."`,
`sound: null` ("review not run"), and phase 2 would not have run. After a fix, `advance` would resend phase 1
onward; "retry that phase on fable" would resend it with `implModel` set to `models.escalation`.

## 7. Validate

One agent runs both configured suites exactly as written: `pytest api/tests/ -q` from the root (its
`timeout_ms` of 900000 exceeds the foreground cap, so it runs in the background), then `npx vitest run` from
`web/`:

```json
{ "stage": "validate",
  "validation": { "passed": true, "suites": [
    { "suite": "api", "passed": true, "summary": "412 passed, 9 skipped in 351.2s" },
    { "suite": "web", "passed": true, "summary": "Test Files 58 passed (58); Tests 301 passed (301)" } ] } }
```

Green, so the gate runs ship.

## 8. Ship

1. `git add -A -- . ':(exclude)docs/specs'`, then
   `git add docs/specs/partial-refunds-triage.md docs/specs/partial-refunds-scope.md docs/specs/partial-refunds.md`,
   then one commit; its SHA is `<spec-sha>`.
2. `git push -u origin feat/partial-refunds`.
3. `gh pr create` with a body like:

   ```markdown
   Orderly: partial refunds.

   Spec: https://github.com/<owner>/<repo>/blob/<spec-sha>/docs/specs/partial-refunds.md

   ### Implement
   - Enforce the refund ceiling and expose refunded_cents: 3/3 criteria met; review sound
   - Show refunded-so-far in the order table: 2/2 criteria met; review sound

   ### Architect observations (non-blocking)
   - GET /api/v1/orders/{order_id} still omits refunded_cents; only the list route gained it. (## Goals, goal 2)

   ### Validate
   - api: 412 passed, 9 skipped
   - web: 301 passed
   ```

4. `git rm` the three artifacts, `git commit -m "chore(specs): remove partial-refunds pipeline artifacts"`,
   `git push`.

The orchestrator reports the PR URL and stops. The base branch never sees the artifacts on its tip, yet the
whole record (verified claims, the refund decision and who made it, the design, every acceptance criterion) is
one click away from the PR.
