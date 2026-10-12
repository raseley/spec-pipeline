#!/usr/bin/env bash
# verify-adoption.sh - check that spec-pipeline is correctly installed in an adopter repository.
#
# Run from the adopter's repository root, or pass --repo <path>. Invoke it from a spec-pipeline
# checkout (bash /path/to/spec-pipeline/scripts/verify-adoption.sh --repo .) or copy it anywhere.
# It prints PASS / FAIL / SKIP per check and exits 1 if any check FAILs.
#
# It never runs test suites and never edits anything. ADOPT.md step 9 runs each suite explicitly.
#
# Needs bash plus python3 or node (to read the JSON config). node is also used for the
# workflow syntax check, which is SKIPped without it. If python3 has the `jsonschema` package and
# the schema is found (next to this script at ../schema/, or via --schema), the config is also
# validated against schema/spec-pipeline.schema.json.

set -u

REPO="."
SCHEMA=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo)   REPO="${2:?--repo needs a path}"; shift 2 ;;
    --schema) SCHEMA="${2:?--schema needs a path}"; shift 2 ;;
    -h|--help)
      sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
      echo "Usage: verify-adoption.sh [--repo <path>] [--schema <path>]"
      exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -z "$SCHEMA" ] && [ -f "$SCRIPT_DIR/../schema/spec-pipeline.schema.json" ]; then
  SCHEMA="$SCRIPT_DIR/../schema/spec-pipeline.schema.json"
fi
cd "$REPO" || { echo "FAIL  cannot enter repository $REPO"; exit 1; }

FAILS=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }
skip() { printf 'SKIP  %s\n' "$1"; }

CFG=".claude/spec-pipeline.json"
CMD=".claude/commands/spec-pipeline.md"
WF=".claude/workflows/spec-pipeline.js"

# ---------------------------------------------------------------------------------------------
# Config reader. Prints tab-separated "key<TAB>value" lines. "error" lines are validation
# failures; the checks mirror validateConfig() in the workflow script. Two implementations
# (python3, node) with identical output so either interpreter suffices.
# ---------------------------------------------------------------------------------------------
PY_READER='
import json, re, sys
path, schema = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "")
out = []
def emit(k, v): out.append(k + "\t" + str(v).replace("\t", " ").replace("\n", " "))
try:
    with open(path, encoding="utf-8") as f: c = json.load(f)
except Exception as e:
    print("fatal\tconfig does not parse as JSON: %s" % e); sys.exit(0)
if not isinstance(c, dict):
    print("fatal\tconfig is not a JSON object"); sys.exit(0)
def s(x): return isinstance(x, str) and x.strip() != ""
def sa(x): return isinstance(x, list) and all(s(i) for i in x)
def obj(x): return isinstance(x, dict)
errs = []
if c.get("version") != 1: errs.append("version must be 1")
if not (obj(c.get("project")) and s(c["project"].get("name"))): errs.append("project.name is required")
git = c.get("git") if obj(c.get("git")) else {}
if "branch_prefixes" in git and not (sa(git["branch_prefixes"]) and git["branch_prefixes"]): errs.append("git.branch_prefixes must be a non-empty array of strings")
lanes = c.get("lanes")
names, laned = [], []
if not (isinstance(lanes, list) and lanes): errs.append("lanes must be a non-empty array"); lanes = []
for i, l in enumerate(lanes):
    if not obj(l): errs.append("lanes[%d] must be an object" % i); continue
    for k in ("name", "description", "architect", "dev", "targeted_tests"):
        if not s(l.get(k)): errs.append("lanes[%d].%s must be a non-empty string" % (i, k))
    if s(l.get("name")):
        if not re.match(r"^[a-z0-9]+(-[a-z0-9]+)*$", l["name"]): errs.append("lanes[%d].name must be kebab-case" % i)
        if l["name"] in names: errs.append("lane name %s is not unique" % l["name"])
        names.append(l["name"])
    if not (sa(l.get("paths")) and l.get("paths")): errs.append("lanes[%d].paths must be a non-empty array of globs" % i)
    for k in ("other_agents", "narrow_dirs"):
        if k in l and not sa(l[k]): errs.append("lanes[%d].%s must be an array of strings" % (i, k))
    laned += [x for x in [l.get("architect"), l.get("dev")] + list(l.get("other_agents") or []) if s(x)]
