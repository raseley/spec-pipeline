# [Workstream Title] Triage

**Slug**: [kebab-slug, identical to the workstream slug]
<!-- ADOPT: List every entry of `git.branch_prefixes` on the **Branch**: line and every `lanes[].name` on the **Lane**: line, keeping `unresolved` and the unresolved Branch string byte-exact. Replace the example values on the two lines below with this repository's, then delete this marker. -->
**Branch**: [feat/<slug> | fix/<slug> | unresolved - triage blocked on routing]
**Lane**: [api | web | unresolved]
**Date**: [YYYY-MM-DD]
**Status**: [Draft | Decided | Blocked]
**Source**: [issue link, raw idea note, or hand-seeded]

<!-- ADOPT: This template assumes the default specs directory `docs/specs/` and the default steering file `CLAUDE.md`; if `specs_dir` or `steering.file` in .claude/spec-pipeline.json differs, replace every occurrence of either in this template. Then delete this marker. -->
<!--
Triage template. The six section names come from the Geometry of Intent paper.
This template follows the layout of `scope-template.md`: an H1, frontmatter, and HTML comments. The artifact is saved at
`docs/specs/<slug>-triage.md`. The scope artifact at `docs/specs/<slug>-scope.md` reads the triage body verbatim as context.
Every line of the triage body becomes context for the scoping work.
The artifact has exactly six H2 sections: `## AS`, `## OBSERVE`, `## CONSIDERING`, `## ORDER`, `## VALIDATE`, `## OUTPUT`.
It stops at the end of `## OUTPUT`. The `## Composition-Time Self-Check` section at the bottom of this template is reference
for the writer only. Do not copy the self-check into the artifact. The scope stage would read it as part of the intent.

What each section must contain:

| Section | What it must contain |
|---|---|
| `## AS` | One sentence naming one agent role and the surface it reasons over. The lane must be readable from the role. |
| `## OBSERVE` | Two mandatory parts. Every surviving claim carries `path:line`. The ref and commit are named. |
| `## CONSIDERING` | Four fixed bullets with exact paths. Every invariant passes the derivation test. Every exclusion has a falsifiable check. |
| `## ORDER` | The six mandatory spine links, with fixed names and free derivations. Extra links are allowed. |
| `## VALIDATE` | One independent reframing, the claim that survives it, and a concrete falsifier. "Internally coherent" and "actionable" are not accepted. |
| `## OUTPUT` | The literal shapes given in that section. They are mandatory. |

An unfillable section is a question to answer, not a defect to hide. Every section has an explicit unfillable form. Using it
is a legitimate triage outcome, not a failure to try harder. Examples: "this is two workstreams", "the premise is false",
"routing needs a human decision first".

`Status` follows from the artifact's own state. It is never a free choice.

| Status | Lane | Branch | `## OUTPUT` form | Unfillable forms allowed |
|---|---|---|---|---|
| Draft | a configured lane name | `<prefix>/<slug>`, with `<prefix>` one of the configured branch prefixes and `<slug>` equal to **Slug** | Form 2 with at least one **Open** entry and no B entry | Non-blocking forms only (`## ORDER` as a whole section, or `## VALIDATE`) |
| Decided | a configured lane name | `<prefix>/<slug>`, with `<prefix>` one of the configured branch prefixes and `<slug>` equal to **Slug** | Form 1, or Form 2 with every entry **Decided (YYYY-MM-DD)** | None |
| Blocked | `unresolved` | `unresolved - triage blocked on routing` | Form 3 (at least one B entry) | At least one blocking form, in `## AS`, `## OBSERVE`, or `## CONSIDERING` |

The configured lane names and branch prefixes are the ones listed on the **Lane** and **Branch** lines of this template's
frontmatter; they come from `lanes[].name` and `git.branch_prefixes` in `.claude/spec-pipeline.json`.

