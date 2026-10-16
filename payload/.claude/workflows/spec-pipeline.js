export const meta = {
  name: "spec-pipeline",
  description:
    "Run one stage of triage -> scope -> spec -> implement -> validate for a workstream, writing <specs_dir>/<slug>-*.md (docs/specs by default). The workflow is re-entrant. The orchestrating session passes the stage to run and the project configuration (.claude/spec-pipeline.json) as args.config. The orchestrator reviews each return. It auto-advances to the next stage when no open_questions, block, halt, or failure needs the human. Otherwise the human reviews and then advances or refines. Structural rework re-invokes the same stage with feedback, and the stage revises its artifact in place. The orchestrator applies trivial edits inline without a workflow run. The git-tracked <specs_dir>/<slug>-*.md files carry state across invocations and across sessions. Nothing depends on a long-running process.",
  phases: [
    // `model` here is display-only, and it shows the default tier (config.models). The tier each
    // call actually runs on is set by the `model` option on its agent() call below, read from
    // args.config.models; every call sets one explicitly, so no call inherits the session model
    // or an agent definition's frontmatter.
    { title: "Triage",    detail: "Verify the raw idea against the tree, route to a configured lane's architect and classify the change type (branch prefix) - or return blocked when routing cannot be decided; write <specs_dir>/<slug>-triage.md; triage-tier draft/revise, critic-tier critic", model: "opus" },
    { title: "Scope",     detail: "Goals, non-goals, files-affected; write <specs_dir>/<slug>-scope.md. Compose: a scope-tier plan partitions the source's anchors (1 to 6, sized to the source). One scope-tier drafter per partition, a scope-tier synthesizer, and parallel critic-tier critics (template, per-partition fidelity, tree grounding). Scope-tier revise and critic-tier scoped re-check, up to 2 rounds. Feedback: one scope-tier reviser, one critic-tier critic", model: "opus" },
    { title: "Spec",      detail: "Draft <specs_dir>/<slug>.md per <specs_dir>/spec-template.md (Status: Draft). Compose: a spec-tier (top tier by default) plan reads the scope and fixes the phase outline, core principle, shared interfaces, and partitions (1 to 6, sized to the scope). One spec-tier drafter per partition writes its design and full phase blocks, a spec-tier synthesizer writes the file, and parallel critic-tier critics (template, per-partition narrowest reader, per-partition scope fidelity, cross-partition coherence) audit. Spec-tier revise and critic-tier scoped re-check, up to 2 rounds. Feedback: one spec-tier reviser, one critic-tier critic", model: "fable" },
    { title: "Implement", detail: "Run each spec phase via its routed dev agent (impl tier; implModel escalates); criteria-check (check tier), then qualitative architect review (review tier) only if that passes; commit each passed phase (commit tier); halts at the first failing phase", model: "opus" },
    { title: "Validate",  detail: "Full-suite regression gate before ship: run every configured full suite, report-only", model: "sonnet" }
  ]
};

// `args` is an internal contract assembled by the orchestrating session from the
// developer's plain English (see .claude/commands/spec-pipeline.md), never hand-typed.
//   config    the parsed .claude/spec-pipeline.json, passed verbatim on every call. This script
//             has no filesystem access, so the config is its only view of the project: lanes,
//             agents, test commands, paths, invariants, and model tiers all come from here.
//   stage     which single stage to run: "triage" | "scope" | "spec" | "implement" | "validate"
//   slug      kebab-case workstream slug; names the <specs_dir>/<slug>-*.md corpus and the
//             <prefix>/<slug> branch (prefix per triage, one of config.git.branch_prefixes)
//   date      today's date (YYYY-MM-DD) stamped from session context. The body must not read a clock.
//   idea      the developer's raw idea prose (triage only)
//   feedback  this round's reviewer notes, for structural rework only (optional). The orchestrator
//             applies trivial edits inline without invoking the workflow. It sends only the
//             current round's notes, because prior rounds are already in the on-disk artifact.
//             It passes feedback only when the stage's artifact already exists on disk. The
//             stage then revises that artifact in place instead of redrafting it.
//   architect carried forward from the triage return (or recovered from the triage artifact's
//             **Lane**: line): one of config.lanes[].architect. Required for scope, spec, implement.
//   phases    always rebuilt by the orchestrator from <specs_dir>/<slug>.md's phase headings
//             and "**Agent routing**:" lines, never carried forward from the spec return, so the
//             on-disk spec is the single source of truth: [{ title, agent, scope, acceptance }].
//             On re-entry after a halt, the orchestrator sends only the phases not yet passed
//             (see the command doc, Step 3). The loop below runs whatever it receives.
//   model     optional model override for every drafter, reviser, dev, and architect-review call,
//             replacing that call's configured tier (e.g. "opus" when the spec tier is unavailable).
//             Critics, the criteria checker, and validate keep their own configured tiers.
//   implModel optional model for the implement stage's dev-agent calls only. It wins over `model`
//             and over config.models.impl. Use it to escalate: resend a halted phase with
//             implModel set to config.models.escalation without raising any other call's tier.
// `branch_prefix` is deliberately not an arg. Only the orchestrator uses it (branch setup, ship).
// `args` may arrive as a parsed object or as a JSON string depending on the host runtime, so
// normalize before destructuring. JSON.parse is a standard built-in with no clock and no randomness.
const a = typeof args === "string" ? JSON.parse(args) : (args || {});
const { slug, idea, date, stage, feedback, architect, phases, model, implModel } = a; // no new Date() in body
// Every agent() call below sets `model` explicitly. An omitted `model` would inherit the
// session model, not the agentType definition's frontmatter, so no call relies on that fallback.
// The `model` arg replaces the configured tier of each drafter, reviser, dev, and architect-review call.

// --- Configuration ---
// The config arrives as data in args. These two functions are pure: object spreads and checks,
// no I/O. Defaults here match docs/configuration.md and the command's own defaults, so a key the
// adopter omitted means the same thing to both.
const DEFAULT_MODELS = {
  triage: "opus", scope: "opus", spec: "fable", critic: "opus",
  impl: "opus", check: "opus", review: "opus", commit: "sonnet", validate: "sonnet", escalation: "fable"
};

function isObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }
function trimSlash(p) { return typeof p === "string" ? p.replace(/\/+$/, "") : p; }

function withDefaults(cfg) {
  if (!isObj(cfg)) return null;
  return {
    ...cfg,
    project: { description: "", ...(isObj(cfg.project) ? cfg.project : {}) },
    specs_dir: trimSlash(cfg.specs_dir || "docs/specs"),
    agents_dir: trimSlash(cfg.agents_dir || ".claude/agents"),
    rules_dir: trimSlash(cfg.rules_dir || ".claude/rules"),
    steering: {
      file: "CLAUDE.md",
      routing_heading: "### Agent Selection",
      invariants_heading: "## Critical Constraints",
      anti_patterns_heading: "### LLM-Behavior Corrections",
      reference_heading: "## Reference",
      ...(isObj(cfg.steering) ? cfg.steering : {})
    },
    git: { base_branch: "main", remote: "origin", branch_prefixes: ["feat", "fix"], ...(isObj(cfg.git) ? cfg.git : {}) },
    ship: { forge: "github", remove_artifacts_after_pr: true, ...(isObj(cfg.ship) ? cfg.ship : {}) },
    triage_agent: cfg.triage_agent || null,
    lanes: Array.isArray(cfg.lanes)
      ? cfg.lanes.map(l => (isObj(l) ? { other_agents: [], narrow_dirs: [], ...l } : l))
      : cfg.lanes,
    unlaned_agents: cfg.unlaned_agents || [],
    suites: Array.isArray(cfg.suites)
      ? cfg.suites.map(s => (isObj(s) ? { lane: null, setup: "", cwd: ".", timeout_ms: 600000, notes: "", ...s } : s))
      : cfg.suites,
    whole_suite_patterns: cfg.whole_suite_patterns || [],
    invariants: cfg.invariants || [],
    protected_guards: cfg.protected_guards || [],
    mandatory_tests: cfg.mandatory_tests || [],
    models: { ...DEFAULT_MODELS, ...(isObj(cfg.models) ? cfg.models : {}) }
  };
}

// Returns a string naming the first problem, or null. It checks only what this script relies on;
// the full JSON Schema (schema/spec-pipeline.schema.json in the spec-pipeline repository) is the
// adoption-time check. A bad config fails the call before any agent spends a token.
function validateConfig(c) {
  const str = (x) => typeof x === "string" && x.trim() !== "";
  const strArr = (x) => Array.isArray(x) && x.every(str);
  if (!c) return "args.config is missing; the orchestrator must pass the parsed .claude/spec-pipeline.json on every call";
  if (c.version !== 1) return `version must be 1 (got ${JSON.stringify(c.version)})`;
  if (!isObj(c.project) || !str(c.project.name)) return "project.name is required";
  for (const k of ["specs_dir", "agents_dir", "rules_dir"]) if (!str(c[k])) return `${k} must be a non-empty string`;
  for (const k of ["file", "routing_heading", "invariants_heading", "anti_patterns_heading", "reference_heading"]) {
    if (!str(c.steering[k])) return `steering.${k} must be a non-empty string`;
  }
  if (!str(c.git.base_branch) || !str(c.git.remote)) return "git.base_branch and git.remote must be non-empty strings";
  if (!strArr(c.git.branch_prefixes) || c.git.branch_prefixes.length === 0) return "git.branch_prefixes must be a non-empty array of strings";
  if (c.triage_agent !== null && !str(c.triage_agent)) return "triage_agent must be a non-empty string or null";
  if (!Array.isArray(c.lanes) || c.lanes.length === 0) return "lanes must be a non-empty array";
  const seen = [];
  for (const [i, l] of c.lanes.entries()) {
    if (!isObj(l)) return `lanes[${i}] must be an object`;
    for (const k of ["name", "description", "architect", "dev", "targeted_tests"]) {
      if (!str(l[k])) return `lanes[${i}].${k} must be a non-empty string`;
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(l.name)) return `lanes[${i}].name "${l.name}" must be kebab-case`;
    if (seen.includes(l.name)) return `lane name "${l.name}" is not unique`;
    seen.push(l.name);
    if (!strArr(l.paths) || l.paths.length === 0) return `lanes[${i}].paths must be a non-empty array of globs`;
    if (!strArr(l.other_agents)) return `lanes[${i}].other_agents must be an array of strings`;
    if (!strArr(l.narrow_dirs)) return `lanes[${i}].narrow_dirs must be an array of strings`;
  }
  if (!strArr(c.unlaned_agents)) return "unlaned_agents must be an array of strings";
  const laned = c.lanes.flatMap(l => [l.architect, l.dev, ...l.other_agents]);
  const both = c.unlaned_agents.find(x => laned.includes(x));
  if (both) return `"${both}" is listed both in a lane and in unlaned_agents`;
  if (!Array.isArray(c.suites) || c.suites.length === 0) return "suites must be a non-empty array";
  for (const [i, s] of c.suites.entries()) {
    if (!isObj(s)) return `suites[${i}] must be an object`;
    if (!str(s.name) || !str(s.command)) return `suites[${i}] needs a non-empty name and command`;
    if (!str(s.cwd)) return `suites[${i}].cwd must be a non-empty string`;
    if (typeof s.setup !== "string" || typeof s.notes !== "string") return `suites[${i}].setup and .notes must be strings`;
    if (!Number.isInteger(s.timeout_ms) || s.timeout_ms < 1 || s.timeout_ms > 1800000) {
      return `suites[${i}].timeout_ms must be an integer in 1..1800000 (the Bash tool's 30-minute cap)`;
    }
  }
  if (new Set(c.suites.map(s => s.name)).size !== c.suites.length) return "suite names must be unique";
  if (!strArr(c.whole_suite_patterns)) return "whole_suite_patterns must be an array of strings";
  if (!strArr(c.invariants)) return "invariants must be an array of strings";
  if (!strArr(c.protected_guards)) return "protected_guards must be an array of strings";
  if (!Array.isArray(c.mandatory_tests)) return "mandatory_tests must be an array";
  for (const [i, t] of c.mandatory_tests.entries()) {
    if (!isObj(t) || !str(t.when) || !str(t.requires)) return `mandatory_tests[${i}] needs non-empty "when" and "requires"`;
    if (t.rule !== undefined && t.rule !== null && typeof t.rule !== "string") return `mandatory_tests[${i}].rule must be a string`;
  }
  for (const k of Object.keys(DEFAULT_MODELS)) if (!str(c.models[k])) return `models.${k} must be a non-empty string`;
  return null;
}

const c = withDefaults(a.config);
const cfgError = validateConfig(c);
if (cfgError) {
  log(`spec-pipeline: invalid config - ${cfgError}. Nothing was run.`);
  return { stage, error: `invalid config: ${cfgError}` };
}

// Everything project-specific below is derived from the config, including the JSON-schema enums.
// A single-lane project yields one-element enums, which are valid JSON Schema.
const M           = c.models;
const SPECS       = c.specs_dir;   // every artifact and template path is `${SPECS}/...`
const LANE_NAMES  = c.lanes.map(l => l.name);
const ARCHITECTS  = [...new Set(c.lanes.map(l => l.architect))];
const DEVS        = [...new Set(c.lanes.map(l => l.dev))];
const PREFIXES    = c.git.branch_prefixes;
const ROUTABLE    = [...new Set(c.lanes.flatMap(l => [l.architect, l.dev, ...l.other_agents]).concat(c.unlaned_agents))];
const NARROW_DIRS = c.lanes.flatMap(l => l.narrow_dirs);
// The suites validate runs are, by definition, the whole-suite invocations implement must not run.
// Each entry names the command, where it runs from, and which suite it collects, so a targeted
// run of the same runner (a command plus a path) is not mistaken for it.
const WHOLE_SUITE = c.suites
  .map(s => `\`${s.command}\`${s.cwd !== "." ? ` from ${s.cwd}/` : ""} (the whole ${s.name} suite)`)
  .concat(c.whole_suite_patterns);

// An agent is mapped to the one lane that lists it. An agent listed by several lanes (for example
// `general-purpose` used for every lane) is ambiguous and maps to no lane; callers then fall back
// to the workstream's architect rather than guessing.
const laneOf = (agent) => {
  const hits = c.lanes.filter(l => l.architect === agent || l.dev === agent || l.other_agents.includes(agent));
  return hits.length === 1 ? hits[0] : null;
};

// Role sentence for every agent call that runs as a project agent. The definition file is cited
// "where the project ships one", because a lane may use a built-in agent type with no file.
const roleOf = (agent) =>
  `You are the \`${agent}\` subagent. Its definition, where the project ships one, is \`${c.agents_dir}/${agent}.md\`.`;

// "A concrete surface" replaces any project vocabulary in the prompts. Goals, falsifiers, and
// anchors must land on something the tree can confirm or refute.
const SURFACE = "a concrete surface of this repository (a repo-rooted path, a symbol, a route, a test id, or a command's output)";

// The routing table, inlined from config. The steering file's routing heading is a
// cross-reference for the human-readable version; this table is what the triage agents route by,
// so routing never depends on a heading the adopter may have renamed.
const LANE_TABLE = c.lanes.map(l =>
    `- lane "${l.name}": ${l.description} Owns: ${l.paths.join(", ")}. Architect: ${l.architect}. Dev: ${l.dev}.${l.other_agents.length ? ` Other agents: ${l.other_agents.join(", ")}.` : ""}`
  ).join("\n")
  + (c.unlaned_agents.length ? `\nUnlaned agents (routable on a phase, never a triage role): ${c.unlaned_agents.join(", ")}.` : "")
  + `\n"manual" is not a routed outcome.`;