unl = c.get("unlaned_agents", [])
if not sa(unl): errs.append("unlaned_agents must be an array of strings"); unl = []
for x in unl:
    if x in laned: errs.append("%s is listed both in a lane and in unlaned_agents" % x)
suites = c.get("suites")
if not (isinstance(suites, list) and suites): errs.append("suites must be a non-empty array"); suites = []
snames = []
for i, x in enumerate(suites):
    if not obj(x): errs.append("suites[%d] must be an object" % i); continue
    if not (s(x.get("name")) and s(x.get("command"))): errs.append("suites[%d] needs a non-empty name and command" % i)
    t = x.get("timeout_ms", 600000)
    if not (isinstance(t, int) and not isinstance(t, bool) and 1 <= t <= 1800000): errs.append("suites[%d].timeout_ms must be an integer in 1..1800000" % i)
    if s(x.get("name")):
        if x["name"] in snames: errs.append("suite name %s is not unique" % x["name"])
        snames.append(x["name"])
models = c.get("models", {})
if not obj(models) or not all(s(v) for v in models.values()): errs.append("models values must be non-empty strings")
ta = c.get("triage_agent")
if ta is not None and not s(ta): errs.append("triage_agent must be a non-empty string or null")
for e in errs: emit("error", e)
if schema:
    try:
        import jsonschema
        with open(schema, encoding="utf-8") as f: sch = json.load(f)
        v = jsonschema.Draft7Validator(sch)
        se = sorted(v.iter_errors(c), key=lambda e: list(e.path))
        if se:
            for e in se: emit("schema_error", "/".join(str(p) for p in e.path) + ": " + e.message)
        else: emit("schema_ok", "1")
    except ImportError: emit("schema_skip", "python3 jsonschema package not installed")
    except Exception as e: emit("schema_skip", "schema could not be applied: %s" % e)
st = c.get("steering") if obj(c.get("steering")) else {}
emit("specs_dir", (c.get("specs_dir") or "docs/specs").rstrip("/"))
emit("agents_dir", (c.get("agents_dir") or ".claude/agents").rstrip("/"))
emit("steering_file", st.get("file") or "CLAUDE.md")
emit("routing_heading", st.get("routing_heading") or "### Agent Selection")
emit("invariants_heading", st.get("invariants_heading") or "## Critical Constraints")
for n in names: emit("lane", n)
for l in lanes:
    if obj(l) and s(l.get("architect")): emit("architect", l["architect"])
for p in (git.get("branch_prefixes") if sa(git.get("branch_prefixes")) and git.get("branch_prefixes") else ["feat", "fix"]): emit("prefix", p)
agents = []
for x in laned + unl + ([ta] if s(ta) else []):
    if x not in agents: agents.append(x)
for x in agents: emit("agent", x)
for x in laned + unl:
    emit("routable", x)
for x in suites:
    if obj(x): emit("suite_cwd", x.get("cwd") or ".")
for x in c.get("invariants", []) if sa(c.get("invariants", [])) else []: emit("invariant", x)
for x in c.get("mandatory_tests", []) if isinstance(c.get("mandatory_tests", []), list) else []:
    if obj(x) and s(x.get("rule")): emit("rule_file", x["rule"])
print("\n".join(out))
'