The Blocked row holds in both directions. Lane `unresolved`, the unresolved Branch string, a B entry in `## OUTPUT`, and a
blocking form in `## AS`, `## OBSERVE`, or `## CONSIDERING` each mean Status: Blocked. Status: Blocked means all four are
present. On a blocked artifact the two routing lines read exactly:
  **Lane**: unresolved
  **Branch**: unresolved - triage blocked on routing
Any non-blocking unfillable form forces Status: Draft.
Lane: X means `## AS` names one of lane X's agents (its architect, its dev, or one of its other agents).
These Status rules describe the artifact file itself and say nothing about any workflow return value.

Unfillable forms. Any section may be written in one of two literal forms instead of its normal content.
Blocking form, for `## AS`, `## OBSERVE`, and `## CONSIDERING` only:
  **<SECTION> is unfillable.** <One sentence naming precisely what cannot be decided.> <One sentence naming the evidence or
  human decision that would decide it.> Handed back as ## OUTPUT entry B<n>.
Non-blocking form, for `## ORDER` (the whole section) and `## VALIDATE` only:
  **<SECTION> is unfillable.** <One sentence naming precisely what cannot be decided.> <One sentence naming the evidence or
  human decision that would decide it.> Raised as ## OUTPUT entry <n>, whose **Closes on** carries that same decision.
The blocking form forces Status: Blocked, Lane: unresolved, and the unresolved **Branch** string. It also requires a matching
B<n> entry in `## OUTPUT`.
The non-blocking form does not block routing. Lane and **Branch** stay real. It does force Status: Draft. It raises a Form 2
**Open** entry whose **Closes on** repeats the "what would decide it" sentence word for word. Form 1 and Status: Decided are
therefore unavailable.
Exactly one of the two forms applies per case. There is no third form. The one exception is a single underivable `## ORDER`
link, which has its own in-place line (see that section).
`## OUTPUT` is never unfillable. Form 1 is its zero case.
-->
<!-- ADOPT: List the kinds of concrete surface this repository exposes (routes, fields, records, payload keys, migrations, test ids, components, commands). Replace the example below with one from this repository, then delete this marker. -->
<!--
The surfaces of this repository. Wherever a rule below asks for "a concrete surface of this repository", it means a
repo-rooted path, a symbol, a route, a test id, or a command's output, and in this repository typically one of: a route under
`/api/v1/`, a Pydantic model field, an `Order`/`Refund` model attribute, a job payload key, a migration revision, a pytest
node id, a Vitest test case, or a React component prop.

Delete all HTML comments before saving the artifact. Do not copy any content below `## OUTPUT` into the artifact.
-->

## AS

<!--
Write exactly one sentence. It names one concrete agent role. It names the specific surface that role reasons over, as a real
path or a named runtime structure. Do not write a paragraph or a list.
The role comes from the roster: every agent listed in `.claude/spec-pipeline.json` (`lanes[].architect`, `lanes[].dev`,
`lanes[].other_agents`, `unlaned_agents`), or `manual`. The roster for this repository is:
-->
<!-- ADOPT: List every agent in .claude/spec-pipeline.json with its lane (or "unlaned"), plus `manual`. Replace the example below with this repository's roster, then delete this marker. -->
<!--
  `api-architect`, `api-dev` (lane `api`); `web-architect`, `web-dev` (lane `web`); `docs-writer` (unlaned); `manual`.
-->
<!--
`**Lane**` is read from this section. A role that belongs to a lane (that lane's architect, its dev, or one of its other
agents) means `Lane: <that lane's name>`.
An unlaned agent and `manual` name no lane. If the only honest role is one of them, routing is a question for a human. In that
case, write this section's blocking unfillable form and a matching B entry instead of naming the role.
If routing needs a human decision first, write the header's blocking unfillable form rather than inventing a role.
-->
<!-- ADOPT: Give one good AS sentence naming a lane architect from this repository and two real paths it reasons over. Replace the example below with one from this repository, then delete this marker. -->
<!--
Good: "As the `api-architect` subagent reasoning about how `POST /api/v1/orders/{order_id}/refunds` bounds a refund by the
order's captured total under the caller's tenant, across `api/routes/refunds.py` and `api/deps/tenant.py`."
-->

