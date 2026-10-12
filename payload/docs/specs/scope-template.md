# [Workstream Title] Scope

**Slug**: [kebab-slug matching the workstream slug and the `<prefix>/<slug>` branch]
**Date**: [YYYY-MM-DD]
**Status**: Draft
**Source**: [issue link, triage artifact at `docs/specs/<slug>-triage.md`, or hand-seeded]

<!-- ADOPT: This template assumes the default specs directory `docs/specs/`, the default steering file `CLAUDE.md`, and its default `## Reference` heading; if `specs_dir`, `steering.file`, or `steering.reference_heading` in .claude/spec-pipeline.json differs, replace every occurrence in this template. Then delete this marker. -->
<!--
Scope template for workstreams in this repository.

This template structures the scope artifact for workstreams in this
repository. The scope sits between triage and a full spec. Triage is
conversational and less strict. The scope is stricter.

The artifact lands at `docs/specs/<slug>-scope.md`. The spec at
`docs/specs/<slug>.md` reads the scope body verbatim as scoping context. Every
line here becomes context for the spec drafting.

The artifact has exactly six H2 sections, in this order: `## Executive Summary`,
`## Goals`, `## Non-Goals`, `## Files Affected`, `## Dependencies`,
`## Open Questions`. The artifact stops at the end of `## Open Questions`. The
`## Composition-Time Self-Check` appendix below the fence at the bottom of
*this template* is template reference only. Never copy it into the artifact.

`Status` on a scope artifact is always `Draft`. No stage reads it. Scope has no
Blocked or Decided state. Do not bring triage's Status words into the scope,
because scope has no gate for them to mark.
-->
<!-- ADOPT: Name this repository's source roots, test roots, and the kinds of concrete surface it exposes. Replace the example below with one from this repository, then delete this marker. -->
<!--
State the scope against real surfaces of this repository: paths under the
source roots `api/` and `web/src/`, the test roots `api/tests/` and
`web/tests/`, and `docs/specs/`. "A concrete surface of this repository" means
a repo-rooted path, a symbol, a route, a test id, or a command's output, and
here typically one of: a route under `/api/v1/`, a Pydantic model field, an
`Order`/`Refund` model attribute, a job payload key, a migration revision, a
pytest node id, a Vitest test case, or a React component prop.
-->
<!--
Open questions have no target count. Scoping may leave zero, one, or many
unresolved. `## Open Questions` has an explicit form for the zero case.

Before saving, run the template-only `## Composition-Time Self-Check`. It names
one check per section that can fail. Its Part A checks are decidable from the
artifact alone. Its Part B checks require the working tree.

The spec reads this artifact verbatim and does not treat its sections equally.
`## Goals` and `## Non-Goals` bind hardest. `## Dependencies` binds by
direction. `## Files Affected` is a seed that the spec is expected to extend.
A commitment that appears only in `## Executive Summary` or only in
`## Files Affected` is not a commitment. If the work must do it, make it a goal.

The spec is only as good as the scope it reads.

Delete all HTML comments before saving the artifact.
-->

## Executive Summary

<!--
This section is one paragraph that ties the workstream to observable surfaces
of this repository.

A reader who stops here should be able to state what the workstream produces.
They should be able to state where the produced artifacts land. They should be
able to state which surfaces of this repository those artifacts modify.

Name the cause, stated as a relation between two named surfaces. For a fix, the
cause is what in the current code produces the wrong behavior. For new
capability, it is the absence the work fills. Do not list the surfaces the
workstream leaves untouched. That belongs in `## Non-Goals`, and repeating it
here puts it in front of the reader twice.

Avoid abstractions that could equally describe any other codebase built on the
same stack. If this paragraph could appear unedited in a different project's
repo, it is not specific enough.
-->

[One paragraph. Name the mechanism: which named surface produces the current
behavior, which surfaces the work changes, and what is observably different for
a user, an operator, or a caller after it lands.]

