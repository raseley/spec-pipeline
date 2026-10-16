#!/usr/bin/env bash
# Verifies the byte-exact literals that are coupled across the orchestrator command, the workflow script and
# the templates (see docs/contracts.md), and that no source-project terms leaked into shipped files.
# Run from anywhere; exits 1 on any FAIL.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || exit 1

CMD=payload/.claude/commands/spec-pipeline.md
WF=payload/.claude/workflows/spec-pipeline.js
TRI=payload/docs/specs/triage-template.md
SCO=payload/docs/specs/scope-template.md
SPE=payload/docs/specs/spec-template.md

fails=0
# check <label> <literal> <file>...   (fixed-string match; every named file must contain it)
check() {
  local label="$1" lit="$2"; shift 2
  local f
  for f in "$@"; do
    if [ ! -f "$f" ]; then echo "FAIL  $label: missing file $f"; fails=$((fails+1)); continue; fi
    if grep -qF -- "$lit" "$f"; then echo "PASS  $label: $f"
    else echo "FAIL  $label: '$lit' not found in $f"; fails=$((fails+1)); fi
  done
}

# 1-3 no-questions sentences (hyphen vs em dash is deliberate)
check "#1 triage no-questions"  'No open questions - scoping may begin.' $TRI $WF $CMD
check "#2 scope no-questions"   'No open questions — spec drafting may begin.' $SCO $WF $CMD
check "#3 spec no-questions"    'No open questions — implementation may begin.' $SPE $WF $CMD
# 4 blocking prefix
check "#4 blocking prefix"      'Blocking - ' $WF $CMD
# 5-7 frontmatter
for k in Slug Branch Lane Date Status Source; do check "#5 triage frontmatter" "**$k**:" $TRI; done
for k in Slug Date Status Source; do check "#6 scope frontmatter" "**$k**:" $SCO; done
for k in Date Status Source; do check "#7 spec frontmatter" "**$k**:" $SPE; done
# 8 status tokens
check "#8 triage status" 'Draft' $TRI; check "#8 triage status" 'Decided' $TRI; check "#8 triage status" 'Blocked' $TRI
check "#8 scope status" 'Draft' $SCO
check "#8 spec status" 'Draft' $SPE; check "#8 spec status" 'Final' $SPE
# 9 blocked routing
check "#9 unresolved lane"   '**Lane**: unresolved' $TRI $CMD
check "#9 unresolved branch" '**Branch**: unresolved - triage blocked on routing' $TRI $CMD
# 10 operator headings
for h in AS OBSERVE CONSIDERING ORDER VALIDATE OUTPUT; do check "#10 operator heading" "## $h" $TRI $WF; done
# 11 hand-off sentences
check "#11 hand-off label" '**Hand-off to scoping**:' $TRI
check "#11 blocked hand-off" '**Hand-off to scoping**: none. Triage is blocked - see B' $TRI
check "#11 blocked hand-off tail" 'The scope stage must not be run for this slug until the blocking entry is resolved.' $TRI
# 12 triage entry shapes
for l in '**Open** - ' '**Decided (' '**Blocked - ## ' '**Context**' '**Options**' '**Recommended**' '**Closes on**' '**Selected**' '**Because**' '**Obliges scoping to**' '**Unblocks on**'; do
  check "#12 triage entry" "$l" $TRI; done
# 13 scope entry shapes
for l in '] — Closed by [' '**Closed (' '**Context**' '**Options**' '**Recommended**'; do check "#13 scope entry" "$l" $SCO; done
# 14 spec entry shapes
for l in '**Closed (' '**Context**' '**Options**' '**Selected**'; do check "#14 spec entry" "$l" $SPE; done
# 15 scope sections
for l in '## Executive Summary' '## Goals' '## Non-Goals' '## Files Affected' '**Reads**:' '**Creates or modifies**:' '**Not yet enumerated**:' '## Dependencies' '## Open Questions'; do
  check "#15 scope section" "$l" $SCO; done
check "#15 scope section in script" '## Executive Summary' $WF
# 16 spec sections
for l in '## Implementation Plan' '### Phase ' '**Goal**:' '**Agent routing**:' '**Depends on**:' '#### Scope' '**IN**:' '**OUT**:' '#### Tasks' '#### Tests' '#### Acceptance Criteria' '## Invariance' '**Reframing**:' '**Surviving claim**:' '**Falsifier**:' '## Standards References' '## Open Questions'; do
  check "#16 spec section" "$l" $SPE; done
