# Contracts

The command, the workflow script, and the three templates are written separately but read each other's
words. This page lists every interface between them. If you change one side of a contract, change every
side in the same commit and run `scripts/check-contracts.sh`.

## 1. The `args` contract

The command assembles `args`; the developer never types it. `args` arrives as a JSON object (or,
defensively, a JSON string, which the script parses).

```
args = {
  config,      // the parsed .claude/spec-pipeline.json. Required on every call.
  stage,       // "triage" | "scope" | "spec" | "implement" | "validate"
  slug,        // kebab-case workstream slug; names <specs_dir>/<slug>-*.md and the <prefix>/<slug> branch
  date,        // "YYYY-MM-DD" stamped by the command from session context (the script has no clock)
  idea,        // triage only: the developer's raw prose
  feedback,    // optional: this round's notes for a structural refine; only when the artifact exists on disk
  architect,   // scope | spec | implement: one of config.lanes[].architect
  phases,      // implement only: [{ title, agent, design, scope, acceptance }] rebuilt from the on-disk spec;
               // design is the **Design**: line split on "; " ([] for None, null for a spec without the line)
  model,       // optional: overrides drafter, reviser, dev, and review tiers (critics, checker, validate keep theirs)
  implModel    // optional: implement dev calls only; wins over model; set to config.models.escalation on request
}
```

Of the ten fields, the developer supplies only `idea` and `feedback`. `branch_prefix` is not an arg: the
command keeps it for branch and ship operations.

## 2. Return shapes

| Stage | Success | Failure shapes |
|---|---|---|
| any | | `{stage, error: "invalid config: <reason>"}`; unknown stage: `{stage, error}` |
| triage | `{stage: "triage", triage, critique}` | dead drafter: `{stage, error}`; malformed: `{stage, error, triage: {...status: "malformed"}, critique}` |
| scope | `{stage: "scope", scope: {scope_path, open_questions}, critique, composition}` | dead plan or drafter: `{stage, error, composition}` |
| spec | `{stage: "spec", spec: {spec_path, open_questions}, critique, composition}` (never phases) | dead plan or drafter: `{stage, error, composition}` |
| implement | `{stage: "implement", results: [{phase, passed, sound, criteria, review, commit?, error?}], halted}` | `{stage, error}` for missing or empty `phases`, missing or unknown `architect`, a phase `agent` not in the routable roster, or a phase `design` that is neither null nor an array of headings |
| validate | `{stage: "validate", validation: {passed, suites: [{suite, passed, summary, failures?}]}}` | `{stage, error}` (dead runner) |

- `triage.status` is `routed` or `blocked` from the agent; `malformed` only from the script.
- `critique` is `{clean, issues}` or `null` (critic died: unknown, never clean). On a scope or spec compose
  round each issue carries its lens prefix (`[template] `, `[phases:<id>] `, `[fidelity:<id>] `, `[coherence] `,
  `[tree] `, or `[check] ` for a plain-JS check); spec's re-check keeps the prefixes, scope's does not.
- `sound` is `null` whenever the review did not run (criteria unmet, dead dev or checker), `false` when it ran
  and found a blocking concern or died.
- Each `criteria` row is `{criterion, met, deferred}`. Each `review.concerns` row is
  `{severity: "blocking"|"observation", concern, anchor}`.
- `composition` (scope and spec) is `{mode: "partitioned"|"feedback", partitions, rationale, unassigned_anchors,
  uncovered_anchors, agents_run}`; spec adds `phases_planned`. On a feedback round `partitions` and `rationale`
  are `null` and both anchor lists are empty. Spec anchor entries are `G<n>`, `OQ<n>`, or `phase: <title>`.
- `commit` is present on every phase that passed review: `{committed, sha?, subject?, unexpected, error?}`.
  `committed: false` with no `error` means nothing was staged; with `error`, the commit failed and the phase
  halted (its `error` says so).
- `open_questions` entries are `{question, context, options: [{label, description}] (2-4), recommended?}`.

## 3. Coupled literals (byte-exact)

These strings appear in more than one file. Do not "tidy" them: the dash in #1 is a plain hyphen, the dashes
in #2 and #3 are em dashes, and that difference is load-bearing.