NODE_READER='
const fs = require("fs");
const [path, schema] = process.argv.slice(1); // node -e has no script entry in argv
const out = [];
const emit = (k, v) => out.push(k + "\t" + String(v).replace(/[\t\n]/g, " "));
let c;
try { c = JSON.parse(fs.readFileSync(path, "utf8")); }
catch (e) { console.log("fatal\tconfig does not parse as JSON: " + e.message); process.exit(0); }
const obj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
if (!obj(c)) { console.log("fatal\tconfig is not a JSON object"); process.exit(0); }
const s = (x) => typeof x === "string" && x.trim() !== "";
const sa = (x) => Array.isArray(x) && x.every(s);
const errs = [];
if (c.version !== 1) errs.push("version must be 1");
if (!(obj(c.project) && s(c.project.name))) errs.push("project.name is required");
const git = obj(c.git) ? c.git : {};
if ("branch_prefixes" in git && !(sa(git.branch_prefixes) && git.branch_prefixes.length)) errs.push("git.branch_prefixes must be a non-empty array of strings");
let lanes = c.lanes; const names = [], laned = [];
if (!(Array.isArray(lanes) && lanes.length)) { errs.push("lanes must be a non-empty array"); lanes = []; }
lanes.forEach((l, i) => {
  if (!obj(l)) { errs.push(`lanes[${i}] must be an object`); return; }
  for (const k of ["name", "description", "architect", "dev", "targeted_tests"]) if (!s(l[k])) errs.push(`lanes[${i}].${k} must be a non-empty string`);
  if (s(l.name)) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(l.name)) errs.push(`lanes[${i}].name must be kebab-case`);
    if (names.includes(l.name)) errs.push(`lane name ${l.name} is not unique`);
    names.push(l.name);
  }
  if (!(sa(l.paths) && l.paths.length)) errs.push(`lanes[${i}].paths must be a non-empty array of globs`);
  for (const k of ["other_agents", "narrow_dirs"]) if (k in l && !sa(l[k])) errs.push(`lanes[${i}].${k} must be an array of strings`);
  laned.push(...[l.architect, l.dev, ...(l.other_agents || [])].filter(s));
});
let unl = c.unlaned_agents === undefined ? [] : c.unlaned_agents;
if (!sa(unl)) { errs.push("unlaned_agents must be an array of strings"); unl = []; }
for (const x of unl) if (laned.includes(x)) errs.push(`${x} is listed both in a lane and in unlaned_agents`);
let suites = c.suites; const snames = [];
if (!(Array.isArray(suites) && suites.length)) { errs.push("suites must be a non-empty array"); suites = []; }
suites.forEach((x, i) => {
  if (!obj(x)) { errs.push(`suites[${i}] must be an object`); return; }
  if (!(s(x.name) && s(x.command))) errs.push(`suites[${i}] needs a non-empty name and command`);
  const t = x.timeout_ms === undefined ? 600000 : x.timeout_ms;
  if (!(Number.isInteger(t) && t >= 1 && t <= 1800000)) errs.push(`suites[${i}].timeout_ms must be an integer in 1..1800000`);
  if (s(x.name)) { if (snames.includes(x.name)) errs.push(`suite name ${x.name} is not unique`); snames.push(x.name); }
});
const models = c.models === undefined ? {} : c.models;
if (!obj(models) || !Object.values(models).every(s)) errs.push("models values must be non-empty strings");
const ta = c.triage_agent;
if (ta !== undefined && ta !== null && !s(ta)) errs.push("triage_agent must be a non-empty string or null");
errs.forEach(e => emit("error", e));
if (schema) emit("schema_skip", "schema validation needs python3 with the jsonschema package");
const st = obj(c.steering) ? c.steering : {};
emit("specs_dir", (c.specs_dir || "docs/specs").replace(/\/+$/, ""));
emit("agents_dir", (c.agents_dir || ".claude/agents").replace(/\/+$/, ""));
emit("steering_file", st.file || "CLAUDE.md");
emit("routing_heading", st.routing_heading || "### Agent Selection");
emit("invariants_heading", st.invariants_heading || "## Critical Constraints");
names.forEach(n => emit("lane", n));
lanes.forEach(l => { if (obj(l) && s(l.architect)) emit("architect", l.architect); });
((sa(git.branch_prefixes) && git.branch_prefixes.length) ? git.branch_prefixes : ["feat", "fix"]).forEach(p => emit("prefix", p));
const agents = [];
for (const x of [...laned, ...unl, ...(s(ta) ? [ta] : [])]) if (!agents.includes(x)) agents.push(x);
agents.forEach(x => emit("agent", x));
[...laned, ...unl].forEach(x => emit("routable", x));
suites.filter(obj).forEach(x => emit("suite_cwd", x.cwd || "."));
(sa(c.invariants) ? c.invariants : []).forEach(x => emit("invariant", x));
(Array.isArray(c.mandatory_tests) ? c.mandatory_tests : []).forEach(x => { if (obj(x) && s(x.rule)) emit("rule_file", x.rule); });
console.log(out.join("\n"));
'

