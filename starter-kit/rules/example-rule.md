---
paths:
  - api/jobs/**
  - api/tests/contract/test_job_payloads.py
---

<!-- ADOPT: Save one rule per invariant with a clear path footprint as <rules_dir>/<topic>.md (this example would be .claude/rules/background-jobs.md); set paths: to the globs where the invariant applies; keep each rule a short shim. Replace the example below with one from this repository, then delete this marker. -->

# Background Job Payload Standards

See `api/docs/patterns/background-jobs.md` for complete patterns.

## Core Rules

- **Payloads hold IDs and plain dicts only.** A payload in `api/jobs/payloads.py` (e.g. `RefundNotificationPayload`) carries `order_id`, `refund_id`, `tenant_id`, and plain `dict`/`list`/`str`/`int`/`bool`/`None` values. It is legal only because it holds no ORM object and no database session.
- **Jobs re-read inside their own tenant scope.** A job resolves the tenant from `tenant_id` and loads what it needs itself; it never trusts data captured when it was enqueued.
- **Amounts in payloads are integer cents** (`amount_cents: int`), like everywhere else.

## Contract Tests

A new or moved job entry point MUST be covered by `api/tests/contract/test_job_payloads.py`: the payload serializes to JSON and back unchanged, and holds no ORM instance or session. This is a protected guard; it asserts a shape on purpose.

## Key Files

- `api/jobs/payloads.py` — payload definitions
- `api/jobs/notify.py` — the refund notification job (canonical example)

## Anti-Patterns

- Passing an `Order` or `Refund` model instance into a payload
- Passing a session, a request, or a dependency result into a job
- Formatting money in the payload instead of in the job's output

## What Does Not Exist

- There is no retry field on a payload. Retries are the queue's job; do not add `attempt` or `retry_count`.
- There is no end-to-end job harness. Test a job by calling its entry point with a payload in an integration test.