// open_questions lets any stage hand a decision back to the human between invocations.
// A workflow cannot prompt mid-run (AskUserQuestion is a main-loop tool, absent here), so a
// stage stops at its artifact and surfaces residual decisions rather than guessing past them.
//
// `context` is the field the operator reads first, and it is required. The stage that raised the
// question is the only party still holding the reasoning behind it. By the time the orchestrator
// renders the prompt, it has only these fields plus whatever it re-reads off disk. A paraphrase
// written at that point has to rebuild lost reasoning, and that is where it goes wrong or turns
// into filler. Because the schema requires it, a missing or empty `context` is a validation
// failure the agent retries, not prose guidance that gets ignored in a long prompt.
const OQ = {
  type: "array",
  items: {
    type: "object",
    required: ["question", "context", "options"],
    properties: {
      question: { type: "string" },
      context:  { type: "string" },
      // The 2-4 bound is enforced here, not left to OQ_GUIDANCE prose. A one-option entry is
      // not a decision, because there is nothing to choose. A five-option entry does not fit
      // AskUserQuestion, which caps at 4. The orchestrator cannot render either one to the
      // developer. A schema bound makes the agent retry. A prose rule tends to get ignored.
      options:  {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          required: ["label", "description"],
          properties: { label: { type: "string" }, description: { type: "string" } }
        }
      },
      recommended: { type: "string" } // must match one options[].label, or be omitted
    }
  }
};

// Interpolated into every doc stage's drafter and reviser prompt so the three stages describe the
// returned `context` the same way. Only the plain-language rule lives here. The 2-4 option bound
// is in the schema (OQ above). Copying the artifact's entries into the return is each stage's
// contract below.
const OQ_GUIDANCE =
  `open_questions is a returned field. The artifact's own question section stays technical.
   Each open_questions entry follows these rules:
   - "question" is the decision as one direct sentence.
   - "options" are the concrete choices.
   - Each option is a label of a few words plus what picking it means.
   - Never use free text where the choices can be listed.
   - "recommended" is the label you would pick.
   - Omit "recommended" entirely when you have no lean.
   - "context" is one paragraph or less of plain language.
   - Write "context" for someone who has not read the artifact and does not know this subsystem.
   - "context" says what decision is on the table.
   - "context" says what changes downstream depending on the answer.
   - "context" says why the decision could not be settled automatically.
   - "context" contains no file paths, type or class names, template or rule filenames, or pipeline jargon.
   - The reader must be able to choose an option from "context" alone.`;

// Test-run scope policy for the implement stage, interpolated into both the dev-agent prompt
// and the criteria-checker prompt so the two agents cannot disagree about what to run.
//
// The spec stage writes each phase's acceptance criteria. A spec that names a whole-suite run on
// every phase turns implement into N whole-suite runs by the dev agent plus N more by the
// checker. Each is a multi-minute run, repeated on every phase, for a result the validate stage
// produces once at the end for the whole workstream. The template and the spec-stage critic
// reject whole-suite criteria when the spec is written. This policy is the runtime backstop, and
// it also covers specs already on disk that were written before that rule. The forbidden list is
// built from config.suites[].command plus config.whole_suite_patterns, and the per-lane recipe
// for a targeted run from config.lanes[].targeted_tests.
const SCOPED_TESTS =
  `Test runs during implement are scoped to this phase and never run a whole suite.
   Run only what covers this phase:
   - the tests named under the phase's own Tests section.
   - the test modules that import or exercise the files this phase touched.
   - at most one narrow directory (${NARROW_DIRS.length ? NARROW_DIRS.join(", ") : "none is configured"}), only where the phase's surface genuinely is that whole tier.
   How to run a targeted selection per lane:
${c.lanes.map(l => `   - ${l.name}: ${l.targeted_tests}`).join("\n")}
   You must not run:
${WHOLE_SUITE.map(w => `   - ${w}.`).join("\n")}
   - any other invocation that collects a whole suite.
   The pipeline's validate stage owns the whole-suite regression gate and runs it once for the finished workstream.`;

// Rules under the rules directory are path-scoped. They load on their own only when the Read tool
// opens a matching source file, and agents often read source through Bash instead. So "use the
// applicable rules" left most agents without them. The agents that rarely got them natively
// open the rule files by name: the spec drafter, the spec critic, and the implement architect
// review. Scope and the implement dev agent keep the plain instruction. They get rules natively
// far more often, and the spec and review cover them. The file set differs per call and is
// passed in. A project with no rules directory loses nothing: the instruction is conditional.
const openRules = (fileSet) =>
  `Before you start, if ${c.rules_dir}/ exists, list it and check each rule file's \`paths:\`
   frontmatter. Read in full every rule whose globs match a file in ${fileSet}, and apply it.
   A rule you have not opened is not applied.`;

// Every doc stage's return carries open_questions, a field no critic can check. Every critique
// prompt audits the file, and the returned field never appears there. So each stage's drafter and
// reviser gets the same copying contract: the return is copied from the artifact's question
// section rather than worked out again. It is built once here and takes what differs per stage.
const mirroringContract = ({ section, openEntries, noneSentence }) => `
MIRRORING. The file on disk is authoritative. Return one open_questions entry per ${openEntries}
in the file's ${section} section, in the file's order. Return no other entries. A closed or
Decided entry gets no return entry. If the file has the sentence "${noneSentence}", return an empty array. If you return an
empty array, the file must have that sentence. Copy each entry's **Context** paragraph verbatim.
Copy each **Options** label and description verbatim. Copy the **Recommended** label verbatim.
Never rewrite these. Never invent a recommended label. Return the path of the file you actually wrote.`;

// Revisers also may not touch frontmatter the harness stamps. They have no clock, and a reviser
// that "fixes" a Date or Status makes it up.
const frozenFrontmatter = (lines) => `
FRONTMATTER. Leave the ${lines} lines byte-identical. The harness stamps them and you have no clock.`;

// The three no-questions sentences differ on purpose (triage's plain hyphen, scope's and spec's
// em dash). They are byte-matched against the templates and the command; do not tidy them.
const TRIAGE_MIRROR = mirroringContract({
  section: "## OUTPUT",
  openEntries: `**Open** entry and one per B entry (a B entry's returned "question"
begins with the literal "Blocking - ")`,
  noneSentence: "No open questions - scoping may begin."
});
const SCOPE_MIRROR = mirroringContract({
  section: "## Open Questions",
  openEntries: "still-open numbered entry",
  noneSentence: "No open questions — spec drafting may begin."
});
const SPEC_MIRROR = mirroringContract({
  section: "## Open Questions",
  openEntries: "still-open numbered entry",
  noneSentence: "No open questions — implementation may begin."
});

// Triage's return has a discriminator the schema cannot tie to the file (see the schema note at the
// triage stage). Drafter and reviser both read it off the artifact. The reviser is also the only
// agent on the feedback path, which is the only legal way to answer a blocking (B) entry. So it
// must know that answering a block is the one case where it moves the artifact out of Blocked.
const TRIAGE_STATUS = `
STATUS. Before returning, re-read the **Status**: line of the artifact you wrote. If it is
Blocked, return status:"blocked" with blocked_on and blocked_reason. A Blocked return has no
lane, architect, dev, or branch_prefix. If it is Draft or Decided, return status:"routed". Read
lane and architect off **Lane**:. Read branch_prefix off the **Branch**: prefix. Set dev to that
lane's dev agent from the lane table. Never invent a routing field to satisfy the schema.`;

// The reviser never sees the drafter's prompt, and answering a block means routing. So the lane
// table travels with the reviser contract too; without it a reviser could only guess a lane.
const TRIAGE_REVISER_CONTRACT = `${TRIAGE_MIRROR}${TRIAGE_STATUS}${frozenFrontmatter("**Slug** and **Date**")}
ANSWERING A BLOCK. This is the one case where you change that state. It applies when the feedback
answers a B entry. Replace the unfillable section with real content. Rewrite the frontmatter to a
routed Status, Lane, and Branch. Convert the B entry to a **Decided (${date})** entry. Return
status:"routed". Do not leave the artifact Blocked after answering its block.
LANES. Route only to a lane in this table, and take architect and dev from its row:
--- lane table ---
${LANE_TABLE}
--- end lane table ---`;

const SCOPE_REVISER_CONTRACT = `${SCOPE_MIRROR}${frozenFrontmatter("**Slug**, **Date**, and **Status**")}`;

// Spec is the only stage whose artifact is bound by an upstream artifact. revise() names only the
// artifact and the template. So a structural refine would rewrite Goals and Non-Goals without
// seeing the scope that authorized them, unless it is told to go read it.
const SPEC_REVISER_CONTRACT = `${SPEC_MIRROR}${frozenFrontmatter("**Date** and **Status**")}
A spec under revision stays Status: Draft. Advancing it to Final is the operator's decision.
UPSTREAM BINDING. Before touching ## Executive Summary, ### Goals, or ### Non-Goals, read
${SPECS}/${slug}-scope.md. Keep those sections faithful to its ## Goals and ## Non-Goals. If a
feedback point requires contradicting the scope, make the change. Then raise the divergence as a
numbered ## Open Questions entry and copy it into your return. Never widen or narrow the
commitment silently.`;

// Within-stage self-refinement, two paths chosen by whether reviewer feedback is present.
//
// Compose (no feedback): draft -> one full adversarial audit against the template and the
// applicable path-scoped rules -> up to 2 rounds of (revise -> scoped re-check). Only the
// first critique is a full audit. Each re-check verifies just the issues previously raised.
// That lets the loop stop as soon as those issues are resolved, instead of using up its round
// cap on new nitpicks from a fresh critic. A clean re-check therefore means "the full audit's
// issues are all resolved", not "re-audited from scratch".
//
// Feedback (a structural refine/rewind round): the artifact already exists on disk and
// already passed a full audit when it was composed, so redrafting would waste that work. One
// reviser applies the feedback to the artifact in place. Then one critic verifies only that
// each feedback point was addressed. There is no full re-audit and no loop. Trivial edits
// never reach this path: the orchestrator applies them inline without invoking the workflow
// (see .claude/commands/spec-pipeline.md, Step 1a).
//
// The critic keeps the architect's lane (agentType) so it has the same domain context. It runs
// on the critic tier (config.models.critic) because every critique prompt is a checklist that
// doesn't need the drafter's model tier. The drafter and reviser share `draftModel`, which every
// caller sets explicitly, so a revision is never written by a weaker model than the draft it
// overwrites and no stage inherits its tier from the session or an agent definition. The
// critique returned is the one that followed the last write, so the verdict always reflects the
// final on-disk artifact. The orchestrator reports "written but still flagged" rather than
// implying clean. A null critique means the critic agent was skipped or died: the verdict is
// unknown, not clean.
//
// Both paths replace the whole structured return with the reviser's, `open_questions` included.
// So every reviser gets OQ_GUIDANCE. On the compose path, where a prior round exists, it is also
// handed those questions to carry forward verbatim. The critics cannot catch a mistake here:
// they audit the artifact, and the returned plain-language open_questions never appear there.
//
// `stageInstructions` is the one per-stage extension point on that reviser prompt. It is an
// optional string appended at the end, and it reaches both paths because both call the same
// revise(). It carries a contract between a stage's return and its own artifact that no critic
// can enforce (triage's Status/Lane/Branch agreement, see TRIAGE_REVISER_CONTRACT). It defaults
// to "", so a caller that omits it changes nothing.
//
// The machinery is split three ways so the scope and spec compose paths can reuse it.
// refineKit() builds one stage's critic and reviser. reviseLoop() runs the revise -> scoped
// re-check rounds from any draft result and critique. refine() is the single-drafter path. Triage
// always takes it. Scope and spec take it only on feedback rounds. Their compose paths build
// their own draft and a merged lens critique, then hand both to the same reviseLoop(). A large
// composition is therefore revised and re-checked exactly as a small one is.

// Composition caps for the scope and spec compose paths. Each one bounds how many agents a
// compose round runs, and so how much source one agent must hold. A source with more natural
// divisions than a cap allows gets coarser groups, not dropped ones. Every place a cap applies
// logs what it bounded. meta is a pure literal, so its phase details repeat these numbers.
const MAX_SCOPE_PARTITIONS = 6;  // scope drafters, and so per-partition fidelity critics
const MAX_SPEC_PARTITIONS = 6;   // spec drafters, and so per-partition narrowest-reader and fidelity critics

// agents_run in the scope and spec returns counts every agent call the stage started, including
// calls that came back null. The orchestrator reports it, so a large composition's cost is visible.
let agentsRun = 0;
const runAgent = (prompt, opts) => { agentsRun++; return agent(prompt, opts); };

function refineKit(agentType, schema, label, ph, artifactPath, templatePath, { draftModel, stageInstructions = "" } = {}) {
  const draftOpts = { model: model || draftModel };
  // `lens` names one critic of a parallel panel. Its label must differ from its siblings', so the
  // progress tree and the journal can tell them apart. The single critic and every scoped
  // re-check keep the plain `${label}:critic` label.
  const critic = (prompt, lens) => runAgent(
    `${prompt} Set clean=true only if nothing checked is unmet. Otherwise list every unmet point in issues.`,
    {
      label: lens ? `${label}:critic:${lens}` : `${label}:critic`, phase: ph, agentType, model: M.critic,
      schema: {
        type: "object", required: ["clean", "issues"],
        properties: {
          clean: { type: "boolean" },
          issues: { type: "array", items: { type: "string" } }
        }
      }
    }
  );
  // The reviser inherits `schema`, so it must re-emit `open_questions`. Without help it would
  // never see the plain-language rule (OQ_GUIDANCE) or the rule that the return is copied from
  // the artifact (the stage's contract, appended via stageInstructions). Without both, a
  // revision round silently rewrites the drafter's questions and nothing catches it. Every
  // critique prompt audits the file, and open_questions is a return-only field never written there.
  const hasOQ = Boolean(schema?.properties?.open_questions);
  const oqInstructions = (priorOQ) => {
    if (!hasOQ) return "";
    // Carrying forward needs the prior round's questions supplied verbatim, because a
    // fresh-context reviser has never seen them. Without a prior round, the entries are copied
    // from the artifact's own question section, whose **Context** sub-bullet is already plain language.
    const carry = priorOQ
      ? `\nCarry open_questions forward verbatim from the previous round reproduced below. Keep
         the same wording for every question and context. Keep the same option labels and
         descriptions. Keep the same recommended label. Revise an entry only where a point above
         directly implicates it. Then revise only that entry.\n--- previous open_questions ---\n${JSON.stringify(priorOQ, null, 2)}\n--- end previous open_questions ---`
      : `\nThere is no previous round to carry open_questions forward from. Copy them from the
         artifact's question section as the MIRRORING rules below say.`;
    return `\n${OQ_GUIDANCE}${carry}`;
  };
  const revise = (instructions, priorOQ) => runAgent(
    `Read ${artifactPath} and revise it in place. Each agent call is a fresh context. Start by
     reading the artifact and ${templatePath}. Keep the artifact within the template's section
     bounds. Change nothing the points below do not implicate. Do not introduce new issues.
     Overwrite ${artifactPath} in place.\n${instructions}${oqInstructions(priorOQ)}${stageInstructions}`,
    { label: `${label}:revise`, phase: ph, agentType, schema, ...draftOpts }
  );
  return { agentType, schema, label, ph, artifactPath, templatePath, draftOpts, critic, revise };
}

// Up to 2 rounds of (revise -> scoped re-check), from a draft result and the critique of it.
// `rounds` tells a compose path whether the round cap, not a clean re-check, ended the loop.
async function reviseLoop(kit, result, critique) {
  let round = 0;
  for (; round < 2 && critique && !critique.clean; round++) {
    // Hand the current best questions forward so a round that fixes the artifact cannot rewrite
    // the questions as a side effect; `result` is the drafter's on round 0, the prior reviser's after.
    const revised = await kit.revise(
      `Resolve every issue below:\n${critique.issues.join("; ")}`,
      result?.open_questions
    );
    if (revised) result = revised; // reviser skipped/died — keep the prior result rather than dropping it
    critique = await kit.critic(   // scoped re-check so the loop can actually terminate early
      `Read ${kit.artifactPath}. Verify each previously-raised issue below is now resolved. Check
       only these issues. Do not open a fresh audit of the rest of the artifact.\n${critique.issues.join("; ")}`
    );
  }
  return { result, critique, rounds: round };
}

