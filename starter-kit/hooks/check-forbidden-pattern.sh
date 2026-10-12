#!/bin/bash
# Claude Code PostToolUse hook skeleton: block a forbidden source pattern.
#
# Example check (the "Orderly" example project): a float( or Decimal( applied to a
# *_cents value in API code. Money is integer cents everywhere (CLAUDE.md
# "Money as Integer Cents"), so `float(amount_cents)` is always a bug.
#
# Adapt the five marked sections (PATH SCOPE, EXCLUSIONS, PATTERN, FALSE-POSITIVE
# FILTERS, MESSAGE) for your own invariant. Mechanize only checks with a very low
# false-positive rate; a noisy hook trains agents to work around it. The hook backs up
# the steering text; it never replaces it.
#
# Fires after Edit or Write (register with matcher "Edit|Write"; see README.md).
#
# Exit 0: no violation, or the file is out of scope.
# Exit 2: violation detected. stderr is fed back to Claude as corrective feedback.

set -euo pipefail

# Read the hook event JSON from stdin.
input=$(cat)

# Extract tool_input.file_path. jq is not guaranteed to be installed, so use python3,
# and degrade to "no path" (exit 0) rather than failing the edit.
file_path=$(printf '%s' "$input" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except Exception:
    print('')
" 2>/dev/null || true)

[ -z "$file_path" ] && exit 0

# --- PATH SCOPE: only Python files under api/ -----------------------------------------
case "$file_path" in
    */api/*.py|api/*.py) ;;
    *) exit 0 ;;
esac

# --- EXCLUSIONS: the file that defines the rule, and tests ----------------------------
case "$file_path" in
    */api/models/money.py|api/models/money.py) exit 0 ;;   # defines the conversions
    */tests/*|tests/*) exit 0 ;;                           # fixtures may use literals
    */test_*.py|test_*.py) exit 0 ;;
esac

[ ! -f "$file_path" ] && exit 0

# --- PATTERN: float( or Decimal( whose argument mentions a *_cents name ---------------
# grep -E (not -P) for portability. Matches e.g. float(amount_cents), Decimal(order.captured_cents).
PATTERN='(float|Decimal)\([^)]*[A-Za-z0-9_]*_cents'

# --- FALSE-POSITIVE FILTERS: comment lines and docstring-style examples ---------------
# grep -n output looks like "42:    x = float(amount_cents)". Drop lines whose code part
# starts with '#', and lines that read as documentation ("e.g.", "for example", ">>>").
hits=$(grep -nE "$PATTERN" "$file_path" 2>/dev/null \
    | grep -vE '^[0-9]+:[[:space:]]*#' \
    | grep -viE 'e\.g\.|for example|>>>' \
    || true)

[ -z "$hits" ] && exit 0

# --- MESSAGE: file, lines, exact fix, steering section --------------------------------
cat >&2 <<EOF
CONSTRAINT VIOLATION: a float or Decimal applied to an integer-cents value.

File: $file_path
$hits

FIX: keep money as int cents end to end. Use the helpers in api/models/money.py to
convert at the edge, and format only in the view. Never cross the API boundary with a
float or Decimal amount.

See CLAUDE.md "Money as Integer Cents" (under "Critical Constraints").
EOF
exit 2