As the `<role>` subagent reasoning about [the specific thing] across [real path(s) or named structure(s)].

## OBSERVE

<!--
Write exactly two labelled parts, in order. Both are mandatory. This section checks the source against the repository. The
reframing check belongs in `## VALIDATE`, not here.
Part A (**Claimed**) restates what the source asserts. Attribute every distinct claim to where it came from. Do not evaluate
claims in Part A.
Part B verifies against the checkout you actually read. Get `<ref>` from `git rev-parse --abbrev-ref HEAD`. Get `<short-sha>`
from `git rev-parse --short HEAD`. The label names that ref. Do not hardcode the base branch's name (for example `main`):
triage can run with a feature branch checked out, and a branch-tip SHA recorded under the base branch's name would be false.
"current main", "HEAD", and "today's tree" are not substitutes for the literal hash.
Restate every claim that survived with at least one `path:line` citation that supports it.
State every claim that did not survive as falsified, with the citation that falsifies it. Falsifying an input claim is the
most valuable thing this section does, not a defect.
Name every citation from the source that does not resolve on the tree, with what was checked.
If nothing was falsified and every citation resolved, end Part B with exactly this sentence, so a reader can tell "checked,
all held" from "did not check":
  Every claim in **Claimed** survived verification and every cited path resolves.
If this section could appear unedited in a different project's repo, it is not specific enough.
Or write the header's blocking unfillable form ("the premise is false, close the issue").
-->

**Claimed** - [one paragraph. What the source asserts, restated, each claim attributed to where it came from.]

**Verified against `<ref>` at `<short-sha>`** - [one or two paragraphs. What survived, with `path:line`; what was falsified,
with the citation that falsifies it; what does not resolve.]

## CONSIDERING

<!--
Write exactly four bold-label bullets, in the order below. This section carries both the positive context and the exclusions.
The exclusions go in **While excluding**, as participial sub-clauses that name the obvious answer to steer away from.
Every path is real and exact. Do not use abstractions like "the persistence layer" or "the service module". Give line ranges
where the change is line-local.
Invariants are derived, not selected. There is deliberately no list to pick from. Cite an invariant only where you can name
two things. The first is the file or surface in **Target region** that the change must touch, with the edit that region
implies. The second is what the violation looks like at runtime. If either is missing, delete the entry.
Never restate the invariant's text. Point at `CLAUDE.md` by section heading and stop. A copy here drifts from the original,
as this template's own copy once did.
  - **<invariant name>** (`CLAUDE.md` -> *<section heading>*) - violated by <the specific file or surface in **Target region**
    the change must touch, and the edit that region implies>; at runtime that looks like <the concrete observable failure>.
-->
<!-- ADOPT: Give one derivation-test entry citing a real invariant heading from this repository's steering file. Replace the example below with one from this repository, then delete this marker. -->
<!--
Good:
  - **Integer cents on the refund path** (`CLAUDE.md` -> *Money as Integer Cents*) - violated by `api/routes/refunds.py`
    summing the order's existing refunds to compare against the captured total, if that sum is taken as `float`; at runtime
    that looks like a refund of exactly the remaining captured amount being rejected, or one cent over it being accepted.
-->
<!--
The first slot names a region, not a line. Triage goes no finer than the files and behaviour the work touches (## ORDER link
4), and no proposed change with line numbers exists yet.
The runtime-symptom slot is required because an invariant picked from a list cannot name a concrete observable failure.
Zero invariants is a legal and common outcome. Write the explicit sentence, not an empty list:
  No `CLAUDE.md` invariant is placed at risk by this change.