async function refine(agentType, draftPrompt, critiquePrompt, schema, label, ph, artifactPath, templatePath, { draftModel, feedback, stageInstructions = "" } = {}) {
  const kit = refineKit(agentType, schema, label, ph, artifactPath, templatePath, { draftModel, stageInstructions });

  if (feedback) {
    const result = await kit.revise(
      `--- reviewer feedback (address every point) ---\n${feedback}\n--- end feedback ---`
    );
    if (!result) return { result: null, critique: null }; // reviser skipped/died — nothing written to critique
    const critique = await kit.critic(
      `Read ${artifactPath}. Verify it addresses each reviewer feedback point below. Verify it
       stays within ${templatePath}'s section bounds. Check only these points. Do not re-audit
       the rest of the artifact.\n--- reviewer feedback ---\n${feedback}\n--- end feedback ---`
    );
    return { result, critique };
  }

  const result = await runAgent(draftPrompt, { label, phase: ph, agentType, schema, ...kit.draftOpts });
  if (!result) return { result: null, critique: null }; // draft agent skipped/died — nothing written to critique
  const critique = await kit.critic(critiquePrompt); // the stage's one full template audit
  return reviseLoop(kit, result, critique);
}

// One-line critic verdict for stage logs.
function verdictNote(critique) {
  if (!critique) return "critic verdict unavailable";
  return critique.clean ? "critic verdict clean" : `critic still flags ${critique.issues.length} issue(s)`;
}

// Folds a parallel lens panel into the one critique reviseLoop() takes. Each issue is prefixed
// with its lens, so the reviser and the scoped re-check know which reading raised it. A dead lens
// is an unknown verdict, never a clean one. Its `fallback` becomes an issue that restates what
// the lens would have checked, so the re-check can still verify it. `extra` carries issues the
// stage found in plain JS, already prefixed.
function mergeCritiques(lenses, extra = []) {
  const issues = [...extra];
  let clean = extra.length === 0;
  for (const { lens, critique, fallback } of lenses) {
    if (!critique) { clean = false; issues.push(`[${lens}] ${fallback}`); continue; }
    if (!critique.clean) clean = false;
    for (const issue of critique.issues) issues.push(`[${lens}] ${issue}`);
  }
  return { clean, issues };
}

const STRINGS = { type: "array", items: { type: "string" } };
const S = { type: "string" };

// Shared by the scope and spec compose paths. A plan lists anchors (the source's enumerable
// commitments) and partitions them. Drafters return fragments, never the file, because parallel
// writers to one file lose each other's updates. Every fragment item carries the anchors it
// serves, so coverage is a set difference in plain JS instead of something no one checks.
const ANCHORED = (properties, required) => ({
  type: "array",
  items: { type: "object", required: [...required, "anchors"], properties: { ...properties, anchors: STRINGS } }
});
const bullets = (lines) => lines.map((l) => `- ${l}`).join("\n");
const gapsBlock = (gaps) => gaps.length
  ? `--- known gaps ---\n${bullets(gaps)}\n--- end known gaps ---`
  : "There are no known gaps.";
const crossCuttingBlock = (plan) => plan.cross_cutting.length
  ? `--- cross-cutting decisions ---\n${bullets(plan.cross_cutting.map((x) => `${x.anchor}: ${x.why}`))}\n--- end cross-cutting decisions ---`
  : "There are no cross-cutting decisions.";

// Partition ids become agent labels, lens prefixes, and gap-line owners, so each must be unique.
// "unassigned" is reserved for the unassigned-anchors fidelity critic.
function uniquePartitionIds(plan, stageName) {
  const taken = new Set(["unassigned"]);
  plan.partitions.forEach((p, i) => {
    if (!taken.has(p.id)) { taken.add(p.id); return; }
    let id = `${p.id}-${i + 1}`;
    while (taken.has(id)) id += "x";
    log(`${stageName} plan reused partition id "${p.id}"; partition ${i + 1} ("${p.title}") is relabelled "${id}".`);
    p.id = id;
    taken.add(id);
  });
}

// Plain-JS check of a plan's anchor assignment. Its gaps go to the synthesizer and the fidelity
// critics as known gaps, and into the return. None is dropped silently.
function planGaps(plan) {
  const owners = new Map();
  for (const p of plan.partitions) {
    for (const an of new Set(p.anchors)) owners.set(an, [...(owners.get(an) || []), p.id]);
  }
  const known = new Set(plan.anchors);
  return {
    unassigned: [...known].filter((an) => !owners.has(an)),
    duplicated: [...owners].filter(([, ids]) => ids.length > 1).map(([anchor, ids]) => ({ anchor, ids })),
    foreign:    [...owners.keys()].filter((an) => !known.has(an))
  };
}
const planGapLines = (g) => [
  ...g.unassigned.map((an) => `${an}: the plan assigned it to no partition.`),
  ...g.duplicated.map((d) => `${d.anchor}: the plan assigned it to partitions ${d.ids.join(" and ")}. State it once, consistently.`),
  ...g.foreign.map((an) => `${an}: a partition lists it, but the plan's anchor list does not.`)
];

// One-line summary of a lens panel's verdicts for stage logs.
const lensSummary = (lenses, verdicts) => lenses
  .map((l, i) => `${l.lens}=${verdicts[i] ? (verdicts[i].clean ? "clean" : `${verdicts[i].issues.length} issue(s)`) : "no result"}`)
  .join(", ");

// Guards shared by every stage. A missing slug would name no artifact; a missing date would make
// a drafter invent one. Both are orchestrator bugs, so they fail the call before any agent runs.
if (typeof slug !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
  log(`spec-pipeline: args.slug missing or not kebab-case (${JSON.stringify(slug)}). Nothing was run.`);
  return { stage, error: "args.slug missing or not kebab-case" };
}
if (["triage", "scope", "spec"].includes(stage) && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
  log(`spec-pipeline: args.date missing or not YYYY-MM-DD for ${slug}. Nothing was run.`);
  return { stage, error: "args.date missing or not YYYY-MM-DD" };
}
// Scope, spec, and implement run as the triage-chosen architect. An architect the config does not
// know would run an unconfigured agent and make every later routing check meaningless.
if (["scope", "spec", "implement"].includes(stage) && (!architect || !ARCHITECTS.includes(architect))) {
  log(`spec-pipeline: args.architect ${JSON.stringify(architect)} is missing or not one of ${ARCHITECTS.join(", ")}. Recover it from the triage artifact's **Lane**: line. Nothing was run.`);
  return { stage, error: "args.architect missing or not a configured lane architect" };
}

// --- Triage: classify the work and pick the architect lane ---
// Conformed to <specs_dir>/triage-template.md.
if (stage === "triage") {
  phase("Triage");
  if (!feedback && !(typeof idea === "string" && idea.trim())) {
    log(`triage for ${slug}: no idea and no feedback - nothing to triage. Nothing was run.`);
    return { stage: "triage", error: "args.idea is required for a triage compose round" };
  }
  // One lane's architect borrows the routing role: it drafts, revises, and critiques triage. It
  // is config.triage_agent when set, else the first lane's architect. On a routed return, the
  // validated `architect` value routes every later stage. On a blocked return no lane was chosen.
  // Nothing downstream may run until a person resolves the block.
  const triageAgent = c.triage_agent || c.lanes[0].architect;
  const singleLane = c.lanes.length === 1
    ? `\n     With one lane configured, the lane step is trivially "${c.lanes[0].name}"; still verify the
     target region falls inside that lane's paths, and write ## AS's blocking form if it does not.`
    : "";
  const changeTypes = PREFIXES.length === 1
    ? `${PREFIXES[0]} (the only configured change type; every workstream uses it)`
    : `one of ${PREFIXES.join(", ")} (${PREFIXES[0]} for a new capability, ${PREFIXES[1]} for correcting existing behaviour${PREFIXES.length > 2 ? `; ${PREFIXES.slice(2).join(", ")} as the triage template defines` : ""})`;
  const { result: triage, critique } = await refine(
    triageAgent,
    `AS. You are the routing analyst for the ${c.project.name} workstream "${slug}". ${c.project.description}

     OBSERVE. Read the operator's raw idea between the markers below.

     CONSIDERING. Use ${SPECS}/triage-template.md for the artifact's shape and per-section
     rules. Use the lane table below as the routing table; ${c.steering.file}
     \`${c.steering.routing_heading}\` is its human-readable counterpart. Use the checkout
     you actually read: \`git rev-parse --abbrev-ref HEAD\` for the ref and
     \`git rev-parse --short HEAD\` for the literal SHA. Treat the idea's own assertions as claims
     to verify, not as facts to carry forward.

     ORDER.
     1. raw idea -> verified facts: check every claim the idea carries against the tree. Record
        each one as surviving with path:line, falsified with the citation that falsifies it, or
        non-resolving. Falsifying an input claim is a result, not a failure.
     2. verified facts -> lane: one of ${LANE_NAMES.join(", ")}, per the lane table.
     3. lane -> change type: ${changeTypes}.
     4. change type -> target region: the subsystem and the specific files the work touches.
     5. target region -> exclusions: what the work must not do. Give each one a falsifiable check.
     6. exclusions -> residual decisions: give each one 2-4 enumerated options. Add a
        recommendation where you have a lean.${singleLane}

     VALIDATE. Set aside every assertion in the raw idea. The lane, the change type, and the files
     the work touches must each still follow from a claim you verified. The artifact's own
     ## VALIDATE names one frame a skeptical reader would apply. That frame must differ from the
     role in ## AS and from "what does the tree show", which is the frame ## OBSERVE already used.

     OUTPUT. Write ${SPECS}/${slug}-triage.md with the template's six sections and nothing after
     ## OUTPUT. Delete all HTML comments. Frontmatter: Slug: ${slug}, Date: ${date}, and Source:
     the issue link or note the idea names, or the literal \`hand-seeded\` when it names none.
     Use the six ORDER links above as the fixed names of ## ORDER's spine, and add any further
     dependency your reasoning carried. Return what is described after the idea.

     --- raw idea ---
     ${idea}
     --- end raw idea ---

     --- lane table ---
${LANE_TABLE}
     --- end lane table ---

     If ## AS, ## OBSERVE, or ## CONSIDERING cannot be filled honestly, write that section's
     blocking unfillable form. Do not invent a role or a lane to fill it. Examples: the idea is two
     workstreams, the tree falsifies the premise, or the lane needs a human decision. If ## ORDER
     as a whole or ## VALIDATE cannot be filled, write its non-blocking form. The template states
     what each form forces on Status, Lane, Branch, and ## OUTPUT.
     ${OQ_GUIDANCE}${TRIAGE_MIRROR}${TRIAGE_STATUS}`,
    `AS. You are an adversarial critic.

     OBSERVE. Read ${SPECS}/${slug}-triage.md.

     CONSIDERING. Check the artifact against every bullet of ${SPECS}/triage-template.md's
     Composition-Time Self-Check, the per-section rules in that template's comments, and the
     lane table below (${c.steering.file} \`${c.steering.routing_heading}\` is its human-readable
     counterpart). Treat a section's sanctioned unfillable form as
     conformant when it names what cannot be decided and what would decide it, and agrees with the
     frontmatter and its ## OUTPUT entry. Treat a Status: Blocked artifact's absent lane,
     architect, and branch prefix, and its B entries, as the sanctioned outcome.

     ORDER.
     1. each self-check bullet -> the artifact line that satisfies or fails it.
     2. failures -> issues. Each issue names the section and the unmet rule.

     VALIDATE. Every issue must survive a re-read against the template's own words, not your
     preference. A path shared by **While excluding** and **Adjacent systems** is legal. An extra
     X -> Y link in ## ORDER is legal. A ## AS role that names no lane (an unlaned agent, or
     manual) is not a routed outcome, and belongs in that section's blocking form.

     OUTPUT. Return clean and issues.

     --- lane table ---
${LANE_TABLE}
     --- end lane table ---`,
    // `status` is the discriminator. The two branches carry disjoint field sets.
    // A top-level `oneOf` once expressed that split, and the API rejects it outright:
    // `400 tools.N.custom.input_schema: input_schema does not support oneOf, allOf, or anyOf at the
    // top level`. That is a hard tool-registration failure. The agent never starts, and the stage
    // reports "draft agent returned no result" with nothing written to disk. Do not reintroduce
    // oneOf/allOf/anyOf at the top level of any schema in this file.
    // The contract now lives in `description` strings, which reach the model and are schema-legal.
    // The flat `required` list holds only the fields both branches owe. Descriptions are advisory,
    // so the fail-closed guard below is what keeps the shapes apart. A `routed` return missing a
    // routing field is caught there and reported as malformed. "malformed" is not in the enum on
    // purpose. An agent may not claim it. It is the verdict the body reaches when a `routed` return
    // fails its own contract.
    // The lane, architect, dev, and branch_prefix enums are built from the config at runtime, so
    // the schema rejects a lane or agent the project never configured and the agent retries.
    {
      type: "object",
      required: ["status", "triage_path", "open_questions"],
      properties: {
        status: {
          enum: ["routed", "blocked"],
          description:
            "The discriminator. The two branches carry disjoint field sets. " +
            "routed requires lane, architect, dev, and branch_prefix. " +
            "routed forbids blocked_on and blocked_reason. " +
            "blocked requires blocked_on and blocked_reason. " +
            "blocked forbids lane, architect, dev, and branch_prefix, because no lane was chosen. " +
            "Never fill a field of the branch you did not take."
        },
        lane:           { enum: LANE_NAMES, description: "routed only. Required there." },
        architect:      { enum: ARCHITECTS, description: "routed only. Required there. Must be the lane's architect." },
        dev:            { enum: DEVS, description: "routed only. Required there. Must be the lane's dev." },
        branch_prefix:  { enum: PREFIXES, description: "routed only. Required there." },
        blocked_on:     { enum: ["AS", "OBSERVE", "CONSIDERING"], description: "blocked only. Required there. The section whose unfillable form you wrote." },
        blocked_reason: { type: "string", description: "blocked only. Required there. What cannot be decided, and what would decide it." },
        triage_path:    { type: "string" },
        open_questions: OQ
      }
    },
    "triage", "Triage", `${SPECS}/${slug}-triage.md`, `${SPECS}/triage-template.md`,
    // Triage routes and classifies against a fixed table. It hands anything it cannot decide to
    // the human as an Open or Blocking entry. So it drafts on the triage tier
    // (config.models.triage). The top tier is reserved for the spec stage by default.
    { draftModel: M.triage, feedback, stageInstructions: TRIAGE_REVISER_CONTRACT }
  );
  if (!triage) {
    log(`triage draft agent returned no result for ${slug} — nothing written.`);
    return { stage: "triage", error: "draft agent returned no result" };
  }
  // Declining to route is a normal triage outcome, not an error. The artifact records the block
  // in its own frontmatter and B entries. The return only reports it. The count below reads
  // "decision(s), at least one blocking" because open_questions copies ordinary **Open** entries
  // as well as B entries, and a blocked triage may raise both.
  if (triage.status === "blocked") {
    const on  = triage.blocked_on     || "AS";
    const why = triage.blocked_reason || "blocked without a stated reason";
    log(`triage blocked for ${slug} on ## ${on}: ${why}. Artifact written to ${triage.triage_path} with Status: Blocked. The artifact's own **Status**: line is authoritative. The orchestrator re-reads it before acting. ${(triage.open_questions || []).length} decision(s) for review, at least one blocking (B entries begin "Blocking - "). ${verdictNote(critique)}. No lane, architect, or branch prefix was chosen. The scope stage must not run for this slug until the block is resolved.`);
    return { stage: "triage", triage, critique };
  }
  // Fail closed, but not into the blocking-question channel. A `routed` return missing a routing
  // field is a schema failure. No answer a developer could give would fix it. The B channel is
  // reserved for problems in the idea itself that a human can decide. Reporting this as a block
  // would also disagree with the artifact, which still reads Status: Draft with a real Lane and
  // Branch.
  // The same holds for a routed return whose architect or dev is not the chosen lane's own. Each
  // field passed its enum on its own, but the combination routes later stages to the wrong lane.
  // The check compares against the lane's row rather than mapping the agent back to a lane,
  // because one agent type may serve several lanes (e.g. general-purpose everywhere).
  const missing = ["lane", "architect", "dev", "branch_prefix"].filter(k => !triage[k]);
  const row = c.lanes.find(l => l.name === triage.lane);
  const mismatch = !missing.length && (!row || row.architect !== triage.architect || row.dev !== triage.dev);
  if (missing.length || mismatch) {
    const what = missing.length
      ? `status=routed but missing ${missing.join(", ")}`
      : `architect/dev do not match lane "${triage.lane}" (got architect=${triage.architect}, dev=${triage.dev}; the lane table says architect=${row ? row.architect : "?"}, dev=${row ? row.dev : "?"})`;
    const err = `malformed triage return: ${what}. The artifact at ${triage.triage_path} is authoritative - recover routing from its **Lane**: and **Branch**: lines (command doc Step 3), or re-run the stage. This is a drafter failure, not a triage decision, and carries no question for the developer.`;
    log(`triage malformed for ${slug}: ${err} ${verdictNote(critique)}.`);
    return { stage: "triage", error: err, triage: { ...triage, status: "malformed" }, critique };
  }
  log(`triage done for ${slug}: lane=${triage.lane}, architect=${triage.architect}, branch=${triage.branch_prefix}/${slug}, ${triage.open_questions.length} open question(s) for review; ${verdictNote(critique)}.`);
  return { stage: "triage", triage, critique };
}