HAVE_NODE=0; command -v node >/dev/null 2>&1 && HAVE_NODE=1
HAVE_PY=0; command -v python3 >/dev/null 2>&1 && HAVE_PY=1

echo "spec-pipeline adoption check in $(pwd)"
echo

# 1. Config parses, version 1, required keys, unique lane names.
if [ ! -f "$CFG" ]; then
  fail "1 config: $CFG is missing"
  echo; echo "$FAILS check(s) failed. Nothing else can be checked without the config."; exit 1
fi
if [ "$HAVE_PY" = 1 ]; then
  READOUT="$(python3 -c "$PY_READER" "$CFG" "$SCHEMA")"
elif [ "$HAVE_NODE" = 1 ]; then
  READOUT="$(node -e "$NODE_READER" "$CFG" "$SCHEMA")"
else
  fail "1 config: neither python3 nor node is available to read $CFG"
  echo; echo "$FAILS check(s) failed."; exit 1
fi

get()  { printf '%s\n' "$READOUT" | awk -F'\t' -v k="$1" '$1==k{ sub(/^[^\t]*\t/, ""); print; exit }'; }
list() { printf '%s\n' "$READOUT" | awk -F'\t' -v k="$1" '$1==k{ sub(/^[^\t]*\t/, ""); print }'; }

FATAL="$(get fatal)"
if [ -n "$FATAL" ]; then
  fail "1 config: $FATAL"
  echo; echo "$FAILS check(s) failed. Nothing else can be checked without a readable config."; exit 1
fi
ERRS="$(list error)"
if [ -z "$ERRS" ]; then
  pass "1 config: $CFG parses, version 1, required keys present, lane and suite names unique"
else
  while IFS= read -r e; do fail "1 config: $e"; done <<< "$ERRS"
fi
if [ -n "$(get schema_ok)" ]; then
  pass "1 config: validates against $(basename "$SCHEMA")"
elif [ -n "$(list schema_error)" ]; then
  while IFS= read -r e; do fail "1 config schema: $e"; done <<< "$(list schema_error)"
elif [ -n "$(get schema_skip)" ]; then
  skip "1 config schema: $(get schema_skip)"
else
  skip "1 config schema: schema/spec-pipeline.schema.json not found (pass --schema <path>)"
fi

SPECS="$(get specs_dir)"
AGENTS_DIR="$(get agents_dir)"
STEERING="$(get steering_file)"
ROUTING="$(get routing_heading)"
INV_HEADING="$(get invariants_heading)"

# 2. Payload files present.
missing=""
for f in "$CMD" "$WF" "$SPECS/triage-template.md" "$SPECS/scope-template.md" "$SPECS/spec-template.md"; do
  [ -f "$f" ] || missing="$missing $f"
done
if [ -z "$missing" ]; then pass "2 payload: command, workflow, and the three templates under $SPECS/ are present"
else fail "2 payload: missing$missing"; fi

# 3. Workflow syntax. A plain `node --check` on the script does not reliably report errors (it
# is an ES module with top-level return/await), so the body is wrapped in an async function in a
# temporary .mjs and that file is checked.
if [ "$HAVE_NODE" = 1 ] && [ -f "$WF" ]; then
  TMP="$(mktemp -d)"
  if node -e '
    const fs = require("fs");
    const src = fs.readFileSync(process.argv[1], "utf8");
    const i = src.indexOf("\n};\n");
    if (!src.startsWith("export const meta") || i < 0) { console.error("does not start with a literal `export const meta = {...};`"); process.exit(1); }
    fs.writeFileSync(process.argv[2], src.slice(0, i + 4) + "\nexport async function __body(args, agent, log, phase) {\n" + src.slice(i + 4) + "\n}\n");
  ' "$WF" "$TMP/check.mjs" && node --check "$TMP/check.mjs" 2>"$TMP/err"; then
    pass "3 workflow: $WF parses"
  else
    fail "3 workflow: $WF has a syntax error: $(head -5 "$TMP/err" 2>/dev/null | tr '\n' ' ')"
  fi
  rm -rf "$TMP"