Also prohibited: any paraphrase of `CLAUDE.md` prose; any invariant selected because it is on a list.
Each **While excluding** entry is exactly:
  - while excluding **<the adjacent thing the work might otherwise reach for>** - <out-of-scope | deferred | conflicts with
    `CLAUDE.md` -> *<section heading>*>; falsifiable by <the concrete check a reader runs>.
"Falsifiable by" names an actual operation: a grep, a diff-absence claim ("`<path>` is absent from the diff"), a file-tree
walk, or a named assertion. Never "review confirms".
**While excluding** is what the work must not do. **Adjacent systems** is what the work must not break.
The same path may appear in both where it genuinely carries both claims. The common case is a neighbouring surface the work
must neither modify nor perturb. What is prohibited is a duplicated claim, not a shared path.
Every exclusion names a falsifiable check. Every adjacency names what must keep holding.
Or write the header's blocking unfillable form in place of all four bullets ("this is two workstreams").
-->

- **Target region**: [subsystem(s) and the specific files inside them, every one a real path; line ranges where line-local]
- **Invariants in force**: [derivation-test entries, or the exact sentence: No `CLAUDE.md` invariant is placed at risk by this
  change.]
- **While excluding**: [one `while excluding ...` entry per exclusion, each carrying its falsifiable check]
- **Adjacent systems**: [what the work must not perturb; awareness only, not exclusions]

## ORDER

<!--
This section records triage's own derivation chain: the dependency structure of the reasoning that produced this artifact.
It is not a plan for the scope stage. The scope stage has its own ordering in `.claude/workflows/spec-pipeline.js`. A second
ordering of scoping's own steps here would be drift. The hand-off to scoping lives in `## OUTPUT`. A delivery-side obligation
stated there is not a second ordering.
The six spine links below are mandatory. Their names are fixed. Each takes one line. Six is a minimum, not a cap.
Additional numbered links are permitted and encouraged wherever triage's reasoning actually carried a further dependency the
spine does not name. Examples: a falsified `## OBSERVE` claim forcing a lane reversal, a `CLAUDE.md` invariant forcing the
target region, one decision constraining another.
Each additional link takes the same `N. <X> -> <Y>: <derivation>` form. Place it where the dependency actually sits.
Renumber so the sequence reads in dependency order.
Prohibited: any step the scope stage should take; any decision record (decisions live in `## OUTPUT` alone).
A single spine link that could not be derived is written in place as `N. <link name> - not derived: <why>.` That is the only
unfillable form for a single link. It raises no `## OUTPUT` entry. It does not change `Status`, because a missing link is a gap
in the chain, not the absence of a chain.
If the chain as a whole could not be derived, use the header's non-blocking unfillable form for the whole section instead.
-->