check "#16 spec section in script" '## Implementation Plan' $WF
check "#16 spec section in command" '### Phase ' $CMD
# 17 self-check fence
check "#17 fence" 'END OF EMITTED ARTIFACT' $TRI $SCO $SPE
check "#17 self-check" '## Composition-Time Self-Check' $TRI $SCO $SPE
check "#17 part A" '### Part A — decidable from the artifact alone' $TRI $SCO $SPE
check "#17 part B" '### Part B — requires the working tree' $TRI $SCO $SPE
check "#17 critic prompt" 'Part A of the Composition-Time Self-Check' $WF
# 18 spec part B headings
check "#18 grounding" '#### Grounding' $SPE
check "#18 invariants" '#### Project Invariants' $SPE
# 22 phase titles
for t in Triage Scope Spec Implement Validate; do
  if grep -qE "['\"]$t['\"]" "$WF" 2>/dev/null; then echo "PASS  #22 phase title: $t"
  else echo "FAIL  #22 phase title '$t' not found as a quoted string in $WF"; fails=$((fails+1)); fi
done
# 23-24 command-only literals
check "#23 inline refine rationale" 'selected by the developer without stated rationale' $CMD
check "#24 spec removal commit" 'chore(specs): remove <slug> pipeline artifacts' $CMD
# 25 phase-commit trailer, written by the implement committer and read back by re-entry slicing
check "#25 phase-commit trailer" 'Spec-Phase: ' $WF $CMD

# Workflow script syntax. A plain `node --check` on the script is not reliable (an ES module whose body
# uses top-level return/await), so the body is wrapped in an async function inside a temporary .mjs first.
if command -v node >/dev/null 2>&1; then
  TMP="$(mktemp -d)"
  if node -e '
    const fs = require("fs");
    const src = fs.readFileSync(process.argv[1], "utf8");
    const i = src.indexOf("\n};\n");
    if (!src.startsWith("export const meta") || i < 0) { console.error("does not start with a literal export const meta = {...};"); process.exit(1); }
    fs.writeFileSync(process.argv[2], src.slice(0, i + 4) + "\nexport async function __body(args, agent, log, phase) {\n" + src.slice(i + 4) + "\n}\n");
  ' "$WF" "$TMP/check.mjs" && node --check "$TMP/check.mjs" 2>"$TMP/err"; then
    echo "PASS  workflow script parses"
  else
    echo "FAIL  workflow script syntax: $(head -5 "$TMP/err" 2>/dev/null | tr '\n' ' ')"; fails=$((fails+1))
  fi
  rm -rf "$TMP"
else
  echo "SKIP  workflow script syntax (node not installed)"
fi
# Workflow runtime limits: no clock, no randomness, no module or filesystem access.
# Comments are stripped first, since the "why" comments name the forbidden calls.
if hits=$(sed -E 's#(^|[[:space:]])//.*$##' "$WF" | grep -nE 'Date\.now|new Date\(|Math\.random|require\(|^import |process\.(env|argv|exit)') && [ -n "$hits" ]; then
  echo "FAIL  workflow script uses a forbidden runtime API:"; echo "$hits" | sed 's/^/        /'; fails=$((fails+1))
else echo "PASS  workflow script uses no clock, randomness, modules, or process APIs"; fi

targets=()
for t in payload starter-kit docs README.md ADOPT.md schema scripts CONTRIBUTING.md CLAUDE.md CHANGELOG.md; do [ -e "$t" ] && targets+=("$t"); done
# Optional private-term scan. Maintainers who extract examples from a private codebase list that
# codebase's names (one extended regex per line) in a file kept OUTSIDE this repository, and point
# SPEC_PIPELINE_BANNED_TERMS at it; .banned-terms at the repo root (git-ignored) is also read. The
# list itself is never committed, because naming the private terms would leak them.
BANNED_FILE="${SPEC_PIPELINE_BANNED_TERMS:-$ROOT/.banned-terms}"
if [ -f "$BANNED_FILE" ]; then
  if hits=$(grep -rniE -f <(grep -vE '^[[:space:]]*(#|$)' "$BANNED_FILE") "${targets[@]}" 2>/dev/null | grep -v '^scripts/check-contracts.sh:') && [ -n "$hits" ]; then
    echo "FAIL  banned terms found:"; echo "$hits" | sed 's/^/        /'; fails=$((fails+1))
  else echo "PASS  no banned terms ($BANNED_FILE)"; fi
else
  echo "SKIP  banned-term scan (no term list; set SPEC_PIPELINE_BANNED_TERMS or create .banned-terms)"
fi
# Email addresses
if hits=$(grep -rnE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}' "${targets[@]}" 2>/dev/null) && [ -n "$hits" ]; then
  echo "FAIL  email-like strings found:"; echo "$hits" | sed 's/^/        /'; fails=$((fails+1))
else echo "PASS  no email addresses"; fi

echo
if [ "$fails" -gt 0 ]; then echo "$fails check(s) FAILED"; exit 1; fi
echo "All contract checks passed"