// --- Scope: goals / non-goals / files-affected, by the chosen architect ---
// Conformed to <specs_dir>/scope-template.md.
//
// A compose round plans its own composition. A single drafter over a large source drops
// commitments silently, and a single template critic never checks fidelity to the source. So a
// plan agent first lists the source's commitments as anchors and partitions them. There is one
// compose path, and it scales with the plan: a small source gets one partition and so one
// drafter, a large one up to MAX_SCOPE_PARTITIONS. The drafters return fragments, one
// synthesizer writes the artifact, and parallel lens critics audit it. Anchors make a dropped
// commitment countable in plain JS instead of invisible. A dead plan agent ends the stage with an
// error rather than drafting with no anchors to check. A feedback round is unchanged.
if (stage === "scope") {
  phase("Scope");
  const scopePath = `${SPECS}/${slug}-scope.md`;
  const scopeTemplate = `${SPECS}/scope-template.md`;
  // `architect` is carried forward from the triage return value.
  const SCOPE_CRITIQUE =
    `AS an adversarial critic, OBSERVE ${SPECS}/${slug}-scope.md, CONSIDERING Part A of
     ${SPECS}/scope-template.md's Composition-Time Self-Check and the per-section rules in that
     template's comments, by ORDER (1) each Part A bullet -> the artifact line that satisfies or
     fails it, weighting the five drafters most often miss: every ## Files Affected reference
     contains a "/" (a bare filename is not a path); a **Not yet enumerated** line is present; each
     non-goal names something reachable from THIS scope's goals rather than an invariant the repo
     merely holds; ## Dependencies names neither ${SPECS}/${slug}.md, ${SPECS}/${slug}-triage.md,
     nor this slug's branch in either direction; every ## Open Questions entry is in exactly one of
     the two entry shapes, numbering unbroken, no seventh H2, the no-questions sentence only when
     the section has no entries; (2) failures -> issues, each naming the section and the unmet
     rule, VALIDATE every issue must name the template rule it rests on, OUTPUT clean and issues.`;
  const SCOPE_SCHEMA = {
    type: "object",
    required: ["scope_path", "open_questions"],
    properties: { scope_path: { type: "string" }, open_questions: OQ }
  };
  // Scope restates the triage's verified idea as goals, non-goals, and a files-affected map,
  // each checked against the tree. It runs on the scope tier (config.models.scope). The top
  // tier is reserved for the spec stage by default, whose defects are the expensive ones. The
  // plan, the partition drafters, and the synthesizer are drafter-class calls, so they share this
  // tier and the `model` override.
  const scopeOpts = { draftModel: M.scope, stageInstructions: SCOPE_REVISER_CONTRACT };

  // Anchors are the plan's unit of coverage. A decision-register ID or a section id names one
  // commitment the scope must land somewhere, so "was it dropped?" becomes a set difference.
  const SCOPE_PLAN_SCHEMA = {
    type: "object",
    required: ["anchors", "partitions", "cross_cutting", "rationale"],
    properties: {
      anchors: { ...STRINGS, description: "Every enumerable commitment in the source, each a unique string." },
      partitions: {
        type: "array", minItems: 1, maxItems: MAX_SCOPE_PARTITIONS,
        items: {
          type: "object",
          required: ["id", "title", "source_sections", "anchors", "surfaces"],
          properties: {
            id:              { type: "string" },
            title:           { type: "string" },
            source_sections: { ...STRINGS, description: "Each entry names the document path and the section, e.g. \"docs/proposals/x.md §2.5\"." },
            anchors:         STRINGS,
            surfaces:        { ...STRINGS, description: "Repo paths or directories this partition's commitments touch." }
          }
        }
      },
      cross_cutting: {
        type: "array",
        items: { type: "object", required: ["anchor", "why"], properties: { anchor: { type: "string" }, why: { type: "string" } } }
      },
      rationale: { type: "string", description: "Why this partition count." }
    }
  };
  const SCOPE_PLAN =
    `AS. ${roleOf(architect)} You plan how the scope for workstream "${slug}" is composed. You
     write no file.

     OBSERVE. Read ${SPECS}/${slug}-triage.md. Then read in full every source document it
     names: its **Source** line, the raw idea it records, and every document its ## OBSERVE cites.
     Use the working tree to place each commitment on a surface.

     CONSIDERING. One drafter writes each partition, and a synthesizer merges the partitions into
     ${SPECS}/${slug}-scope.md. A drafter that holds more source than it can verify drops
     commitments without saying so. You may plan at most ${MAX_SCOPE_PARTITIONS} partitions.

     ORDER.
     1. Sources -> anchors. List every enumerable commitment. When a source has a decision
        register, its IDs are the anchors, every row of it. Otherwise use stable section ids such
        as "§2.5.1". Anchors are unique strings. When two sources share an id scheme, prefix each
        anchor with its document's basename. A source with no sections (a one-paragraph idea)
        gets one anchor per distinct commitment it makes.
     2. Anchors -> partitions. Group them by subsystem and source section, so one drafter can
        hold its partition's source text in full. A source small enough for one drafter gets
        exactly one partition.
     3. Each anchor -> exactly one partition's anchors.
     4. Decisions that constrain more than one partition -> cross_cutting, each with why. A
        cross-cutting anchor is still assigned to exactly one partition.
     5. Partition count -> rationale.

     VALIDATE. Every anchor appears in exactly one partition. No partition lists an anchor that
     is not in anchors. Every source section that commits to anything lies in some partition.

     OUTPUT. Return the plan. Each source_sections entry names the document path and the section.
     Each surfaces entry is a repo path or directory.`;

  const SCOPE_FRAGMENT_SCHEMA = {
    type: "object",
    required: ["goals", "non_goals", "files", "dependencies", "open_questions", "no_scope_consequence"],
    properties: {
      goals:     ANCHORED({ text: S, check: { type: "string", description: "The check's name and its observed number." } }, ["text", "check"]),
      non_goals: ANCHORED({ text: S, reason: S }, ["text", "reason"]),
      // `group` tells the synthesizer which **Reads** / **Creates or modifies** list a path joins.
      files:     ANCHORED({ path: S, change: S, group: { enum: ["reads", "creates_or_modifies"] } }, ["path", "change", "group"]),
      dependencies: {
        type: "array",
        items: { type: "object", required: ["direction", "item"], properties: { direction: { enum: ["depends_on", "depended_on_by"] }, item: S } }
      },
      // The OQ shape plus the template's "Closed by" clause, which the synthesizer must write.
      open_questions: ANCHORED({ ...OQ.items.properties, closed_by: S }, [...OQ.items.required, "closed_by"]),
      no_scope_consequence: {
        type: "array",
        items: { type: "object", required: ["anchor", "reason"], properties: { anchor: S, reason: S } }
      }
    }
  };
  const partitionDraft = (p, plan) =>
    `AS. ${roleOf(architect)} You draft partition "${p.id}: ${p.title}" of the scope for
     workstream "${slug}". A synthesizer merges every partition's fragments into the artifact.

     OBSERVE. Read ${SPECS}/${slug}-triage.md as the refined idea. Use its ## OBSERVE verified
     facts, its ## CONSIDERING bullets, the hand-off sentence, and every **Decided** entry of its
     ## OUTPUT. Read these source sections in full: ${p.source_sections.join("; ")}.

     CONSIDERING. Your anchors are ${p.anchors.join(", ")}. Your surfaces are
     ${p.surfaces.join(", ")}. Other partitions cover the rest of the source. Do not draft outside
     yours. Honour every cross-cutting decision below. Use ${scopeTemplate} for what a goal, a
     non-goal, a files entry, a dependency, and an open question must be. Use the
     \`${c.rules_dir}/*.md\` files whose globs overlap your surfaces, if that directory exists.
     Use the working tree.

     ORDER.
     1. Each anchor -> the source text that commits to it.
     2. Commitments -> goals. Write one goal per distinct verifiable outcome on ${SURFACE}. Run
        every grep, count, or enumeration a goal cites. Put the check's name and its observed
        number in check. Keep the full recipe (command pipelines, fixture wiring, assertion text)
        out of the goal; it belongs in the spec's Acceptance Criteria.
     3. Goals -> non-goals. Each non-goal names something a spec author could reach for from these
        goals. Each non-goal states its reason.
     4. Goals -> files. Sweep with grep -rn for copies and call sites of what changes. Every path
        is repo-rooted and contains a "/".
     5. Files -> dependencies by direction. Never name ${SPECS}/${slug}.md,
        ${SPECS}/${slug}-triage.md, or this slug's branch.
     6. Dependencies -> open questions. Each names in closed_by the evidence or decision that
        would close it.
     7. Each anchor -> at least one item whose anchors list it, or a no_scope_consequence entry
        that says why it changes nothing in this workstream.

     VALIDATE. Every anchor of yours is covered. Every goal is adjudicable by a spec author who
     reads only the scope. No item contradicts a cross-cutting decision.

     OUTPUT. Do not write or edit any file. The synthesizer alone writes ${scopePath}, and a
     second writer would lose its updates. Return the fragments. Every item carries the anchors
     it serves.
     ${OQ_GUIDANCE}
     closed_by is technical. It may name paths and types.
     ${crossCuttingBlock(plan)}`;

  const synthesize = (plan, fragments, gaps) =>
    `AS. ${roleOf(architect)} You write the scope for workstream "${slug}" from the fragments of
     ${plan.partitions.length} partition drafter(s).

     OBSERVE. Read ${SPECS}/${slug}-triage.md as the refined idea. Read the fragments below. Each
     carries the partition it came from and the anchors every item serves.

     CONSIDERING. Use ${scopeTemplate} as the artifact's shape and per-section rules. Honour
     every cross-cutting decision below. Use the working tree. The known gaps below are anchors
     no fragment covers, or that the plan assigned to no partition or to more than one. For each
     gap, read the source the triage names, then land the anchor as a goal, a non-goal, or an
     open question where the source supports it. Never drop a gap silently.

     ORDER.
     1. Fragments -> an executive summary. It names the causal mechanism as a relation between two
        named surfaces.
     2. Goals -> one goal per distinct verifiable outcome. Merge duplicates. Reconcile goals that
        overlap across partitions into one. Re-run any check whose observed number a merge changes.
     3. Non-goals -> merged. Where one partition excludes what another commits to, raise the
        conflict as an open question. Do not settle it silently.
     4. Files -> one ## Files Affected map with **Reads** and **Creates or modifies**, deduplicated,
        and a **Not yet enumerated** line.
     5. Dependencies -> merged by direction.
     6. Open questions -> merged and numbered, each closed by its closed_by clause, or the explicit
        no-questions sentence.
     7. The draft -> the template's Composition-Time Self-Check. Do Part A by reading what you
        wrote. Do Part B by running it against the tree.

     VALIDATE the artifact must hold when reframed as "the spec author reads only this file" -
     every goal still adjudicable, every non-goal still naming a surface those goals reach,
     every path still resolving - with no recourse to the triage. The artifact carries no anchor
     ids, no partition names, and no trace section; the template allows none.

     OUTPUT ${scopePath} with Slug: ${slug}, Date: ${date}, Status: Draft, its six H2 sections
     in template order, no HTML comments, and nothing after ## Open Questions.
     ${OQ_GUIDANCE}${SCOPE_MIRROR}
     ${crossCuttingBlock(plan)}
     ${gapsBlock(gaps)}
     --- fragments ---
     ${JSON.stringify(fragments, null, 2)}
     --- end fragments ---`;

  const fidelityCritique = (p, plan, gaps) =>
    `AS. You are a source-fidelity critic for partition "${p.id}: ${p.title}" of workstream "${slug}".

     OBSERVE. Read these source sections: ${p.source_sections.join("; ")}. Read ${scopePath}.

     CONSIDERING. The anchors to check are ${p.anchors.join(", ")}. Each is a commitment the
     source makes. Honour every cross-cutting decision below. The known gaps below are coverage
     failures found before the scope was written. Check those that name one of your anchors.

     ORDER.
     1. Each anchor -> the source text that states it.
     2. Source text -> where it lands in the scope: a ## Goals entry, a ## Non-Goals entry, a
        ## Open Questions entry, or legitimately out of scope (the source defers it, or it has no
        consequence for this workstream's surfaces).
     3. An anchor that lands nowhere, or lands widened, narrowed, or contradicted -> an issue.
     4. Each cross-cutting decision -> no scope line contradicts it.

     VALIDATE. A later checker sees only your issue text and the scope, never this partition. So
     every issue names the anchor, the source document and section, what the source commits to in
     one sentence, and what the scope says or omits. Do not audit template form or tree paths.
     Other critics own those.

     OUTPUT. Return clean and issues.
     ${crossCuttingBlock(plan)}
     ${gapsBlock(gaps)}`;

  const SCOPE_TREE_CRITIQUE =
    `AS. You are a tree-grounding critic.

     OBSERVE. Read ${scopePath}. Use the working tree.

     CONSIDERING. Use Part B of ${scopeTemplate}'s Composition-Time Self-Check. Run each check.
     Do not assert its result.

     ORDER.
     1. Every ## Files Affected path -> it exists on the tree now, or its bullet says this
        workstream creates it.
     2. Every observed number in ## Goals -> re-run the check the goal names and compare.
     3. What the goals change -> grep -rn for parallel fixtures, duplicated literals, sibling
        helpers, and call sites. Each hit is listed in ## Files Affected or explained there.
     4. Failures -> issues.

     VALIDATE. Each issue names the path or goal, the command you ran, and what it returned. Do
     not audit template form or source fidelity. Other critics own those.

     OUTPUT. Return clean and issues.`;

  const composeScope = async (plan, gaps) => {
    const kit = refineKit(architect, SCOPE_SCHEMA, "scope", "Scope", scopePath, scopeTemplate, scopeOpts);
    const fragments = await parallel(plan.partitions.map((p) => () => runAgent(
      partitionDraft(p, plan),
      { label: `scope:draft:${p.id}`, phase: "Scope", agentType: architect, schema: SCOPE_FRAGMENT_SCHEMA, ...kit.draftOpts }
    )));
    plan.partitions.forEach((p, i) => {
      if (!fragments[i]) log(`scope partition "${p.id}" drafter returned no result; its ${p.anchors.length} anchor(s) go to the synthesizer and its fidelity critic as known gaps.`);
    });

    // Plain-JS coverage check. An anchor counts as covered when a fragment of a partition that
    // owns it serves it, or names it in no_scope_consequence. Another partition citing it does
    // not count. Cross-cutting anchors are cited everywhere, and a dead owner must still show
    // them as gaps.
    const coveredBy = fragments.map((f) => {
      const got = new Set();
      if (!f) return got;
      for (const key of ["goals", "non_goals", "files", "open_questions"]) {
        for (const item of f[key]) for (const an of item.anchors) got.add(an);
      }
      for (const n of f.no_scope_consequence) got.add(n.anchor);
      return got;
    });
    const owners = new Map(); // anchor -> indices of the partitions that list it
    plan.partitions.forEach((p, i) => {
      for (const an of new Set(p.anchors)) owners.set(an, [...(owners.get(an) || []), i]);
    });
    const uncovered = [];
    for (const [an, idx] of owners) {
      if (idx.some((i) => coveredBy[i].has(an))) continue;
      const ps = idx.map((i) => plan.partitions[i]);
      uncovered.push({ anchor: an, line: `${an} (partition ${ps.map((p) => p.id).join(", ")}, ${ps[0].source_sections.join("; ")}): ${idx.every((i) => !fragments[i]) ? "its partition's drafter returned no result" : "no fragment item or no_scope_consequence entry from its partition covers it"}.` });
    }
    if (uncovered.length) log(`scope: ${uncovered.length} anchor(s) uncovered after drafting: ${uncovered.map((u) => u.anchor).join(", ")}. Passed to the synthesizer and the fidelity critics.`);
    const knownGaps = [...planGapLines(gaps), ...uncovered.map((u) => u.line)];

    const tagged = fragments
      .map((f, i) => f && { partition: plan.partitions[i].id, title: plan.partitions[i].title, ...f })
      .filter(Boolean);
    const result = await runAgent(
      synthesize(plan, tagged, knownGaps),
      { label: "scope:synthesize", phase: "Scope", agentType: architect, schema: SCOPE_SCHEMA, ...kit.draftOpts }
    );
    const uncoveredAnchors = uncovered.map((u) => u.anchor);
    if (!result) return { result: null, critique: null, uncoveredAnchors };

    // Unassigned anchors belong to no partition, so no partition's fidelity critic would check
    // them. They get a fidelity critic of their own.
    const targets = [...plan.partitions];
    if (gaps.unassigned.length) {
      targets.push({
        id: "unassigned", title: "anchors the plan assigned to no partition",
        source_sections: [`the source documents ${SPECS}/${slug}-triage.md names; locate each anchor there`],
        anchors: gaps.unassigned, surfaces: []
      });
    }
    const lenses = [
      {
        lens: "template", run: () => kit.critic(SCOPE_CRITIQUE, "template"),
        fallback: `The template critic returned no result, so this lens is unaudited. Audit ${scopePath} against every Part A bullet of ${scopeTemplate}'s Composition-Time Self-Check.`
      },
      ...targets.map((p) => ({
        lens: `fidelity:${p.id}`, run: () => kit.critic(fidelityCritique(p, plan, knownGaps), `fidelity:${p.id}`),
        fallback: `The fidelity critic for partition "${p.id}" returned no result, so its anchors are unaudited. Confirm each of ${p.anchors.join(", ")} (source: ${p.source_sections.join("; ")}) lands in ${scopePath} as a goal, a non-goal, or an open question, or is legitimately out of scope.`
      })),
      {
        lens: "tree", run: () => kit.critic(SCOPE_TREE_CRITIQUE, "tree"),
        fallback: `The tree-grounding critic returned no result, so this lens is unaudited. Run every Part B check of ${scopeTemplate}'s Composition-Time Self-Check against ${scopePath}.`
      }
    ];
    const verdicts = await parallel(lenses.map((l) => l.run));
    const critique = mergeCritiques(lenses.map((l, i) => ({ lens: l.lens, critique: verdicts[i], fallback: l.fallback })));
    log(`scope lens critics: ${lensSummary(lenses, verdicts)}.`);

    const loop = await reviseLoop(kit, result, critique);
    if (loop.rounds === 2 && loop.critique && !loop.critique.clean) {
      log(`scope revise loop stopped at its 2-round cap with ${loop.critique.issues.length} issue(s) still flagged.`);
    }
    return { ...loop, uncoveredAnchors };
  };

  const composition = { mode: "feedback", partitions: null, rationale: null, unassigned_anchors: [], uncovered_anchors: [], agents_run: 0 };
  let outcome;
  if (feedback) {
    // Structural refine: one reviser + one critic, unchanged. refine() reads no draft prompt on
    // the feedback path, so none is passed.
    outcome = await refine(
      architect, null, SCOPE_CRITIQUE, SCOPE_SCHEMA,
      "scope", "Scope", scopePath, scopeTemplate, { ...scopeOpts, feedback }
    );
  } else {
    composition.mode = "partitioned";
    const plan = await runAgent(
      SCOPE_PLAN,
      { label: "scope:plan", phase: "Scope", agentType: architect, schema: SCOPE_PLAN_SCHEMA, model: model || scopeOpts.draftModel }
    );
    if (!plan) {
      // Drafting without a plan would leave no anchors to check the scope against.
      log(`scope plan agent returned no result for ${slug} — nothing written.`);
      composition.agents_run = agentsRun;
      return { stage: "scope", error: "plan agent returned no result; nothing written. Re-run the stage.", composition };
    }
    plan.anchors = [...new Set(plan.anchors)];
    uniquePartitionIds(plan, "scope");
    const gaps = planGaps(plan);
    const n = plan.partitions.length;
    log(`scope plan for ${slug}: ${plan.anchors.length} anchor(s) in ${n} partition(s) (cap ${MAX_SCOPE_PARTITIONS}). ${plan.rationale}`);
    if (n === MAX_SCOPE_PARTITIONS) log(`scope plan hit the ${MAX_SCOPE_PARTITIONS}-partition cap; a source with more divisions than that is grouped coarser to fit.`);
    if (gaps.unassigned.length) log(`scope plan left ${gaps.unassigned.length} anchor(s) unassigned: ${gaps.unassigned.join(", ")}.`);
    if (gaps.duplicated.length) log(`scope plan assigned ${gaps.duplicated.length} anchor(s) to more than one partition: ${gaps.duplicated.map((d) => `${d.anchor} (${d.ids.join(", ")})`).join(", ")}.`);
    if (gaps.foreign.length) log(`scope plan partitions list ${gaps.foreign.length} anchor(s) outside its anchor list: ${gaps.foreign.join(", ")}.`);
    Object.assign(composition, { partitions: n, rationale: plan.rationale, unassigned_anchors: gaps.unassigned });
    outcome = await composeScope(plan, gaps);
    composition.uncovered_anchors = outcome.uncoveredAnchors;
  }
  composition.agents_run = agentsRun;
  const { result: scope, critique } = outcome;
  if (!scope) {
    log(`scope draft agent returned no result for ${slug} — nothing written.`);
    return { stage: "scope", error: "draft agent returned no result", composition };
  }
  log(`scope done for ${slug}: ${scope.open_questions.length} open question(s) for review; ${verdictNote(critique)}; composition ${composition.mode}${composition.partitions ? ` (${composition.partitions} partition(s))` : ""}, ${composition.agents_run} agent(s) run.`);
  return { stage: "scope", scope, critique, composition };
}