1. raw idea -> verified facts: [what `## OBSERVE`'s verification settled that the raw idea left open]
2. verified facts -> lane: [the verified fact that forces the lane named in `## AS`]
3. lane -> change type: [why the **Branch** prefix follows; new capability vs correcting existing behavior]
4. change type -> target region: [why the target region in `## CONSIDERING` follows]
5. target region -> exclusions: [why the exclusions in `## CONSIDERING` follow]
6. exclusions -> residual decisions: [what was left undecided once the exclusions were drawn, and why]

## VALIDATE

<!--
This section states what would prove the restated intent wrong. It is not for anti-goals. Anti-goals belong in
`## CONSIDERING` -> **While excluding** and must not reappear here.
Write one to three sentences. Name one independent reframing that this triage's restated intent must survive. The reframing
is a frame a skeptical reader would apply that `## AS` does not already assume. Say what the artifact must still read as under
it. Say what would falsify it.
This is the artifact's only such check. The claim is accepted only if it holds both in `## AS`'s frame and in the reframing.
General fills such as "must be internally coherent" or "must be actionable" are not accepted here.
-->
<!-- ADOPT: Give one good reframing with a concrete falsifier on a real surface of this repository. Replace the example below with one from this repository, then delete this marker. -->
<!--
Good: Reframe as "what breaks on `main` today?" - under that reframing this must still read as a missing capability (partial
refunds), not a live over-refund defect. It is falsified if `POST /api/v1/orders/{order_id}/refunds` on `main` today accepts a
refund whose `amount_cents` exceeds the order's captured total.
-->
<!--
Prohibited: anti-goals or exclusions of any kind; a list; more than one reframing; a reframing that restates `## AS`'s frame.
Or write the header's non-blocking unfillable form. Using it raises a Form 2 **Open** entry. It also forces Status: Draft.
A triage that cannot say what would count as a good answer has not finished forming its intent. It must never sit alongside
"No open questions - scoping may begin."
-->

Reframe as "[the independent frame, as a question or stance]" - under that reframing this must still read as [the claim that
survives], not [the reading it collapses to if the claim is wrong]. It is falsified if [the concrete observation that would
break it].

## OUTPUT

<!--
The literal shapes in this section are mandatory.
`## OUTPUT` carries three kinds of content and nothing else:
  1. the hand-off: recipient, path, and branch
  2. the recipient's obligations against the decisions delivered
  3. the residual-decision record
The hand-off sentence comes first and the record follows it. The obligations appear in two places: the hand-off's closing
clause, and each Decided entry's **Obliges scoping to** sub-bullet. Stating what the recipient must do with what it receives
is not a second ordering of scoping's own steps.
The hand-off is always present, as exactly one of the two literal sentences below.
The recipient named in the routed hand-off is the architect of the lane named on **Lane**, as `.claude/spec-pipeline.json`
configures it.
The record is exactly one of three combinations: Form 1 alone, Form 2 alone, or Form 3 optionally followed by a Form 2 list.
Form 1 is never combined with anything. Form 3 followed by a Form 2 list is the normal shape of a blocked triage that also
raised ordinary residual decisions. It is well-formed.
Form 1, for no residual decisions: the exact sentence `No open questions - scoping may begin.` alone. Add no list and no
surrounding commentary. An empty numbered list is not a substitute. Status is Decided. Form 1 is unavailable if any section
carries an unfillable form.
Form 2: one numbered list. Every entry is marked **Open** or **Decided (YYYY-MM-DD)**. The list has three states, and all
three are the same form:
  all **Open** -> Status: Draft
  some **Open**, some **Decided** -> Status: Draft
  all **Decided** -> Status: Decided, provided no section carries an unfillable form
Form 2 rules:
  - **Options** is mandatory. It carries 2 to 4 entries. Do not use free text where choices can be enumerated.
  - If you cannot enumerate at least two concrete choices, the entry is not a decision. Either the missing fact is what blocks
    it (raise a B entry against `## OBSERVE`), or the question is rhetorical (delete it).
  - **Recommended** is omitted entirely (the whole line) only when there is genuinely no lean.
  - When an entry closes, **Options**, their descriptions, and **Recommended** are kept verbatim. Closing a question is a diff
    that flips **Open** to **Decided (date)**, deletes **Closes on**, and adds **Selected**, **Because**, and **Obliges
    scoping to**. The result is a selection against enumerated choices, reviewable as a diff rather than an essay.
  - **Selected** must match one of that entry's own Options labels character-for-character.
  - A **Selected** that differs from **Recommended** is legal. It is the record of a human override.
  - **Obliges scoping to** is omitted only when the decision genuinely obliges nothing.
  - An entry raised by a non-blocking unfillable `## ORDER` or `## VALIDATE` repeats that section's "what would decide it"
    sentence, word for word, as its **Closes on**.
  - Entry numbering is stable for the life of the artifact. Never renumber to compact the list.
  - No decision is ever recorded in `## ORDER`, `## CONSIDERING`, or `## VALIDATE`. `## OUTPUT` is the only place decisions
    are recorded.
Form 3: one or more B entries, listed before any Form 2 list. Status is Blocked, Lane is unresolved, and **Branch** is the
unresolved string. A B entry is never closed in place. Answering it always re-runs the triage stage.
-->

<!-- HAND-OFF, routed — keep this sentence or the blocked one below, never both: -->
<!-- ADOPT: List every `lanes[].architect` from .claude/spec-pipeline.json as the `|`-separated alternatives in the angle brackets (with one lane, the single name, still in angle brackets). Replace the example names in the sentence below with this repository's, then delete this marker. -->
**Hand-off to scoping**: `docs/specs/<slug>-scope.md` is drafted by `<api-architect|web-architect>` against the target region in ## CONSIDERING, on branch `<prefix>/<slug>`, taking every **Decided** entry below as settled input. Every **Open** entry must be closed before this hand-off is acted on.
<!-- HAND-OFF, blocked: -->
**Hand-off to scoping**: none. Triage is blocked - see B<n> below. The scope stage must not be run for this slug until the blocking entry is resolved.

<!-- FORM 2 entry, still open: -->
N. **Open** - <the decision as one direct sentence, ending in a question mark>
   - **Context**: <one paragraph or less, plain language, for someone who has not read this artifact and does not know this subsystem: what is on the table, what changes downstream depending on the answer, why it could not be settled automatically. No file paths, no class names, no pipeline jargon.>
   - **Options**:
     - **<label, a few words>** - <what picking it means>
     - **<label>** - <what picking it means>
   - **Recommended**: <one label, copied verbatim from Options>
   - **Closes on**: <the evidence or decision that would close it, anchored on a concrete surface of this repository (a repo-rooted path, a symbol, a route, a test id, or a command's output)>

<!-- FORM 2 entry, closed: -->
N. **Decided (YYYY-MM-DD)** - <the same decision, restated as one direct sentence ending in a period>
   - **Context**: <byte-identical to what the entry carried while Open>
   - **Options**:
     - **<label>** - <description>
     - **<label>** - <description>
   - **Recommended**: <label>
   - **Selected**: <the winning label, character-for-character identical to one of the Options labels>
   - **Because**: <one to three sentences of rationale>
   - **Obliges scoping to**: <what the scope stage must now derive as a consequence>

<!-- FORM 3 entry, blocked: -->
B<n>. **Blocked - ## <AS|OBSERVE|CONSIDERING>** - <what could not be decided, as one direct sentence>
   - **Context**: <plain-language paragraph, same plain-language rule as Form 2>
   - **Options**:
     - **<label>** - <what picking it means>
     - **<label>** - <what picking it means>
   - **Recommended**: <label>   (omit the line entirely if no lean)
   - **Unblocks on**: <the human decision or evidence that lets triage be re-run>

<!-- ===================================================================
     END OF EMITTED ARTIFACT
     The artifact saved to `docs/specs/<slug>-triage.md` MUST stop at the
     line above. Everything below this fence is template reference for
     the writer's composition-time self-check and is NOT copied into the
     artifact. The downstream scope artifact reads the triage body
     verbatim as refined-idea context; including the checks below would
     leak composition-time invariance material into the next stage's
     reading context.
     =================================================================== -->

---

## Composition-Time Self-Check
*(Template reference — DO NOT copy this section into the emitted artifact.)*

<!--
Check these bullets while writing, before saving `<slug>-triage.md`. Do not copy them into the saved artifact. That is what
the fence above is for. Each Part A bullet can be checked by reading the artifact alone, with no external state. Part B
restates, as checks, the two verification duties `## OBSERVE` and `## CONSIDERING` already impose; they require the working
tree. Run each Part B check. Do not assert its result.
A section written in its unfillable form is not a defect. Where a bullet says "or the section's unfillable form", check only
these things: the form names what cannot be decided, it names what would decide it, and it agrees with the frontmatter and with
its matching `## OUTPUT` entry.
-->

### Part A — decidable from the artifact alone

- [ ] **Frontmatter is complete and self-consistent** — six labelled lines in order; `Status`/`Lane`/`Branch` agree per the
      header's consistency rules; `Slug` matches the branch's `<slug>` segment; if any section carries an unfillable form,
      `Status` is `Blocked` (blocking form) or `Draft` (non-blocking form), never `Decided`.
- [ ] **Six CNL sections present in order, nothing after `## OUTPUT`** — the H2 walk reads AS, OBSERVE, CONSIDERING, ORDER,
      VALIDATE, OUTPUT, none reordered, none missing, none added, no content after `## OUTPUT`.
- [ ] **AS is one sentence naming a role** — a single sentence naming one of the roster roles, or the section's unfillable form.
- [ ] **OBSERVE verified against a named commit** — both `**Claimed**` and ``**Verified against `<ref>` at `<sha>`**`` present;
      `<ref>` names the checkout actually read and `<sha>` is a literal hash; every surviving claim carries `path:line`; every
      falsified claim and non-resolving citation is named; or the explicit "Every claim ... survived verification" sentence is
      present; or the section's unfillable form.
- [ ] **CONSIDERING passes the derivation test** — every invariant cited names both the file or surface in **Target region**
      that would violate it (with the edit that region implies) and the runtime symptom; no `CLAUDE.md` prose is copied; zero
      invariants is emitted as the explicit sentence; every **While excluding** entry names a falsifiable check and every
      **Adjacent systems** entry names what must keep holding (a shared path across the two bullets is legal — a duplicated
      claim is not); or the section's unfillable form.
- [ ] **ORDER is triage's own chain** — the six named spine links are present, in order, one line each, each either derived or
      emitted as `not derived`; any additional links are in the same `X -> Y` form and sit in dependency order; no step the
      scope stage should take; no decision recorded; or the section's unfillable form.
- [ ] **VALIDATE names one reframing** — one to three sentences, exactly one independent frame, independent of `## AS`'s lens,
      with a concrete falsifier; zero anti-goals; no exploration-end fill ("coherent", "actionable"); or the section's
      unfillable form.
- [ ] **OUTPUT is well-formed under one of the three sanctioned combinations** — hand-off sentence present in its routed or
      blocked literal; then Form 1's exact sentence alone, OR a Form 2 list alone, OR Form 3's `B` entries optionally followed
      by a Form 2 list (Form 1 is never combined); every Form 2 entry marked `**Open**` or `**Decided (date)**` with every
      sub-bullet in its required order; every `**Decided**` entry's `**Selected**` matches one of its own Options labels
      character-for-character; every entry carries 2-4 Options.
- [ ] **No composition-time material leaked** — no `## Composition-Time Self-Check`, no bullets describing the artifact's own
      structure, no HTML comments.
<!-- ADOPT: Keep `git[ -]stash|worktree` (the pipeline's own one-working-tree guardrail) and add the regexes for your own forbidden surfaces. Replace the example additions in the grep below with this repository's, then delete this marker. -->
- [ ] **Forbidden surfaces absent** —
      `grep -nEi 'git[ -]stash|worktree|float\(.*_cents|Decimal\('`
      against the saved `<slug>-triage.md` returns zero hits except where the artifact explicitly cites them as anti-patterns
      being avoided.

### Part B — requires the working tree

- [ ] **Every citation was opened, not recalled** — every `path:line` in `## OBSERVE` and every path in `## CONSIDERING`
      resolves on the checkout named in ``**Verified against `<ref>` at `<short-sha>`**``, or its bullet says the work creates
      it.
- [ ] **The ref and hash were read, not typed** — `<ref>` and `<short-sha>` are the output of
      `git rev-parse --abbrev-ref HEAD` and `git rev-parse --short HEAD`, run while writing this artifact.