| # | Literal | Where |
|---|---|---|
| 1 | `No open questions - scoping may begin.` | triage template, script, command |
| 2 | `No open questions — spec drafting may begin.` | scope template, script, command |
| 3 | `No open questions — implementation may begin.` | spec template, script, command |
| 4 | `Blocking - ` (prefix of a B entry's returned `question`) | script, command Step 6.5 |
| 5 | `**Slug**:`, `**Branch**:`, `**Lane**:`, `**Date**:`, `**Status**:`, `**Source**:` (in that order) | triage frontmatter |
| 6 | `**Slug**:`, `**Date**:`, `**Status**:`, `**Source**:` | scope frontmatter |
| 7 | `**Date**:`, `**Status**:`, `**Source**:` | spec frontmatter |
| 8 | Status tokens: triage `Draft` / `Decided` / `Blocked`; scope `Draft`; spec `Draft` / `Final` | templates, command Step 2 |
| 9 | `**Lane**: unresolved` and `**Branch**: unresolved - triage blocked on routing` | triage template, command Step 3 |
| 10 | `## AS`, `## OBSERVE`, `## CONSIDERING`, `## VALIDATE`, `## OUTPUT` (exactly five; there is no `## ORDER` section) | triage template, script prompts, `blocked_on` enum `["AS","OBSERVE","CONSIDERING"]` |
| 11 | `**Hand-off to scoping**:` (routed sentence, and the blocked sentence `**Hand-off to scoping**: none. Triage is blocked - see B<n> below. The scope stage must not be run for this slug until the blocking entry is resolved.`) | triage template |
| 12 | Triage entries `N. **Open** - `, `N. **Decided (YYYY-MM-DD)** - `, `B<n>. **Blocked - ## <AS\|OBSERVE\|CONSIDERING>** - ` and sub-bullets `**Context**`, `**Options**`, `**Recommended**`, `**Closes on**`, `**Selected**`, `**Because**`, `**Obliges scoping to**`, `**Unblocks on**` | triage template, command Step 1a |
| 13 | Scope entries `N. [Question] — Closed by [...]`, closed clause `**Closed (YYYY-MM-DD)** — Selected: [label, or the off-list form] — [rationale, or who ruled]`, sub-bullets `**Context**`, `**Options**` (inline, semicolon-separated), `**Recommended**` | scope template, command |
| 14 | Spec entries `N. **[decision]**`, `N. **Closed (YYYY-MM-DD)** — [decision]` with `**Context** / **Options**` preserved and `**Selected**: label — why`; every template's `Selected` is a label from the entry's own Options or the off-list form `none of the listed options — <answer, or "deferred: <what decides it later>">` | all three templates, command Steps 1a and 6.5 |
| 15 | `## Executive Summary`, `## Goals`, `## Non-Goals`, `## Files Affected` (`**Reads**:`, `**Creates or modifies**:`, `**Not yet enumerated**:`), `## Dependencies`, `## Open Questions` | scope template, script scope prompts |
| 16 | `## Implementation Plan`, `### Phase N: `, `**Goal**:`, `**Agent routing**:`, `**Depends on**:`, `**Design**:` (`; `-separated `## Proposed Design` subsection headings, or `None`), `#### Scope` (`**IN**:` / `**OUT**:`), `#### Tasks`, `#### Tests`, `#### Acceptance Criteria`, `## Invariance` (`**Reframing**:`, `**Surviving claim**:`, `**Falsifier**:`), `## Standards References`, `## Open Questions` (last) | spec template, script spec prompts, command phase reconstruction |
| 17 | `END OF EMITTED ARTIFACT` fence; `## Composition-Time Self-Check` with `### Part A — decidable from the artifact alone` and `### Part B — requires the working tree` | all three templates, script critic prompts |
| 18 | Spec Part B sub-headings `#### Grounding` and `#### Project Invariants` | spec template |
| 19 | Artifact names `<specs_dir>/<slug>-triage.md`, `<slug>-scope.md`, `<slug>.md`; templates `triage-template.md`, `scope-template.md`, `spec-template.md` beside them | everything |
| 20 | Unfillable forms: `**<SECTION> is unfillable.** ... Handed back as ## OUTPUT entry B<n>.` (blocking) and `... Raised as ## OUTPUT entry <n>, whose **Closes on** carries that same decision.` (non-blocking, `## VALIDATE` only) | triage template, script triage prompt |
| 21 | Agent-call labels `triage`, `triage:critic`, `triage:revise`; `scope:plan`, `scope:draft:<partition>`, `scope:synthesize`, `scope:critic:<lens>`, `scope:critic`, `scope:revise`; `spec:plan`, `spec:draft:<partition>`, `spec:synthesize`, `spec:critic:<lens>` (lenses `phases:<partition>`, `template`, `fidelity:<partition>`, `coherence`), `spec:critic:recheck:<lens>`, `spec:critic`, `spec:revise`; `impl:<title>`, `verify:checks:<title>`, `verify:review:<title>`, `commit:<title>`, `validate:full-suite` | script |
| 22 | Phase titles `Triage`, `Scope`, `Spec`, `Implement`, `Validate` in `meta.phases` and `phase()` | script |
| 23 | Inline-refine rationale `selected by the developer without stated rationale` | command |
| 24 | Removal commit message `chore(specs): remove <slug> pipeline artifacts` | command |
| 26 | Artifact commit subjects `docs(specs): add <slug> pipeline artifacts` (the spec commit at approval, Step 4) and `docs(specs): revise <slug>: <what changed>` (every later artifact edit, Step 4a); neither carries a `Spec-Phase` trailer, and Step 2 rule 3 does not count them as implementation commits | command |
| 25 | Phase-commit trailer `Spec-Phase: <slug> / <title>` (the pass record re-entry slicing reads from `git log` after `/resume`) | script implement committer (passed to `git commit --trailer` and read back), command Steps 3 and 6.3 |

## 4. The three closed-entry shapes, side by side

Each template defines its own question section and its own closed shape. They differ on purpose: triage's
record carries obligations for the next stage, scope's is a one-line closing clause on a question, and spec's
is the most compact because the spec is the last document before code. The command edits each in its own
shape (Step 1a) and never converts one into another.

**Triage (`## OUTPUT`, Form 2), open → decided**

```markdown
3. **Open** - Should the refunded-so-far figure be computed on read or stored on the order?
   - **Context**: <plain-language paragraph>
   - **Options**:
     - **Compute on read** - <what it means>
     - **Store on the order** - <what it means>
   - **Recommended**: Compute on read
   - **Closes on**: <evidence or decision, anchored on a concrete surface of this repository>
```

```markdown
3. **Decided (2026-03-14)** - The refunded-so-far figure is computed on read.
   - **Context**: <byte-identical>
   - **Options**:
     - **Compute on read** - <unchanged>
     - **Store on the order** - <unchanged>
   - **Recommended**: Compute on read
   - **Selected**: Compute on read
   - **Because**: <the developer's rationale, or "selected by the developer without stated rationale">
   - **Obliges scoping to**: <what scope must now derive; omitted when nothing>
```

Blocking entries (`B<n>. **Blocked - ## <AS|OBSERVE|CONSIDERING>** - ...` with `**Unblocks on**`) are never
closed in place; answering one re-runs triage.

**Scope (`## Open Questions`)**

```markdown
2. Does the refund ceiling apply per order or per payment capture? — Closed by the product owner's ruling on split captures
   - **Context**: <plain-language paragraph>
   - **Options**: Per order — <meaning>; Per capture — <meaning>
   - **Recommended**: Per order
```

```markdown
2. Does the refund ceiling apply per order or per payment capture? — **Closed (2026-03-14)** — Selected: Per order — selected by the developer without stated rationale
   - **Context**: <unchanged>
   - **Options**: Per order — <meaning>; Per capture — <meaning>
   - **Recommended**: Per order
```

**Spec (`## Open Questions`, last section)**

```markdown
1. **Return 409 or 422 when a refund exceeds the captured total**
   - **Context**: <plain-language paragraph>
   - **Options**: <2-4 labels with meanings>
   - **Recommended**: 422
```

```markdown
1. **Closed (2026-03-14)** — Return 422 when a refund exceeds the captured total
   - **Context** / **Options**: <preserved verbatim>
   - **Selected**: 422 — matches the existing validation errors on the order routes
```

Rules common to all three (command Step 1a): keep the number, never renumber; stamp the session date; keep
Context and Options verbatim; write the selected label character-for-character from the entry's own Options
(strip the ` (Recommended)` display suffix), or, for an answer off the list, the off-list form with the
answer as given (never mapped onto the nearest option); record the developer's rationale or exactly
`selected by the developer without stated rationale`; never add a section to hold decisions. An artifact
whose entries are all closed keeps the numbered list; the no-questions sentence is only for a stage that
raised none.

## 5. Status tokens and transitions

| Artifact | Token | Set by | Meaning |
|---|---|---|---|
| triage | `Draft` | drafter | routed, with at least one `**Open**` entry or a non-blocking unfillable form |
| triage | `Decided` | drafter, or the command after an inline closure | routed; no `**Open**`, no `B`, no unfillable form anywhere |
| triage | `Blocked` | drafter or reviser | Lane `unresolved`, Branch `unresolved - triage blocked on routing`, at least one `B` entry, a blocking form in `## AS`/`## OBSERVE`/`## CONSIDERING`; all four together |
| scope | `Draft` | drafter | always; scope has no blocking state |
| spec | `Draft` | drafter | written, not yet approved |
| spec | `Final` | the command, at Step 4 | approved for implementation and committed on `<prefix>/<slug>` with the other two artifacts; a later revision stays `Final` |

Transitions: `Blocked → Draft/Decided` only through a structural triage re-run that answers the block (never
by hand-editing). `Draft → Decided` (triage) when the last open entry is closed inline. `Draft → Final` (spec)
only at approval (Step 4, before entering implement); nothing moves it back. Revisers leave frozen frontmatter
lines byte-identical.

## 6. What the command edits inline

The command's direct `Edit`s (no workflow call) are limited to:

- closing an open-question entry in its stage's shape (above), and re-evaluating triage's `**Status**`;
- wording, terminology, and small factual corrections within a template section's bounds;
- the spec's `**Status**: Draft` → `Final` at Step 4.

From the spec commit on, each such edit is followed by its own revision commit (#26); it is never amended
into an earlier commit.

It never edits agents, rules, `.claude/settings.json`, or `.claude/spec-pipeline.json`, and never moves a
triage artifact out of `Blocked` by hand.

## 7. Prompt frame

Every agent prompt in the script uses `AS. / OBSERVE. / CONSIDERING. / ORDER. / VALIDATE. / OUTPUT.`, and the
triage artifact's five sections mirror all of it but `ORDER.`, which stays in the prompts as the ordered
reasoning and is not recorded in the artifact (a frame from "The Geometry of Intent"). Keep it when adding or
changing a prompt.