// --- Spec: draft <specs_dir>/<slug>.md against the template ---
// Conformed to <specs_dir>/spec-template.md.
//
// A compose round plans its own composition before anything is drafted. One drafter holding a
// large scope writes the whole design and phase plan from one context, and drops commitments
// without saying so. So a plan agent first reads the scope and fixes the shared frame: the
// scope's goals as anchors, the phase outline (titles, routing, dependencies, goals delivered),
// the core principle, and the interfaces partitions must agree on. It then partitions the
// anchors, phases, and design elements.
//
// There is one compose path, and it scales with the plan. A small scope gets one partition and
// so one drafter; a large one gets up to MAX_SPEC_PARTITIONS. Each drafter returns its design
// elements, current state, and full phase blocks as fragments. One synthesizer writes the file.
// Parallel lens critics then audit it: the template, each partition's phases as their narrowest
// reader sees them, each partition's scope fidelity, and cross-partition coherence. A dead plan
// agent ends the stage with an error rather than drafting with no frame. A feedback round is
// unchanged.
if (stage === "spec") {
  phase("Spec");
  const specPath = `${SPECS}/${slug}.md`;
  const specTemplate = `${SPECS}/spec-template.md`;
  const SPEC_CRITIQUE =
    `AS. You are an adversarial critic.

     OBSERVE. Read ${SPECS}/${slug}.md.

     CONSIDERING. Use Part A of the Composition-Time Self-Check in ${SPECS}/spec-template.md.
     Use the rules in each phase block's comments. ${openRules("any phase's Scope IN")}

     ORDER.
     1. Each Part A bullet -> the artifact line that satisfies or fails it.
     1b. The Proposed Design and each phase -> conformance to every rule file you opened.
     2. Every Agent routing line -> exactly one bare agent name from this list:
        ${ROUTABLE.join(", ")}. The line has no parenthetical. It has no trailing clause. It
        names no second agent. It does not say "manual".
     3. Every Acceptance Criteria block -> adjudicable from its own text plus the tree. Every
        test run it names is a targeted selection. It never names ${WHOLE_SUITE.join("; ")}; or
        any invocation that collects a whole suite. The whole suite belongs to the
        validate stage. Every constraint on how a file changed is stated by content, not by
        \`git diff\` against HEAD. That diff judges every phase since the last commit. Two diff
        shapes are sound. The first is an empty \`git diff <path>\` for a path no phase may
        touch. The second is \`git diff --name-only <commit>..HEAD\`, which names its baseline.
     4. Failures -> issues. Each issue names the section and the unmet rule.

     VALIDATE. Every issue must name the template rule or ${c.rules_dir}/ file it rests on.

     OUTPUT. Return clean and issues.`;
  // The spec return deliberately carries no phases array: the implement stage's `phases` are
  // always reconstructed by the orchestrator from the on-disk spec's "**Agent routing**:" lines,
  // so a return value that could diverge from the file has nothing to feed.
  const SPEC_SCHEMA = {
    type: "object",
    required: ["spec_path", "open_questions"],
    properties: {
      spec_path: { type: "string" },
      open_questions: OQ
    }
  };
  // The spec is the single source of truth for implement. Its phases, routing lines, and
  // acceptance criteria decide whether each later dev phase succeeds or halts. The plan, the
  // partition drafters, the synthesizer, and the reviser share draftModel, so all run on the
  // spec tier (config.models.spec, the top tier by default): together they fix the phase plan and
  // write the acceptance criteria. By default these are the pipeline's only top-tier calls and its
  // most valuable model spend. A subtle spec defect costs far more in failed implement phases
  // than the draft-time premium.
  const specOpts = { draftModel: M.spec, stageInstructions: SPEC_REVISER_CONTRACT };

  const titlesOf = (group) => group.map((p) => `"${p.title}"`).join(", ");
  const narrowestReaderCritique = (group) =>
    `AS. You are the narrowest reader of ${group.length} phase block(s) of ${specPath}: the
     implement-stage dev agent and criteria checker.

     OBSERVE. Open ${specPath} only to extract the phase blocks titled ${titlesOf(group)}. Read
     nothing else in the spec. Judge each block as if the rest of the file did not exist.

     CONSIDERING. Use the rules in the phase-block comments of ${specTemplate}.
     ${openRules("these phases' Scope IN")} Use the working tree.

     ORDER.
     1. The Agent routing line -> exactly one bare agent name from this list:
        ${ROUTABLE.join(", ")}. No parenthetical, no trailing clause, no second agent, no "manual".
     2. #### Scope IN and OUT -> enumerated repo-rooted paths, each resolving on the tree or named
        as created.
     3. #### Tests -> co-located, one line per IN behaviour, each naming what it catches, or the
        covered-by or unfillable form.
     4. #### Acceptance Criteria -> each criterion adjudicable from its own text plus the tree: no
        "Phase N", no ## Section reference, no unnamed referent. Every test run is a targeted
        selection, never ${WHOLE_SUITE.join("; ")}; or any invocation that collects a whole
        suite. Every constraint on how a file changed is stated by content, not by \`git diff\`
        against HEAD, except an empty \`git diff <path>\` or \`git diff --name-only <commit>..HEAD\`.

     VALIDATE. A later checker sees only your issue text and the file. So every issue names the
     phase heading, the block, and the template rule it rests on.

     OUTPUT. Return clean and issues.`;

  // The plan fixes the frame every drafter shares, because drafters run in parallel and see only
  // the plan. Anchors are the scope's goals, so "was a goal dropped?" is a set difference. Phase
  // titles are fixed here, so the partitions' blocks splice into one numbered plan. The phase
  // agent enum is the same routable set the critics check routing lines against.
  const SPEC_PLAN_SCHEMA = {
    type: "object",
    required: ["anchors", "core_principle", "phases", "partitions", "cross_cutting", "rationale"],
    properties: {
      anchors: { ...STRINGS, description: "Every scope ## Goals entry as \"G<n>\", n its number in the scope, every one. Add \"OQ<n>\" only for a closed scope ## Open Questions entry whose ruling binds the spec and lands in no goal." },
      core_principle: { type: "string", description: "The Proposed Design's core principle, one paragraph." },
      phases: {
        type: "array", minItems: 1,
        items: {
          type: "object",
          required: ["title", "agent", "goal", "depends_on", "anchors"],
          properties: {
            title:      { type: "string", description: "The heading text after \"### \", exactly \"Phase <n>: <Short Imperative Name>\", n counting from 1 in dependency order." },
            agent:      { enum: ROUTABLE },
            goal:       { type: "string", description: "One sentence: what is true after this phase that was not true before." },
            depends_on: { type: "string", description: "The earlier phase titles it depends on, or \"None\"." },
            anchors:    { ...STRINGS, description: "The anchors this phase delivers, wholly or in part." }
          }
        }
      },
      partitions: {
        type: "array", minItems: 1, maxItems: MAX_SPEC_PARTITIONS,
        items: {
          type: "object",
          required: ["id", "title", "anchors", "phases", "design_elements", "source_sections", "surfaces"],
          properties: {
            id:              S,
            title:           S,
            anchors:         { ...STRINGS, description: "The anchors this partition owns. Each anchor is owned by exactly one partition." },
            phases:          { ...STRINGS, description: "Titles of the phases this partition drafts, exactly as in phases. Each phase belongs to exactly one partition." },
            design_elements: { ...STRINGS, description: "Headings of the ### Proposed Design subsections this partition writes." },
            source_sections: { ...STRINGS, description: "What the drafter must read in full: the scope goals by number, and each source document section they cite, with its path." },
            surfaces:        { ...STRINGS, description: "Repo paths or directories this partition's phases touch." }
          }
        }
      },
      cross_cutting: {
        type: "array",
        description: "Decisions and interfaces more than one partition must agree on: names, signatures, data layouts, constants, ordering. anchor is a short label. why states the contract and the partitions it binds.",
        items: { type: "object", required: ["anchor", "why"], properties: { anchor: S, why: S } }
      },
      rationale: { type: "string", description: "Why this partition count and grouping." }
    }
  };
  const SPEC_PLAN =
    `AS. ${roleOf(architect)} You plan how the spec for workstream "${slug}" is composed. You
     write no file.

     OBSERVE. Read ${SPECS}/${slug}-scope.md in full. Its ## Goals and ## Non-Goals bind the
     spec, and every closed ## Open Questions entry is settled input. Read
     ${SPECS}/${slug}-triage.md as the verified facts. Read the source documents the scope cites
     where you need them to place a commitment. Use the working tree.

     CONSIDERING. One drafter writes each partition's design elements and full phase blocks, and
     a synthesizer merges them into ${specPath} per ${specTemplate}. A drafter that holds more
     than it can verify drops commitments without saying so. Drafters work in parallel and see
     only this plan, so the plan carries everything two drafters must agree on. You may plan at
     most ${MAX_SPEC_PARTITIONS} partitions. Each phase routes to exactly one agent from this
     list: ${ROUTABLE.join(", ")}.

     ORDER.
     1. Scope -> anchors. Every ## Goals entry becomes "G<n>". Add "OQ<n>" only for a closed
        question whose ruling lands in no goal.
     2. Anchors -> the design's core principle.
     3. Anchors -> the phase outline in dependency order, per the template's Implementation Plan
        rules. Each phase leaves the system working, routes to exactly one agent, and names the
        anchors it delivers. Every anchor is delivered by some phase, unless it is design-only by
        its nature.
     4. Phases -> partitions. Group dependency-adjacent phases on shared surfaces, so one drafter
        can hold its partition's scope goals, source sections, and surfaces in full. A scope small
        enough for one drafter gets exactly one partition.
     5. Each anchor -> exactly one owning partition, normally the one whose phases deliver it.
        Each phase -> exactly one partition. Each Proposed Design subsection -> exactly one
        partition's design_elements.
     6. Everything two partitions must agree on -> cross_cutting: the interface, name, layout,
        constant, or ordering, each with its contract and the partitions it binds.
     7. Partition count -> rationale.

     VALIDATE. Every anchor appears in exactly one partition. Every phase appears in exactly one
     partition. Phase numbers run 1..n in dependency order with no gap. No phase depends on a
     later one. No phase reaches a scope ## Non-Goals entry.

     OUTPUT. Return the plan.`;

  const SECTIONS = ANCHORED({ heading: S, body_md: S }, ["heading", "body_md"]);
  const SPEC_FRAGMENT_SCHEMA = {
    type: "object",
    required: ["current_state", "design_elements", "boundaries", "alternatives", "terminology", "phases", "standards", "interface_notes", "open_questions", "no_spec_consequence"],
    properties: {
      current_state:   SECTIONS,
      design_elements: SECTIONS,
      boundaries: { type: "object", required: ["affects", "does_not_affect"], properties: { affects: STRINGS, does_not_affect: STRINGS } },
      alternatives: { type: "array", items: { type: "object", required: ["heading", "body_md"], properties: { heading: S, body_md: S } } },
      terminology:  { type: "array", items: { type: "object", required: ["term", "definition"], properties: { term: S, definition: S } } },
      phases: ANCHORED({
        title:   S,
        body_md: { type: "string", description: "Everything under the phase heading: **Goal**, **Agent routing**, **Depends on**, #### Scope, #### Tasks, #### Tests, #### Acceptance Criteria." }
      }, ["title", "body_md"]),
      standards: { type: "array", items: { type: "object", required: ["doc", "section", "applies_to"], properties: { doc: S, section: S, applies_to: S } } },
      interface_notes: { ...STRINGS, description: "What this partition assumes from, or provides to, another partition beyond the plan's cross-cutting decisions." },
      open_questions: ANCHORED(OQ.items.properties, OQ.items.required),
      no_spec_consequence: { type: "array", items: { type: "object", required: ["anchor", "reason"], properties: { anchor: S, reason: S } } }
    }
  };
  const quoted = (titles) => titles.map((t) => `"${t}"`).join(", ");
  const outlineBlock = (plan) => {
    const owner = (t) => plan.partitions.find((p) => p.phases.includes(t))?.id || "no partition";
    return `--- phase outline ---\n${bullets(plan.phases.map((ph) => `${ph.title} | ${ph.agent} | depends on: ${ph.depends_on} | delivers: ${ph.anchors.join(", ") || "none"} | drafted by: ${owner(ph.title)} | ${ph.goal}`))}\n--- end phase outline ---`;
  };
  const principleBlock = (plan) => `--- core principle ---\n${plan.core_principle}\n--- end core principle ---`;

  const specPartitionDraft = (p, plan) =>
    `AS. ${roleOf(architect)} You draft partition "${p.id}: ${p.title}" of the spec for workstream
     "${slug}". A synthesizer merges every partition's fragments into ${specPath}.

     OBSERVE. Read ${SPECS}/${slug}-scope.md: in full the ## Goals entries for your anchors, all
     of ## Non-Goals, the ## Files Affected entries on your surfaces, and every closed
     ## Open Questions entry. Read these in full: ${p.source_sections.join("; ")}. Read
     ${SPECS}/${slug}-triage.md for verified facts. The phase outline, core principle, and
     cross-cutting decisions below bind you. Other partitions draft the other phases in parallel
     against the same plan.

     CONSIDERING. Your anchors are ${p.anchors.join(", ") || "none"}. Your phases are
     ${quoted(p.phases) || "none"}. Your Proposed Design subsections are
     ${p.design_elements.join("; ") || "none"}. Your surfaces are ${p.surfaces.join(", ")}. Use
     ${specTemplate} for what each section and each phase block must be. The template says who
     reads each phase block. The dev agent gets #### Scope inlined as its boundary. The criteria
     checker gets #### Acceptance Criteria alone, and its verdict halts every later phase.
     ${openRules("your surfaces")} Use the working tree. Acceptance criteria obey the implement
     stage's test policy:\n${SCOPED_TESTS}

     ORDER.
     1. Each anchor -> the scope goal text, and the source text it cites.
     2. Your surfaces -> Current State subsections anchored at path and symbol.
     3. Anchors -> your Proposed Design subsections, consistent with the core principle and every
        cross-cutting decision. Approaches you rejected -> alternatives.
     4. Each of your phases -> its full block, with the plan's title, Agent routing, and Depends on
        unchanged: **Goal**; **Agent routing**; **Depends on**; #### Scope with IN and OUT as
        enumerated repo-rooted paths; #### Tasks; #### Tests, one line per IN behaviour; and
        #### Acceptance Criteria, each criterion adjudicable from its own text plus the tree and
        carrying the full check recipe for each goal the phase delivers, every test run a
        targeted selection.
     5. Anything you assume from or provide to another partition beyond the cross-cutting
        decisions -> interface_notes.
     6. Each anchor -> at least one phase or open question whose anchors list it, or a
        no_spec_consequence entry that says why the spec carries nothing for it.
     7. Every path, symbol, and test you name -> resolved against the tree, or named as created.

     VALIDATE. Each phase block holds for its narrowest reader. No item widens or narrows a scope
     goal or reaches a scope non-goal. No item contradicts a cross-cutting decision. No phase
     number appears in an identifier, filename, comment, or docstring.

     OUTPUT. Do not write or edit any file. The synthesizer alone writes ${specPath}, and a
     second writer would lose its updates. Return the fragments. Each phase's title is character
     for character the plan's. No body_md carries an HTML comment.
     ${OQ_GUIDANCE}
     ${outlineBlock(plan)}
     ${principleBlock(plan)}
     ${crossCuttingBlock(plan)}`;

  const specSynthesize = (plan, fragments, gaps) =>
    `AS. ${roleOf(architect)} You write the spec for workstream "${slug}" from the fragments of
     ${plan.partitions.length} partition drafter(s).

     OBSERVE. Read ${SPECS}/${slug}-scope.md. Its ## Goals and ## Non-Goals bind. Read
     ${SPECS}/${slug}-triage.md as the verified facts. Read the plan and the fragments below.
     Each fragment carries the partition it came from and the anchors every item serves.

     CONSIDERING. Use ${specTemplate} as the artifact's shape and per-section rules. The phase
     blocks are the drafters' work, written for their narrowest readers. Splice them verbatim.
     Change a phase block only to reconcile it with another partition's interface or a
     cross-cutting decision, and then only the lines the conflict touches. The known gaps below
     are anchors or phases no fragment covers, or that the plan assigned to no partition or to
     more than one. For each gap, read the scope and the source it cites, then land it. Write a
     missing phase in full from the plan's outline. Land an anchor in a phase, a goal, or an open
     question. Never drop a gap silently.

     ORDER.
     1. Scope -> ## Executive Summary, ### Goals, ### Non-Goals, and ### Dependencies, faithful to
        the scope's ## Goals, ## Non-Goals, and ## Dependencies.
     2. Fragments -> ## Terminology, merged and deduplicated.
     3. Fragments -> ## Current State, its subsections merged, then ### Problems Summary.
     4. The core principle and the design elements -> ## Proposed Design: ### Core Principle
        first, then the elements in dependency order, then ### System Boundaries merged from every
        fragment's boundaries.
     5. Fragments -> ## Alternatives Considered, merged.
     6. The design -> ## Invariance. Give one independent reframing. State the claim that survives
        it. Name one concrete falsifier on ${SURFACE}.
     7. Phase blocks -> ## Implementation Plan, in the plan's order, each under its plan title.
        Where two partitions' interface_notes disagree, reconcile the lines the disagreement
        touches, or raise it as an open question. Do not settle a design conflict silently.
     8. Fragments -> ## Standards References, merged.
     9. Open questions -> merged and numbered in ## Open Questions, or the explicit no-questions
        sentence.
     10. The draft -> the template's Composition-Time Self-Check. Do Part A by reading what you
        wrote. Do Part B for the sections you wrote yourself.

     VALIDATE. The whole spec must hold when asked "what did the scope authorize?". No goal is
     widened or narrowed silently. The artifact names no partition and carries no trace section;
     the template allows neither.

     OUTPUT. Write ${specPath} with Date: ${date} and Status: Draft. Put the sections in template
     order. Delete all HTML comments. Make ## Open Questions the last section, in one of its
     three shapes.
     ${OQ_GUIDANCE}${SPEC_MIRROR}
     ${outlineBlock(plan)}
     ${principleBlock(plan)}
     ${crossCuttingBlock(plan)}
     ${gapsBlock(gaps)}
     --- fragments ---
     ${JSON.stringify(fragments, null, 2)}
     --- end fragments ---`;

  const specFidelityCritique = (p, plan, gaps) =>
    `AS. You are a scope-fidelity critic for partition "${p.id}: ${p.title}" of the spec for
     workstream "${slug}".

     OBSERVE. Read ${SPECS}/${slug}-scope.md: the ## Goals entries for the anchors below, all of
     ## Non-Goals, and the closed ## Open Questions entries. Read these: ${p.source_sections.join("; ")}.
     Read ${specPath}: ### Goals, ## Proposed Design, and ${p.phases.length ? `the phases titled ${quoted(p.phases)}` : "whichever phases deliver the anchors below"}.

     CONSIDERING. The anchors to check are ${p.anchors.join(", ")}. "G<n>" is scope goal n.
     "OQ<n>" is closed scope question n. The scope binds the spec. A divergence the spec raises as
     a numbered ## Open Questions entry is not silent. The known gaps below were found before the
     spec was written. Check those that name one of your anchors or phases.

     ORDER.
     1. Each anchor -> the scope text that states it.
     2. Scope text -> the spec ### Goals entry that carries it, and the phase whose Scope IN and
        Acceptance Criteria deliver it.
     3. An anchor that lands nowhere, or lands widened, narrowed, or contradicted -> an issue. An
        anchor the design carries but no phase delivers -> an issue.
     4. Each of your phases -> its Scope IN reaches no scope ## Non-Goals entry.
     5. Each cross-cutting decision -> no line of your phases or design contradicts it.

     VALIDATE. A later checker sees only your issue text and the spec, never this partition. So
     every issue names the scope goal or non-goal by number, what the scope commits to in one
     sentence, and the spec section and phase heading where it lands or is missing. Do not audit
     template form or single-phase readability. Other critics own those.

     OUTPUT. Return clean and issues.
     ${crossCuttingBlock(plan)}
     ${gapsBlock(gaps)}`;

  const specCoherenceCritique = (plan) =>
    `AS. You are a cross-partition coherence critic. ${specPath} was drafted by
     ${plan.partitions.length} drafter(s) in parallel and merged by a synthesizer, so its seams
     are where it breaks.

     OBSERVE. Read ${specPath} in full. Read ${SPECS}/${slug}-scope.md ## Non-Goals. Use the
     working tree.

     CONSIDERING. The plan's partitions and cross-cutting decisions are below.

     ORDER.
     1. Each **Depends on** line -> names only earlier phases. Each phase's Scope IN uses only
        what earlier phases or the tree provide.
     2. Each name, signature, data layout, constant, and ordering a cross-cutting decision fixes
        -> used identically in every section and phase that names it.
     3. Each file in more than one phase's Scope IN -> the phases' changes to it are compatible and
        ordered, and no later phase undoes an earlier one.
     4. ## Terminology, ## Proposed Design, and the phases -> one term per concept.
     5. Each scope ## Non-Goals entry -> no goal, design element, or phase Scope IN reaches it.
     6. ## Invariance -> present, with a reframing, a surviving claim, and a concrete falsifier,
        or "not yet identified" with a matching ## Open Questions entry.
     7. Failures -> issues.

     VALIDATE. Each issue names both sides of the seam: the two sections or phase headings and the
     conflicting lines. Do not audit template form, single-phase readability, or per-goal
     fidelity. Other critics own those.

     OUTPUT. Return clean and issues.
     --- partitions ---\n${bullets(plan.partitions.map((p) => `${p.id}: ${p.title}, phases ${quoted(p.phases) || "none"}`))}\n--- end partitions ---
     ${crossCuttingBlock(plan)}`;

  // Plain-JS check of the plan's phase outline and phase assignment. Each line goes to the
  // synthesizer and the critics as a known gap. `unowned` phases have no drafter, so the
  // synthesizer writes them and a narrowest-reader lens of their own audits them.
  const phaseGaps = (plan) => {
    const owners = new Map();
    for (const p of plan.partitions) for (const t of new Set(p.phases)) owners.set(t, [...(owners.get(t) || []), p.id]);
    const lines = [];
    const seen = new Set();
    plan.phases.forEach((ph, i) => {
      const t = ph.title;
      if (seen.has(t)) lines.push(`phase "${t}": the plan's outline lists it more than once.`);
      seen.add(t);
      const m = /^Phase (\d+): \S/.exec(t);
      if (!m || Number(m[1]) !== i + 1) lines.push(`phase "${t}": its title is not "Phase ${i + 1}: <name>" at outline position ${i + 1}.`);
      if (!owners.has(t)) lines.push(`phase "${t}": the plan assigned it to no partition, so no drafter wrote it.`);
      else if (owners.get(t).length > 1) lines.push(`phase "${t}": the plan assigned it to partitions ${owners.get(t).join(" and ")}. Keep one block for it.`);
    });
    for (const t of owners.keys()) if (!seen.has(t)) lines.push(`phase "${t}": a partition lists it, but the plan's phase outline does not.`);
    return { lines, unowned: [...seen].filter((t) => !owners.has(t)) };
  };

  const composePartitioned = async (plan, gaps, pGaps) => {
    const kit = refineKit(architect, SPEC_SCHEMA, "spec", "Spec", specPath, specTemplate, specOpts);
    const fragments = await parallel(plan.partitions.map((p) => () => runAgent(
      specPartitionDraft(p, plan),
      { label: `spec:draft:${p.id}`, phase: "Spec", agentType: architect, schema: SPEC_FRAGMENT_SCHEMA, ...kit.draftOpts }
    )));
    plan.partitions.forEach((p, i) => {
      if (!fragments[i]) log(`spec partition "${p.id}" drafter returned no result; its ${p.anchors.length} anchor(s) and ${p.phases.length} phase(s) go to the synthesizer and its critics as known gaps.`);
    });

    // An anchor counts as covered when a fragment of a partition that owns it delivers it in a
    // phase, raises it as an open question, or explains it in no_spec_consequence. A design
    // element alone does not count: a goal no phase delivers is never implemented.
    const coveredBy = fragments.map((f) => {
      const got = new Set();
      if (!f) return got;
      for (const key of ["phases", "open_questions"]) for (const item of f[key]) for (const an of item.anchors) got.add(an);
      for (const n of f.no_spec_consequence) got.add(n.anchor);
      return got;
    });
    const owners = new Map();
    plan.partitions.forEach((p, i) => { for (const an of new Set(p.anchors)) owners.set(an, [...(owners.get(an) || []), i]); });
    const uncovered = [];
    for (const [an, idx] of owners) {
      if (idx.some((i) => coveredBy[i].has(an))) continue;
      uncovered.push({ anchor: an, line: `${an} (partition ${idx.map((i) => plan.partitions[i].id).join(", ")}): ${idx.every((i) => !fragments[i]) ? "its partition's drafter returned no result" : "no phase or open question from its partition lists it, and no no_spec_consequence entry explains it"}.` });
    }
    // Each planned phase must come back from a partition that owns it, under its exact title.
    const planned = new Set(plan.phases.map((ph) => ph.title));
    const missingPhases = [];
    const strays = [];
    plan.partitions.forEach((p, i) => {
      const f = fragments[i];
      for (const t of new Set(p.phases)) {
        if (!planned.has(t)) continue; // a foreign title is already a plan gap
        if (f && f.phases.some((ph) => ph.title === t)) continue;
        const otherOwner = plan.partitions.some((q, j) => j !== i && q.phases.includes(t) && fragments[j]?.phases.some((ph) => ph.title === t));
        if (otherOwner || missingPhases.some((m) => m.title === t)) continue;
        missingPhases.push({ title: t, line: `phase "${t}" (partition ${p.id}): ${f ? "its drafter returned no block with this exact title" : "its drafter returned no result"}. Write it in full from the plan's outline.` });
      }
      if (f) {
        const mine = new Set(p.phases);
        for (const ph of f.phases) if (!mine.has(ph.title)) strays.push(`partition "${p.id}" returned a phase block titled "${ph.title}", which is not one of its planned phases. Place it under the plan title it belongs to, or drop it where another partition owns that phase.`);
      }
    });
    if (uncovered.length) log(`spec: ${uncovered.length} anchor(s) uncovered after drafting: ${uncovered.map((u) => u.anchor).join(", ")}. Passed to the synthesizer and the fidelity critics.`);
    if (missingPhases.length) log(`spec: ${missingPhases.length} planned phase(s) came back from no drafter: ${quoted(missingPhases.map((m) => m.title))}. The synthesizer writes them from the outline.`);
    if (strays.length) log(`spec: ${strays.length} phase block(s) came back under a title their partition does not own.`);
    const knownGaps = [...planGapLines(gaps), ...pGaps.lines, ...uncovered.map((u) => u.line), ...missingPhases.map((m) => m.line), ...strays];

    const tagged = fragments
      .map((f, i) => f && { partition: plan.partitions[i].id, title: plan.partitions[i].title, ...f })
      .filter(Boolean);
    const result = await runAgent(
      specSynthesize(plan, tagged, knownGaps),
      { label: "spec:synthesize", phase: "Spec", agentType: architect, schema: SPEC_SCHEMA, ...kit.draftOpts }
    );
    const uncoveredAnchors = [...uncovered.map((u) => u.anchor), ...missingPhases.map((m) => `phase: ${m.title}`)];
    if (!result) return { result: null, critique: null, uncoveredAnchors };

    // Unassigned anchors belong to no partition, and unowned phases had no drafter, so each gets a
    // lens of its own rather than going unchecked.
    const fidelityTargets = [...plan.partitions];
    if (gaps.unassigned.length) {
      fidelityTargets.push({
        id: "unassigned", title: "anchors the plan assigned to no partition", phases: [],
        source_sections: [`${SPECS}/${slug}-scope.md ## Goals; locate each anchor there`],
        anchors: gaps.unassigned
      });
    }
    const readerGroups = plan.partitions
      .filter((p) => p.phases.length)
      .map((p) => ({ id: p.id, group: p.phases.map((t) => ({ title: t })) }));
    if (pGaps.unowned.length) readerGroups.push({ id: "unassigned", group: pGaps.unowned.map((t) => ({ title: t })) });

    const lenses = [
      {
        lens: "template", run: () => kit.critic(SPEC_CRITIQUE, "template"),
        fallback: `The template critic returned no result, so this lens is unaudited. Audit ${specPath} against every Part A bullet of ${specTemplate}'s Composition-Time Self-Check.`
      },
      ...readerGroups.map(({ id, group }) => ({
        lens: `phases:${id}`, run: () => kit.critic(narrowestReaderCritique(group), `phases:${id}`),
        fallback: `The narrowest-reader critic for phases ${titlesOf(group)} returned no result, so those blocks are unaudited. Check each one's Agent routing line, Scope IN and OUT paths, Tests, and Acceptance Criteria against ${specTemplate}'s phase-block rules, reading only that block.`
      })),
      ...fidelityTargets.map((p) => ({
        lens: `fidelity:${p.id}`, run: () => kit.critic(specFidelityCritique(p, plan, knownGaps), `fidelity:${p.id}`),
        fallback: `The scope-fidelity critic for partition "${p.id}" returned no result, so its anchors are unaudited. Confirm each of ${p.anchors.join(", ")} (scope goal G<n> or closed question OQ<n> in ${SPECS}/${slug}-scope.md) lands in ${specPath} as a goal delivered by a phase, or as an open question, neither widened nor narrowed.`
      })),
      {
        lens: "coherence", run: () => kit.critic(specCoherenceCritique(plan), "coherence"),
        fallback: `The coherence critic returned no result, so this lens is unaudited. Check that every Depends on line in ${specPath} names only earlier phases, every cross-cutting name and layout is used identically, no two phases' Scope IN changes to one file conflict, no scope ## Non-Goals entry is reached, and ## Invariance carries a falsifier.`
      }
    ];
    log(`spec: ${lenses.length} lens critic(s): ${lenses.map((l) => l.lens).join(", ")}.`);
    const verdicts = await parallel(lenses.map((l) => l.run));
    const critique = mergeCritiques(lenses.map((l, i) => ({ lens: l.lens, critique: verdicts[i], fallback: l.fallback })));
    log(`spec lens critics: ${lensSummary(lenses, verdicts)}.`);

    const loop = await reviseLoop(kit, result, critique);
    if (loop.rounds === 2 && loop.critique && !loop.critique.clean) {
      log(`spec revise loop stopped at its 2-round cap with ${loop.critique.issues.length} issue(s) still flagged.`);
    }
    return { ...loop, uncoveredAnchors };
  };

  const composition = { mode: "feedback", partitions: null, rationale: null, phases_planned: 0, unassigned_anchors: [], uncovered_anchors: [], agents_run: 0 };

  let outcome;
  if (feedback) {
    // Structural refine: one reviser + one critic, unchanged. refine() reads no draft prompt on
    // the feedback path, so none is passed.
    outcome = await refine(architect, null, SPEC_CRITIQUE, SPEC_SCHEMA, "spec", "Spec", specPath, specTemplate, { ...specOpts, feedback });
  } else {
    composition.mode = "partitioned";
    // The plan is drafter-class work on the spec's own tier: it fixes the phase outline and the
    // interfaces every drafter builds against.
    const plan = await runAgent(
      SPEC_PLAN,
      { label: "spec:plan", phase: "Spec", agentType: architect, schema: SPEC_PLAN_SCHEMA, model: model || specOpts.draftModel }
    );
    if (!plan) {
      // Drafting without a plan would bring back the one-context draft this path exists to avoid.
      log(`spec plan agent returned no result for ${slug} — nothing written.`);
      composition.agents_run = agentsRun;
      return { stage: "spec", error: "plan agent returned no result; nothing written. Re-run the stage.", composition };
    }
    plan.anchors = [...new Set(plan.anchors)];
    uniquePartitionIds(plan, "spec");
    const gaps = planGaps(plan);
    const pGaps = phaseGaps(plan);
    const n = plan.partitions.length;
    log(`spec plan for ${slug}: ${plan.anchors.length} anchor(s), ${plan.phases.length} phase(s), ${n} partition(s) (cap ${MAX_SPEC_PARTITIONS}). ${plan.rationale}`);
    if (n === MAX_SPEC_PARTITIONS) log(`spec plan hit the ${MAX_SPEC_PARTITIONS}-partition cap; a scope with more divisions than that is grouped coarser to fit.`);
    if (gaps.unassigned.length) log(`spec plan left ${gaps.unassigned.length} anchor(s) unassigned: ${gaps.unassigned.join(", ")}.`);
    if (gaps.duplicated.length) log(`spec plan assigned ${gaps.duplicated.length} anchor(s) to more than one partition: ${gaps.duplicated.map((d) => `${d.anchor} (${d.ids.join(", ")})`).join(", ")}.`);
    if (gaps.foreign.length) log(`spec plan partitions list ${gaps.foreign.length} anchor(s) outside its anchor list: ${gaps.foreign.join(", ")}.`);
    for (const line of pGaps.lines) log(`spec plan: ${line}`);
    Object.assign(composition, {
      partitions: n, rationale: plan.rationale, phases_planned: plan.phases.length,
      unassigned_anchors: [...gaps.unassigned, ...pGaps.unowned.map((t) => `phase: ${t}`)]
    });
    outcome = await composePartitioned(plan, gaps, pGaps);
    composition.uncovered_anchors = outcome.uncoveredAnchors;
  }
  composition.agents_run = agentsRun;
  if (!outcome.result) {
    log(`spec draft agent returned no result for ${slug} — nothing written.`);
    return { stage: "spec", error: "draft agent returned no result", composition };
  }
  const spec = outcome.result;
  const { critique } = outcome;
  log(`spec drafted for ${slug} at ${spec.spec_path}: ${spec.open_questions.length} open question(s) for review; ${verdictNote(critique)}; composition ${composition.mode}${composition.mode === "partitioned" ? ` (${composition.partitions} partition(s), ${composition.phases_planned} phase(s) planned)` : ""}, ${composition.agents_run} agent(s) run.`);
  return { stage: "spec", spec, critique, composition };
}