elif [ ! -f "$WF" ]; then
  skip "3 workflow: $WF is missing (see check 2)"
else
  skip "3 workflow: node is not installed; syntax not checked"
fi

# 4. Every configured agent has a definition whose name: matches (general-purpose is built in).
bad_agents=""
user_level=""
while IFS= read -r a; do
  [ -z "$a" ] && continue
  [ "$a" = "general-purpose" ] && continue
  file=""
  if [ -f "$AGENTS_DIR/$a.md" ]; then file="$AGENTS_DIR/$a.md"
  elif [ -n "${HOME:-}" ] && [ -f "$HOME/.claude/agents/$a.md" ]; then file="$HOME/.claude/agents/$a.md"; user_level="$user_level $a"
  fi
  if [ -z "$file" ]; then bad_agents="$bad_agents $a(no $AGENTS_DIR/$a.md)"; continue; fi
  fm_name="$(awk 'NR==1 && $0!="---"{exit} NR>1 && $0=="---"{exit} NR>1 && /^name:/{ sub(/^name:[ \t]*/, ""); gsub(/["\047\r]/, ""); sub(/[ \t]+$/, ""); print; exit }' "$file")"
  [ "$fm_name" = "$a" ] || bad_agents="$bad_agents $a(name: is '${fm_name}')"
done <<< "$(list agent)"
if [ -z "$bad_agents" ]; then
  pass "4 agents: every configured agent resolves with a matching name:${user_level:+ (user-level:$user_level)}"
else
  fail "4 agents:$bad_agents"
fi

# 5. No ADOPT markers remain in the templates or in the configured agents' definitions.
marker_files=""
for f in "$SPECS/triage-template.md" "$SPECS/scope-template.md" "$SPECS/spec-template.md"; do
  [ -f "$f" ] && grep -q 'ADOPT:' "$f" && marker_files="$marker_files $f($(grep -c 'ADOPT:' "$f"))"
done
while IFS= read -r a; do
  [ -z "$a" ] && continue
  f="$AGENTS_DIR/$a.md"
  [ -f "$f" ] && grep -q 'ADOPT:' "$f" && marker_files="$marker_files $f($(grep -c 'ADOPT:' "$f"))"
done <<< "$(list agent)"
if [ -z "$marker_files" ]; then pass "5 markers: no ADOPT: markers remain"
else fail "5 markers: unresolved ADOPT: markers in$marker_files"; fi

# Tokenize a line into words split on whitespace and the placeholder punctuation [ ] | , :
tokens() { printf '%s\n' "$1" | tr '[]|,:`' '      ' | tr -s ' \t' '\n\n'; }

# 6. Triage **Lane**: line names every lane; spec **Agent routing**: placeholder names every routable agent.
if [ -f "$SPECS/triage-template.md" ]; then
  lane_line="$(grep -m1 '^\*\*Lane\*\*:' "$SPECS/triage-template.md")"
  lane_toks="$(tokens "$lane_line")"
  miss=""
  while IFS= read -r l; do [ -z "$l" ] && continue; printf '%s\n' "$lane_toks" | grep -qxF "$l" || miss="$miss $l"; done <<< "$(list lane)"
  if [ -z "$lane_line" ]; then fail "6 triage template: no **Lane**: line"
  elif [ -z "$miss" ]; then pass "6 triage template: **Lane**: line lists every configured lane"
  else fail "6 triage template: **Lane**: line is missing lane(s):$miss"; fi
  branch_line="$(grep -m1 '^\*\*Branch\*\*:' "$SPECS/triage-template.md")"
  miss=""
  while IFS= read -r p; do [ -z "$p" ] && continue; printf '%s\n' "$branch_line" | grep -qF "$p/<slug>" || miss="$miss $p/<slug>"; done <<< "$(list prefix)"
  printf '%s\n' "$branch_line" | grep -qF 'unresolved - triage blocked on routing' || miss="$miss (the unresolved string)"
  if [ -z "$miss" ]; then pass "6 triage template: **Branch**: line lists every git.branch_prefixes entry and the unresolved string"
  else fail "6 triage template: **Branch**: line is missing:$miss"; fi
  handoff="$(grep -m1 '^\*\*Hand-off to scoping\*\*: `' "$SPECS/triage-template.md")"
  handoff_toks="$(tokens "$(printf '%s\n' "$handoff" | tr '<>' '  ')")"
  miss=""
  while IFS= read -r a; do [ -z "$a" ] && continue; printf '%s\n' "$handoff_toks" | grep -qxF "$a" || miss="$miss $a"; done <<< "$(list architect | awk '!seen[$0]++')"
  if [ -z "$handoff" ]; then fail "6 triage template: no routed **Hand-off to scoping**: sentence"
  elif [ -z "$miss" ]; then pass "6 triage template: routed hand-off sentence names every lane architect"
  else fail "6 triage template: routed hand-off sentence is missing architect(s):$miss"; fi
