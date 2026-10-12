<!-- ADOPT: Save one copy per lane that has (or will have) pattern docs, e.g. api/docs/patterns/README.md, and rewrite the Topic Docs table to list only docs that exist. Replace the example below with one from this repository, then delete this marker. -->

# API Pattern Reference

Per-topic, pull-on-demand reference docs for the Orderly API. Each doc elaborates a steering surface — a `.claude/rules/*.md` shim or a `CLAUDE.md` Reference-table row — without contradicting it. `CLAUDE.md` holds the always-on, high-density constraints; these docs hold the comprehensive detail, examples, and rationale.

## Topic Docs

| Doc | Purpose | Routing surface |
|---|---|---|
| `money.md` | Integer-cents representation, conversion helpers, formatting at the edge | `.claude/rules/money.md` (`api/models/**`, `api/routes/**`) |
| `background-jobs.md` | Payload shapes, tenant re-reads inside jobs, entry-point tests | `.claude/rules/background-jobs.md` (`api/jobs/**`) |
| `testing.md` | Test tiers, naming, the guard inventory, fixtures | `CLAUDE.md` Reference table (API tests) + api-dev agent |

## Evolving These Standards

### When to propose changes

Add or change a standard when a violation causes repeated bugs or failed builds, when common practice contradicts the system's architecture, or when a non-obvious pattern keeps causing confusion. Challenge one when its rationale no longer applies or it creates friction without benefit. A proposal names the problem, why existing patterns are insufficient, concrete before/after examples, the impact, and a migration path.

### The placement test: steering file or pattern doc?

`CLAUDE.md` is a high-density subset of these docs. Content belongs there only when it is **catastrophic + always + non-obvious**:

| Dimension | Belongs in CLAUDE.md | Stays in a pattern doc |
|---|---|---|
| **Criticality** | Build fails, runtime crash, data corruption, data leak | Style inconsistency, minor preference |
| **Frequency** | Every route, every job, every test | One-off situations |
| **Obviousness** | Contradicts intuition, easily missed | Apparent from code or types |

Content that is obvious from the code, specific to one file, or temporary belongs nowhere. Templates, examples, and rationale always live in a pattern doc.

### Cross-referencing

Use specific, full repo-relative paths, never a bare "see the docs":
- `See api/docs/patterns/money.md`
- `See api/docs/patterns/background-jobs.md "Payload Shapes"`

### Ground-truth anchors and review cadence

Each section that describes code carries an anchor naming the canonical implementation:

```markdown
## Conversion Helpers
<!-- Ground truth: api/models/money.py:12-30 (to_cents, format_cents) -->
```

Review the anchored claims:
- **In the same PR** as any change to an anchored file, or to a documented pattern.
- **Periodically** (for example quarterly), with an agent-assisted sweep of every anchor.
- **After any architecture change** (a new access pattern, a new persistence mechanism, a structural refactor).

A sweep checks that each anchored range still contains the documented pattern, finds displaced claims (documentation for something that no longer exists) and underconstrained regions (patterns implemented but undocumented), and updates line numbers when files move. Anchors point at the most representative implementation, not the only one.