// --- Implement: each spec phase, routed (impl tier), criteria-checked (check tier), reviewed (architect on the review tier), committed (commit tier), in sequence ---
// Verify is split into two calls: a criteria check and an architect review.
if (stage === "implement") {
  phase("Implement");
  // Guards first. `phases` is rebuilt by the orchestrator from the on-disk spec; a missing or
  // malformed entry means that reconstruction failed, and an agent the config does not list would
  // run an unconfigured agentType. Either way nothing should touch the tree.
  if (!Array.isArray(phases) || phases.length === 0) {
    log(`implement for ${slug}: args.phases missing or empty. Rebuild it from ${SPECS}/${slug}.md. Nothing was run.`);
    return { stage: "implement", error: "args.phases missing or empty" };
  }
  for (const [i, p] of phases.entries()) {
    const bad = !isObj(p)
      ? "is not an object"
      : ["title", "agent", "scope", "acceptance"].filter(k => typeof p[k] !== "string" || !p[k].trim()).map(k => `has no ${k}`).join(", ");
    if (bad) {
      log(`implement for ${slug}: phases[${i}] ${bad}. Nothing was run.`);
      return { stage: "implement", error: `phases[${i}] ${bad}` };
    }
    if (!ROUTABLE.includes(p.agent)) {
      log(`implement for ${slug}: phase "${p.title}" routes to "${p.agent}", which is not one of ${ROUTABLE.join(", ")}. Nothing was run.`);
      return { stage: "implement", error: `phase "${p.title}" routes to unconfigured agent "${p.agent}"` };
    }
  }
  // All phases share one working tree on one branch. There is no worktree isolation, by design.
  // Spec phases are dependency-ordered. So they run one at a time in a for...of loop, not in
  // pipeline(). At most one dev agent writes the tree at a time. Each phase's verify reads a
  // settled tree.
  //
  // Because phases are dependency-ordered, a failed phase breaks every phase after it. The loop
  // halts at the first phase whose criteria check fails, whose architect review is unsound, or
  // whose agents die. It records the failure and returns `halted` naming that phase. The human
  // then decides whether to refine or repair before any later phase spends tokens on a broken tree.
  //
  // Each phase that passes both checks is committed before the next phase starts, so the PR
  // carries one commit per phase and a halted phase's work is the only uncommitted work on the
  // tree. Every phase commit carries a `Spec-Phase: <slug> / <title>` trailer. After /resume, that
  // trailer is the pass record that the command doc's Step 3 re-entry slicing reads from git log.
  const results = [];
  let halted = null;
  const GENERIC_GUARD = "a source-shape guard that mechanizes an invariant no runtime test can observe";
  const guardKinds = c.protected_guards.some(g => g.startsWith(GENERIC_GUARD))
    ? c.protected_guards
    : [...c.protected_guards, GENERIC_GUARD];
  const invariantsClause = c.invariants.length
    ? `Use the load-bearing invariants, each a heading under ${c.steering.file} -> ${c.steering.invariants_heading}: ${c.invariants.join("; ")}.`
    : `Use the load-bearing invariants named in ${c.steering.file} (none are configured; judge against the spec's own ## Invariance section).`;
  // Tests a change still owes even under "no test for a move or rename". Omitted when none are configured.
  const exceptionsClause = c.mandatory_tests.length
    ? ` Exceptions apply. ${c.mandatory_tests.map(t => `When ${t.when}, the change still owes ${t.requires}${t.rule ? ` (defined in ${t.rule}; open it with the Read tool, it is path-scoped and does not load on its own)` : ""}.`).join(" ")}`
    : "";
  for (const p of phases) { // reconstructed from <specs_dir>/<slug>.md's Agent routing lines; on re-entry, the not-yet-passed suffix
    // An agent is reviewed by its own lane's architect. An unlaned agent (a docs phase) is
    // reviewed by the workstream's architect. This replaces a two-way mapping that silently sent
    // every non-dev phase to one lane.
    const verifyArchitect = laneOf(p.agent)?.architect || architect;

    // (a) Implement the phase with the dev agent named on the spec's Agent routing line.
    // The return value is checked for null (agent skipped or died) and otherwise discarded.
    // The verify agents read the tree itself, not the implementer's account of it.
    // This runs on the impl tier. The top-tier spec already fixed the phase's scope and acceptance
    // criteria. A weak implementation costs one halted phase, because the criteria checker and
    // the architect review below both gate it. `implModel` raises the tier when a halted phase
    // is resent.
    const impl = await agent(
      `AS. ${roleOf(p.agent)}

       OBSERVE. Read ${SPECS}/${slug}.md. The work to implement is the phase titled
       "${p.title}", with the scope below.

       CONSIDERING. Use the \`${c.rules_dir}/*.md\` whose globs intersect this phase's
       files-affected set, if that directory exists. Do not touch any file outside the phase's
       scope. Do not create, switch, or rename branches. Do not commit or stage. The workflow
       commits the phase after it is verified. Do not use git worktrees. Do not use git stash. Do
       not run the whole test suite. Work on the current branch exactly as it is checked out.

       ORDER.
       1. The phase's declared prerequisites -> a go or no-go decision before any write.
       2. Go -> the phase's steps, executed in dependency order.
       3. Each behaviour this phase's \`#### Scope\` **IN** commits to -> one test that fails if
          this phase's change is reverted. Land it alongside the change. A mutation that an
          existing test already pins gets no new test. A mutation that changes no observable
          behaviour (a move, a rename, a re-home, a comment) gets no new test.${exceptionsClause}
       4. Produced artifacts -> post-condition checks.

       VALIDATE. Every change must stay within the phase's declared scope. Re-read the phase's
       Acceptance Criteria against the spec, not against the diff you just wrote. The result must
       satisfy them.

       OUTPUT. Apply the edits to the current branch. Return a summary that names each file
       touched and the acceptance criterion it serves. Name every mutation you landed with no new
       test, together with the existing test that pins its behaviour.
       \n${SCOPED_TESTS} Where a criterion you are working toward names a whole-suite run, satisfy
       it with the narrowest selection covering the files you touched. Leave the global claim to
       validate.\n--- phase scope ---\n${p.scope}\n--- end phase scope ---`,
      { label: `impl:${p.title}`, phase: "Implement", agentType: p.agent, model: implModel || model || M.impl }
    );
    if (impl === null || impl === undefined) {
      halted = p.title;
      // sound: null - the review never ran. Same convention as a failed criteria check below.
      results.push({ phase: p.title, passed: false, sound: null, criteria: null, review: null, error: "implementation agent returned no result" });
      log(`implement halted at phase "${p.title}": implementation agent returned no result.`);
      break;
    }

    // (b) Verify is two complementary calls. First, an agent on the check tier runs the named
    // tests, reads the named files, and reports observable pass or fail per acceptance criterion.
    // This check rests on evidence. Its verdict does not depend on the judgment or blind spots of
    // whoever wrote the code.
    const criteria = await agent(
      `Check each acceptance criterion below for phase "${p.title}" of ${SPECS}/${slug}.md.
       For each criterion, run the named tests. Read the named files. Set
       met=true only when a run result or a file read observably satisfies the criterion. Do not
       assume. Verify. Report pass or fail per criterion.
       \n${SCOPED_TESTS}
       \nWhen a criterion names a whole-suite run, do not run it. Substitute the narrowest
       selection that covers the files this phase touched plus their co-located tests. Judge the
       criterion on that evidence. Set deferred=true on it. The global no-regression claim is the
       validate stage's to confirm. Set deferred=false on every other criterion. deferred records
       that a criterion's global reach went unverified here. It never excuses a failure you did
       observe. A substituted run that failed is met=false.\n--- acceptance criteria ---\n${p.acceptance}\n--- end acceptance criteria ---`,
      {
        label: `verify:checks:${p.title}`, phase: "Implement", model: M.check,
        schema: {
          type: "object", required: ["passed", "criteria"],
          properties: {
            passed: { type: "boolean" },
            criteria: {
              type: "array",
              items: {
                type: "object", required: ["criterion", "met", "deferred"],
                properties: {
                  criterion: { type: "string" },
                  met:       { type: "boolean" },
                  deferred:  { type: "boolean" }
                }
              }
            }
          }
        }
      }
    );

    // A failed criteria check halts the phase whatever the review would say. The developer
    // re-runs this phase after repairing it, and that re-runs the review against the repaired
    // tree. An architect-tier call on a tree already known to halt would only critique code that
    // is about to change. A null result (agent skipped or died) is an unknown verdict and is
    // treated as failure.
    // A self-reported `passed` is not trusted over its own rows: the phase passes only when the
    // checker said so AND reported at least one criterion AND every row it reported is met. A
    // checker that says passed=true beside an unmet row fails closed.
    const rows = criteria && Array.isArray(criteria.criteria) ? criteria.criteria : null;
    const passed = !!(criteria && criteria.passed && rows && rows.length > 0 && rows.every(x => x && x.met));
    if (!passed) {
      halted = p.title;
      // sound: null means the review never ran. sound: false means it ran and found the phase
      // unsound. Both are falsy, so Step 3's re-entry slicing still re-sends this phase.
      results.push({
        phase: p.title, passed: false, sound: null,
        criteria: rows, review: null
      });
      const why = !criteria
        ? "criteria checker returned no result"
        : criteria.passed
          ? "criteria checker claimed passed but its own rows are empty or include an unmet criterion (failed closed)"
          : "acceptance criteria not met";
      log(`implement halted at phase "${p.title}": ${why}; architect review and later phases not run.`);
      break;
    }

    // (c) The same-lane architect gives a qualitative review that tests cannot settle: design fit,
    // constraint adherence, simplicity. It runs only when (b) passed, on the review tier: the
    // review checks the tree against a spec the top tier already wrote, and `model` is the only
    // way to raise it.
    const review = await agent(
      `AS. ${roleOf(verifyArchitect)}

       OBSERVE. Review the "${p.title}" implementation just produced on the current branch.

       CONSIDERING. Use ${SPECS}/${slug}.md. ${openRules("the files this phase changed")}
       ${invariantsClause} The mechanical acceptance-criterion checks have already run
       elsewhere. Do not repeat them.

       ORDER.
       1. Implementation -> design fit against the spec's intent.
       2. Design fit -> adherence to each load-bearing invariant.
       3. Adherence -> simplicity. Ask whether the change does only what the phase intends.
       3b. Simplicity -> test proportionality. For each test this phase landed, ask whether it
           fails when a behaviour is wrong or only when the code is shaped differently. Two
           anti-patterns define the failure: "Tests a wrong program passes too" (asserting a
           symbol exists, lives in a file, or equals its own literal instead of calling it and
           asserting what it returns) and "Source-shape assertions with no named invariant"
           (reading source text where a runtime test could observe the behaviour). See
           ${c.steering.file} -> ${c.steering.anti_patterns_heading} where present. Ask whether
           any two of them fail for the same reason. For each shape-only test, name the existing
           test that already covers the behaviour it gestures at. Draw that test only from this
           phase's files and their co-located tests. If no behaviour is at stake, say so. These
           guard kinds are never findings: ${guardKinds.join("; ")}. Every 3b finding is an
           "observation". A 3b finding is never on its own a blocking concern.
       4. The above -> concerns worth raising.

       VALIDATE. Each concern must stand even if every test passes. Anchor each concern to a named
       spec section or a named rule. For a 3b finding, anchor it to the landed test file together
       with the existing test that covers its behaviour. Never anchor a concern to a coverage
       percentage or a style preference. Mark a concern "blocking" when the phase does not satisfy
       its intent. That means a load-bearing invariant is violated, or the design diverges from
       the spec, or an acceptance criterion is met only nominally. Met only nominally means the
       named test passes but the property it exists to check does not hold. Mark a concern
       "observation" when it is true and worth recording but does not by itself mean the phase
       should halt. That covers an adjacent defect, follow-up work, documentation or wording
       drift, or a pre-existing issue this phase surfaced without causing. Set sound=false if and
       only if at least one concern is blocking.

       OUTPUT. Return a soundness verdict and the list of concerns. Each concern carries its
       severity. Each concern carries an "anchor" naming the spec section or invariant it
       implicates. For a test-proportionality finding, the anchor names the landed test file. A
       concern you cannot anchor is a style preference. Drop it rather than raise it.`,
      {
        label: `verify:review:${p.title}`, phase: "Implement", agentType: verifyArchitect, model: model || M.review,
        schema: {
          type: "object", required: ["sound", "concerns"],
          properties: {
            sound: { type: "boolean" },
            concerns: {
              type: "array",
              items: {
                type: "object", required: ["severity", "concern", "anchor"],
                properties: {
                  severity: { enum: ["blocking", "observation"] },
                  concern:  { type: "string" },
                  anchor:   { type: "string" }
                }
              }
            }
          }
        }
      }
    );

    // A skipped or dead reviewer is an unknown verdict and is treated as failure. A review that
    // lists a blocking concern halts even if it set sound=true. A self-contradicting review fails
    // closed.
    const concerns = review && Array.isArray(review.concerns) ? review.concerns : [];
    const blocking = concerns.filter(x => x && x.severity === "blocking");
    const sound = !!(review && review.sound) && blocking.length === 0;
    const entry = { phase: p.title, passed: true, sound, criteria: rows, review };
    results.push(entry);
    if (!sound) {
      halted = p.title;
      log(`implement halted at phase "${p.title}": ${review ? `architect review unsound (${blocking.length} blocking concern(s)${review.sound ? "; the review said sound=true beside a blocking concern, failed closed" : ""})` : "architect reviewer returned no result"}; later phases not run.`);
      break;
    }

    // (d) Commit the verified phase. This is mechanical, so it runs on the commit tier
    // (config.models.commit). The committer stages the whole tree except the specs directory,
    // because this slug's artifacts are committed at ship and other workstreams' artifacts never
    // are. It reports staged paths the phase scope does not name instead of dropping them, since
    // an unstaged leftover would ride into the next phase's commit anyway. A failed commit
    // (usually a pre-commit hook) halts the loop. The phase has still passed review, so re-entry
    // does not resend it. The developer fixes and commits it by hand (command doc Step 6.3).
    const commit = await agent(
      `Commit the verified implementation of phase "${p.title}" of ${SPECS}/${slug}.md.

       ORDER.
       1. Run \`git add -A -- . ':(exclude)${SPECS}'\`. Never stage anything under ${SPECS}/.
       2. Run \`git diff --cached --stat\`. If nothing is staged, return committed=false with no
          error and stop.
       3. List each staged path that the phase scope below does not name, either by file or by a
          directory that contains it. Return these as "unexpected". Commit them anyway.
       4. Read \`git diff --cached\` and the phase's section of the spec. Read
          \`git log -10 --format=%s\` for the repository's subject convention. Write the message:
          - Subject: 72 characters or fewer, imperative mood, in the repository's convention.
            Where the log shows none, use a conventional commit, \`<type>(<area>): <summary>\`,
            and pick the type from the change (feat, fix, refactor, test, docs, chore).
          - Body: prose wrapped at 72 columns. Say what the phase changed and why, in a few
            sentences. Do not list every file.
          - Trailers, as the final paragraph, in this order:
            \`Spec-Phase: ${slug} / ${p.title}\`
            then any Co-Authored-By trailer your session's attribution instructions give.
       5. Commit with \`git commit -F <message file>\`, writing the message file under your
          scratchpad directory, outside the repository.

       CONSIDERING. Never pass --no-verify. Never amend, reset, rebase, or switch branches. Never
       edit a source file, including to satisfy a pre-commit hook. The code has already been
       reviewed, and changing it here would bypass that review. If the commit fails, return
       committed=false with the hook's or git's error output in "error".

       OUTPUT. Return committed, the new commit's full SHA from \`git rev-parse HEAD\`, the
       subject, unexpected, and error.\n--- phase scope ---\n${p.scope}\n--- end phase scope ---`,
      {
        label: `commit:${p.title}`, phase: "Implement", model: M.commit,
        schema: {
          type: "object", required: ["committed", "unexpected"],
          properties: {
            committed:  { type: "boolean" },
            sha:        { type: "string" },
            subject:    { type: "string" },
            unexpected: { type: "array", items: { type: "string" } },
            error:      { type: "string" }
          }
        }
      }
    );
    entry.commit = commit;
    if (!commit || (!commit.committed && commit.error)) {
      halted = p.title;
      entry.error = commit
        ? `phase passed but its commit failed: ${commit.error}`
        : "phase passed but the committer returned no result; check git log for whether it committed";
      log(`implement halted at phase "${p.title}": ${entry.error}; later phases not run.`);
      break;
    }
    const unexpected = Array.isArray(commit.unexpected) ? commit.unexpected : [];
    if (unexpected.length) log(`phase "${p.title}" commit ${commit.sha} included paths outside the phase scope: ${unexpected.join(", ")}.`);
  }
  // Deferred criteria are the whole-suite claims the checker replaced with a scoped run. They are
  // exactly the debt the validate stage settles. So the count goes in the stage's summary, not
  // only in the per-phase detail the orchestrator may not unpack.
  const deferredCount = results.reduce(
    (n, r) => n + (r.criteria || []).filter(x => x && x.deferred).length, 0
  );
  if (!halted) log(`implement done for ${slug}: ${results.length} phase(s) implemented, criteria-checked, reviewed, and committed${deferredCount ? `; ${deferredCount} whole-suite criterion/criteria deferred to validate` : ""}.`);
  return { stage: "implement", results, halted };
}