else
  skip "6 triage template: missing (see check 2)"
fi
if [ -f "$SPECS/spec-template.md" ]; then
  route_line="$(grep -m1 '^\*\*Agent routing\*\*:' "$SPECS/spec-template.md")"
  route_toks="$(tokens "$route_line")"
  miss=""
  while IFS= read -r a; do [ -z "$a" ] && continue; printf '%s\n' "$route_toks" | grep -qxF "$a" || miss="$miss $a"; done <<< "$(list routable | awk '!seen[$0]++')"
  if [ -z "$route_line" ]; then fail "6 spec template: no **Agent routing**: line"
  elif [ -z "$miss" ]; then pass "6 spec template: **Agent routing**: placeholder lists every routable agent"
  else fail "6 spec template: **Agent routing**: placeholder is missing agent(s):$miss"; fi
else
  skip "6 spec template: missing (see check 2)"
fi

# 7. The three no-questions sentences, byte-exact (triage's plain hyphen, scope's and spec's em dash).
lit_check() {
  if [ ! -f "$1" ]; then skip "7 literal: $1 missing (see check 2)"
  elif grep -qF "$2" "$1"; then pass "7 literal: \"$2\" in $1"
  else fail "7 literal: \"$2\" not found in $1 (it is byte-coupled to the workflow and the command)"; fi
}
lit_check "$SPECS/triage-template.md" "No open questions - scoping may begin."
lit_check "$SPECS/scope-template.md"  "No open questions — spec drafting may begin."
lit_check "$SPECS/spec-template.md"   "No open questions — implementation may begin."

# 8. Steering file exists and has the routing heading (and a heading per configured invariant).
has_heading() { awk -v h="$2" '{ sub(/[ \t\r]+$/, "") } $0 == h { f = 1 } END { exit !f }' "$1"; }
if [ ! -f "$STEERING" ]; then
  fail "8 steering: $STEERING is missing"
else
  if has_heading "$STEERING" "$ROUTING"; then pass "8 steering: $STEERING has the heading \"$ROUTING\""
  else fail "8 steering: $STEERING has no line exactly \"$ROUTING\" (steering.routing_heading)"; fi
  miss=""
  while IFS= read -r inv; do
    [ -z "$inv" ] && continue
    awk -v n="$inv" '{ sub(/[ \t\r]+$/, "") } /^#+[ \t]/ { h = $0; sub(/^#+[ \t]+/, "", h); if (h == n) f = 1 } END { exit !f }' "$STEERING" || miss="$miss \"$inv\""
  done <<< "$(list invariant)"
  if [ -n "$(list invariant)" ]; then
    if has_heading "$STEERING" "$INV_HEADING"; then pass "8 steering: $STEERING has the invariants heading \"$INV_HEADING\""
    else fail "8 steering: $STEERING has no line exactly \"$INV_HEADING\" (steering.invariants_heading)"; fi
  fi
  miss=""
  for ap in "Tests a wrong program passes too" "Source-shape assertions with no named invariant"; do
    grep -qF "$ap" "$STEERING" || miss="$miss \"$ap\""
  done
  if [ -z "$miss" ]; then pass "8 steering: both anti-patterns the architect review cites are named in $STEERING"
  else fail "8 steering: anti-pattern name(s) missing from $STEERING (cited by the review, keep them verbatim):$miss"; fi
  miss=""
  while IFS= read -r a; do [ -z "$a" ] && continue; grep -qE "(^|[^A-Za-z0-9_-])$a([^A-Za-z0-9_-]|$)" "$STEERING" || miss="$miss $a"; done <<< "$(list agent)"
  if [ -z "$miss" ]; then pass "8 steering: every configured agent is named in $STEERING (the routing table)"
  else fail "8 steering: agent(s) not named anywhere in $STEERING; add a row under \"$ROUTING\":$miss"; fi
  if [ "$STEERING" != "CLAUDE.md" ]; then
    if [ -f CLAUDE.md ] && grep -qF "@$STEERING" CLAUDE.md; then pass "8 steering: CLAUDE.md imports @$STEERING"
    else fail "8 steering: steering.file is $STEERING, but no CLAUDE.md imports it with an @$STEERING line (Claude Code injects only CLAUDE.md)"; fi
  fi
  if [ -z "$(list invariant)" ]; then skip "8 steering: no invariants configured"
  elif [ -z "$miss" ]; then pass "8 steering: every configured invariant is a heading in $STEERING"
  else fail "8 steering: no heading in $STEERING for invariant(s):$miss"; fi