## Goals

<!--
This section has one numbered goal per distinct, independently verifiable
outcome the work commits to. The number of goals follows from the work. Do not
pad to reach a count. Do not merge distinct outcomes to stay under a count.

Each goal names the change. Each goal names the observable condition that
confirms it. That condition sits on one of the surfaces `## Files Affected`
names.

When a goal's observable condition is a grep, a count, or a list of files,
run the check before writing the goal. Name the check in a few words and state
the number you actually observed. Do not state the number you expect.

A goal is one short paragraph. It carries the outcome, the name of the check,
and the observed number. It does not carry the full recipe: the exact command
pipeline, the fixture wiring, the patched methods, or the assertion text. That
recipe belongs in the spec's `#### Acceptance Criteria` for the phase that
delivers the goal.

Bad: a goal that defines a `sed` range, lists eight `grep -c` pipelines with
     their before-and-after counts, and specifies how a unit test builds its
     fixture (that is an acceptance criterion, not a goal)
-->
<!-- ADOPT: Give one underconstrained goal and two good goals from this repository, each naming a real check and its observed number. Replace the examples below with ones from this repository, then delete this marker. -->
<!--
Bad: "Refunds are robust." (underconstrained — robust against what, on which
     route?)
Good: "`POST /api/v1/orders/{order_id}/refunds` rejects a refund that would
       push the refunded total past the captured total — verifiable by
       `test_refund_exceeds_captured` in `api/tests/unit/test_refunds.py`
       (observed: 0 such tests exist today)."

Good: "`GET /api/v1/orders/{order_id}` returns an integer `refunded_total_cents`
       field equal to the sum of the order's refunds' `amount_cents` —
       verifiable by a test in `api/tests/unit/test_refunds.py`."
-->

1. **[Goal]** — [observable condition on a concrete surface of this repository that confirms it]

## Non-Goals

<!--
This section lists what the work excludes. Each excluded item names its reason.

Non-goals rule out adjacent work the spec author would otherwise be free to
take on. The reason is one of three. Out-of-scope means a separate workstream.
Deferred means a later phase or a follow-on spec. Conflicts means it conflicts
with a named `CLAUDE.md` invariant. Cite that invariant by section heading. Do
not restate its text.

The number of non-goals follows from the work, not a target. A non-goal must
name something the spec author could plausibly reach for from this scope's
goals. It must not be just any invariant the repo happens to hold. If the
workstream cannot touch a surface at all, `## Executive Summary` already says
so. Do not exclude it again here.

Non-goals are honoured downstream per symbol and per line, not per file. When a
file is otherwise in scope, exclude the function or the line range, not the
file.

Pattern: "[Adjacent thing] — [reason: out-of-scope / deferred / conflicts with <invariant>]"
-->

- [Adjacent thing the spec might otherwise reach for] — [out-of-scope / deferred / conflicts with <invariant>]
- [Adjacent thing] — [reason]

## Files Affected

<!--
This section lists every file the workstream reads, creates, or modifies.