// --- Validate: full-suite regression gate between implement and ship ---
// The implement stage's checker runs only the tests each acceptance criterion names, so it
// cannot see regressions outside those tests. This stage closes that gap before the
// push/PR: one agent on the cheap validate tier runs every configured full suite and
// reports what it observed. It only reports and fixes nothing. The human decides what a failure
// means (rewind to implement, refine, or fix directly). Re-running is idempotent, so the
// orchestrator may validate again freely after /resume or after any further code change.
if (stage === "validate") {
  phase("Validate");
  // A suite longer than the Bash tool's 10-minute foreground cap must run in the background with
  // its own timeout (the tool's hard cap is 30 minutes, which validateConfig enforces).
  const suiteLines = c.suites.map((s, i) =>
    `(${i + 1}) ${s.name}: cwd ${s.cwd}${s.setup ? `; first run \`${s.setup}\` in the same shell` : ""}; command \`${s.command}\`; timeout ${s.timeout_ms} ms${s.timeout_ms > 600000
      ? ` - longer than the Bash tool's 10-minute foreground cap, so run it with run_in_background: true and timeout: ${s.timeout_ms}, wait for its completion notification, then read its output; do not poll it with short checks`
      : `; run it in the foreground with timeout: ${s.timeout_ms}`}.${s.notes ? ` ${s.notes}` : ""}`
  ).join("\n");
  const validation = await agent(
    `Run every configured full test suite of ${c.project.name} and report observable results.
     This stage is the only whole-suite run in the pipeline. The implement stage's phases run
     scoped selections and defer their global no-regression claims to you. Run every suite in
     full here even if every implement phase passed. A suite its timeout stops is a failure.
     Suites (run each one exactly as written from its cwd, relative to the repo root; add no
     flags of your own):