fi

# 9. Each suite's cwd exists.
miss=""
while IFS= read -r d; do [ -z "$d" ] && continue; [ -d "$d" ] || miss="$miss $d"; done <<< "$(list suite_cwd)"
if [ -z "$miss" ]; then pass "9 suites: every suites[].cwd exists"
else fail "9 suites: cwd not found:$miss"; fi

# 10. Rule files named by mandatory_tests exist (the dev prompt tells agents to open them by name).
if [ -z "$(list rule_file)" ]; then
  skip "10 rules: no mandatory_tests[].rule configured"
else
  miss=""
  while IFS= read -r r; do [ -z "$r" ] && continue; [ -f "$r" ] || miss="$miss $r"; done <<< "$(list rule_file)"
  if [ -z "$miss" ]; then pass "10 rules: every mandatory_tests[].rule file exists"
  else fail "10 rules: missing:$miss"; fi
fi

# 11. No example-project ("Orderly") residue in the files the agents read. The starter kit and the
# templates ship filled in for Orderly; a leftover name teaches agents to look for code that does not
# exist. A token is ignored when it is genuinely this repository's (a configured agent, an existing path).
RESIDUE_FILES=""
for f in "$SPECS/triage-template.md" "$SPECS/scope-template.md" "$SPECS/spec-template.md" "$STEERING"; do [ -f "$f" ] && RESIDUE_FILES="$RESIDUE_FILES $f"; done
while IFS= read -r a; do [ -n "$a" ] && [ -f "$AGENTS_DIR/$a.md" ] && RESIDUE_FILES="$RESIDUE_FILES $AGENTS_DIR/$a.md"; done <<< "$(list agent)"
residue=""
for tok in Orderly require_tenant RefundNotificationPayload amount_cents refunded_total_cents OrderTable test_refunds \
           "Money as Integer Cents" "Tenant Scoping" "Background Job Payloads" "Migrations Are Additive" \
           api-architect api-dev web-architect web-dev docs-writer \
           api/docs/patterns web/docs/patterns api/models/money.py api/deps/tenant.py api/jobs web/src/api/client.ts; do
  if list agent | grep -qxF "$tok"; then continue; fi
  if list invariant | grep -qxF "$tok"; then continue; fi
  case "$tok" in */*) [ -e "$tok" ] && continue ;; esac
  for f in $RESIDUE_FILES; do
    grep -qF -- "$tok" "$f" && residue="$residue $f:\"$tok\""
  done
done
if [ -z "$residue" ]; then pass "11 residue: no example-project (Orderly) names remain in the templates, steering file, or agents"
else fail "11 residue: example-project names remain (replace them with this repository's):$residue"; fi

echo
if [ "$FAILS" -eq 0 ]; then
  echo "All checks passed. Next: run each suites[].command once, then dry-run /spec-pipeline on a toy idea (ADOPT.md step 9)."
  exit 0
fi
echo "$FAILS check(s) failed."
exit 1