Every reference must resolve to a real path under one of this repository's
source or test roots (named in this template's header comment) or under
`docs/specs/`. Group the paths by what the workstream reads and by what it
creates or modifies. Do not use abstractions like "the persistence layer" or
"the runner module". Name the file.

Every reference is a repo-rooted path containing a `/`. `models.py` is a
filename, not a path. For canonical surfaces of this repository, see
`CLAUDE.md` -> *Reference* -> Key source files. That list is a pointer, not a
menu to select from. Do not list this workstream's own triage artifact. It is
the stage's input, not a file the workstream reads.

This list is the spec's starting inventory, and the spec will extend it.
Before saving, check three things:
  - Every test module named in a `## Goals` verification clause appears here
    under **Creates or modifies**. A goal whose test file is absent from this
    list is not verifiable.
  - Run `grep -rn` for copies of what you are changing, such as a parallel test
    fixture, a duplicated literal, or a sibling seed helper. List each one, or
    say in its bullet why it is excluded.
  - List the call sites of every symbol you change, not only its definition
    site.

The split between **Reads** and **Creates or modifies** is your best current
guess, not a commitment. The spec may move a file to the other group without
contradicting you.
-->

**Reads**:
- [path] — [what the workstream needs from this file]

**Creates or modifies**:
- [path] — [what the workstream changes here]

**Not yet enumerated**: [the class of file this list is knowingly short on, and
what the spec must do to complete it — or the exact sentence: This inventory is
complete; the spec adds no file.]

## Dependencies

<!--
This section states dependencies by direction.

`Depends on` lists specs, modules, or actions that must already exist for this
workstream to land. `Depended on by` lists what consumes the artifact this
workstream produces. Do not make forward references. If a downstream consumer
does not exist yet, list it with `(planned)` so the dependency stays explicit.

Three things are never dependencies, because every workstream has them and
they say nothing about ordering: the descendant spec at `docs/specs/<slug>.md`,
this workstream's own triage at `docs/specs/<slug>-triage.md`, and the
`<prefix>/<slug>` branch. Never list any of them in either direction. The
reader of this section is the descendant spec. A real dependency on a
different workstream's spec is a real dependency. List it.

If nothing outside this workstream consumes what it produces, write exactly:

  - **Depended on by**: None — leaf change; nothing downstream consumes this.
-->

- **Depends on**: [spec / module / action] — [what crosses the boundary into this workstream]
- **Depended on by**: [spec / module / action] — [what this workstream provides downstream]

## Open Questions

<!--
This section lists the gaps left after scoping that the spec author must close
before drafting. Each one is an answerable question, not a rhetorical one. The
number of questions follows from the work, not from a target. Scoping may leave
zero, one, or many.

  • If scoping left one or more open questions, write them as a numbered
    list. Each question names the specific design decision it raises. Each
    question names the evidence or decision that would close it. A question
    must be answerable with finite operator effort. It is never rhetorical
    and never philosophical. Tie each one to a concrete surface of this
    repository (a repo-rooted path, a symbol, a route, a test id, or a
    command's output; the header comment lists the kinds this repository
    has).

    Pattern: "[Question] — Closed by [the evidence or decision that would close it]"

    Give each still-open entry a `- **Context**:` sub-bullet. It is one
    plain-language paragraph with no paths or type names. Give each still-open
    entry an `- **Options**:` sub-bullet of 2-4 labelled choices. Give each
    still-open entry a `- **Recommended**:` line that names one of that
    entry's own option labels.

  • If a question this scope raised was answered before saving, keep its
    number. Keep its question sentence. Replace the closing clause with
    `**Closed (YYYY-MM-DD)** — [the decision] — [who ruled, when a human did]`.
    Leave the entry in the numbered list. A closed entry does not become a new
    section. A closed entry does not move. Do not add a seventh H2 to hold
    closed entries. Do not renumber. A closed entry keeps its **Options**
    verbatim, so the closure reads as a reviewable diff rather than an essay.
    An artifact whose entries are all closed still has the numbered list, not
    the no-questions sentence.

  • If scoping left no open questions, write exactly this single sentence,
    with no numbered list and no surrounding commentary:

      No open questions — spec drafting may begin.

    An empty numbered list is not an acceptable substitute. The explicit
    sentence tells "scoping found nothing left to decide" apart from "the
    writer forgot to fill in this section."

Pick exactly one shape for each entry. Use the no-questions sentence only when
the section has no entries at all.

Scope has no blocking entry. An open scope question does not halt the
pipeline. It obliges the spec to close it. Do not use triage's B<n> shape.
-->

1. [Question] — Closed by [evidence or decision that would close it]
   - **Context**: [one plain-language paragraph, no paths or type names]
   - **Options**: [Label A] — [what it means]; [Label B] — [what it means]
   - **Recommended**: [one of this entry's own option labels]

<!-- ===================================================================
     END OF EMITTED ARTIFACT
     The artifact saved to `docs/specs/<slug>-scope.md` MUST stop at the
     line above. Everything below this fence is template reference and is
     NOT copied into the artifact.
     =================================================================== -->

---

## Composition-Time Self-Check
*(Template reference — DO NOT copy this section into the emitted artifact.)*

<!--
These are the checks the writer runs before saving.

Part A is decidable from the saved artifact alone. Part B requires the working
tree. Run each Part B check. Do not assert its result.
-->

### Part A — decidable from the artifact alone

- [ ] **Six H2 sections present in order, and nothing after `## Open Questions`** —
      the artifact's H2 walk reads `Executive Summary`, `Goals`, `Non-Goals`,
      `Files Affected`, `Dependencies`, `Open Questions`, in that order, with
      no section reordered, none missing, none added between them, and no
      content emitted after the `## Open Questions` block ends.
- [ ] **Goals are independently verifiable** on a concrete surface of this
      repository (a repo-rooted path, a symbol, a route, a test id, or a
      command's output, of one of the kinds this template's header comment
      lists), each naming the check that confirms it.
- [ ] **Goals carry the check's name and observed number, not its recipe** —
      no goal contains a command pipeline, a `sed` range, fixture wiring,
      patched methods, or assertion text. That material belongs in the spec's
      `#### Acceptance Criteria`.
- [ ] **Non-Goals collapse explicit dimensions** — each excluded item names its
      reason: out-of-scope, deferred, or conflicts with a named `CLAUDE.md`
      invariant, cited by section heading rather than restated.
- [ ] **Every path is a path** — every reference in `## Files Affected` is
      repo-rooted and contains a `/`. A bare filename (`models.py`) is not a
      path. No abstractions like "the persistence layer," "the service module,"
      or "the API surface."
- [ ] **`## Files Affected` closes its own inventory** — a `**Not yet
      enumerated**` line is present, naming either the class of file the list
      is short on or the exact sentence `This inventory is complete; the spec
      adds no file.`
- [ ] **Dependencies are DAG-ordered and carry no pipeline artifacts** —
      `Depends on` and `Depended on by` are stated explicitly with no forward
      references, planned-but-absent consumers are marked `(planned)`, and
      neither direction names `docs/specs/<slug>.md`,
      `docs/specs/<slug>-triage.md`, or the `<prefix>/<slug>` branch for this
      workstream's own slug.
- [ ] **Open Questions is well-formed** — every numbered entry is in exactly one
      of the two entry shapes (still-open, carrying `**Context**` /
      `**Options**` / `**Recommended**` sub-bullets and naming what would close
      it; or closed, carrying `**Closed (YYYY-MM-DD)**` and preserving its
      `**Options**` verbatim), numbering is unbroken and unrenumbered, and no
      seventh H2 was added to hold closed entries. When and only when the
      section has no entries at all, it is the single explicit sentence
      `No open questions — spec drafting may begin.` with no list and no
      surrounding commentary. An empty numbered list is not acceptable;
      the explicit sentence is the no-questions form.
- [ ] **No composition-time material leaked into the artifact** — the saved
      `<slug>-scope.md` contains no `## Composition-Time Self-Check` section,
      no checklist bullets describing the artifact's own structure, and no
      HTML comments from this template.

### Part B — requires the working tree

- [ ] **Every `## Files Affected` path resolves** — each one exists on the tree
      now, or the bullet says it is created by this workstream.
- [ ] **Every observed number in `## Goals` was actually run** — each grep,
      count, or file enumeration a goal cites as its pre-change baseline was
      executed against the tree, not estimated.
- [ ] **The mirror sweep happened** — `grep -rn` for parallel fixtures,
      duplicated literals, and sibling helpers of what the work changes was
      run, and each hit is either listed in `## Files Affected` or explained.