${suiteLines}
     For each suite, report pass/fail, with "suite" set to the suite's name exactly as written
     above, and one entry per suite. Report the exact pass/fail counts from the runner's own
     summary line. For every failing test, report its identifier plus a one-line failure reason.
     Set passed=true only if every suite ran to completion with zero failures. A suite that
     errored before completing is a failure, not a skip. Do not fix, edit, or re-run flaky
     tests to green. This is a report-only gate.`,
    {
      label: "validate:full-suite", phase: "Validate", model: M.validate,
      schema: {
        type: "object", required: ["passed", "suites"],
        properties: {
          passed: { type: "boolean" },
          suites: {
            type: "array",
            items: {
              type: "object", required: ["suite", "passed", "summary"],
              properties: {
                suite:    { type: "string" },
                passed:   { type: "boolean" },
                summary:  { type: "string" },
                failures: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      }
    }
  );
  if (!validation) {
    log(`validate agent returned no result for ${slug}. Treat it as not validated.`);
    return { stage: "validate", error: "validate agent returned no result" };
  }
  // Fail closed. The agent's own `passed` counts only when every configured suite has a reported
  // entry that passed. A suite the agent skipped, renamed past recognition, or forgot is not a
  // pass. An agent that said passed=true over a failing or missing suite is overruled.
  const reported = Array.isArray(validation.suites) ? validation.suites : [];
  const norm = (x) => String(x || "").trim().toLowerCase();
  const unconfirmed = c.suites
    .filter(s => !reported.some(r => r && norm(r.suite) === norm(s.name) && r.passed))
    .map(s => s.name);
  const passed = !!validation.passed && reported.every(r => r && r.passed) && unconfirmed.length === 0;
  if (validation.passed && !passed) {
    log(`validate for ${slug}: the agent reported passed=true, overruled (failed closed) because ${unconfirmed.length ? `no passing report for suite(s) ${unconfirmed.join(", ")}` : "a reported suite failed"}.`);
  }
  log(`validate done for ${slug}: ${passed ? "all suites green — ready to ship" : "FAILURES — do not ship"} (${reported.map(s => `${s.suite}: ${s.passed ? "pass" : "FAIL"}`).join(", ")}${unconfirmed.length ? `; unconfirmed: ${unconfirmed.join(", ")}` : ""}).`);
  return { stage: "validate", validation: { ...validation, suites: reported, passed } };
}

// Unknown stage: surface the contract rather than silently doing nothing.
log(`spec-pipeline: unknown stage "${stage}" — expected one of triage | scope | spec | implement | validate.`);
return { stage, error: `unknown stage "${stage}"` };
