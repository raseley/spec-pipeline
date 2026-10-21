# Specs directory

This directory belongs to the spec pipeline (`/spec-pipeline`). It holds two kinds of file:

- **Templates**, committed and permanent: `triage-template.md`, `scope-template.md`, and `spec-template.md`.
- **Per-workstream artifacts**, one set per slug: `<slug>-triage.md`, `<slug>-scope.md`, and `<slug>.md` (the spec).

Artifacts are the pipeline's state. Every stage re-derives where a workstream stands from these files, so a
fresh session (or `/resume`) can pick up any workstream cold.

Lifecycle of an artifact set:

1. Each stage writes its artifact here. Artifacts stay **untracked** through triage, scope, and spec.
2. When the spec is approved, the orchestrator creates the workstream's `<prefix>/<slug>` branch, marks the
   spec `Final`, and commits the three artifacts on it (`docs(specs): add <slug> pipeline artifacts`). From
   then on they are tracked on that branch, and every later edit gets its own
   `docs(specs): revise <slug>: ...` commit.
3. The ship step links the spec from the PR and (by default) removes the artifacts from the branch tip in a
   separate `chore(specs): remove <slug> pipeline artifacts` commit. The record survives in history; recover
   a file with `git restore --source <sha> -- <path>`.

Rules for this directory:

- Never run `git add -A` (or `git add .`) over it, and never glob-delete it (`rm <dir>/*`). Other workstreams'
  artifacts live here too; add or remove files by explicit path only.
- The three templates are read by the pipeline at runtime. Their section headings, frontmatter keys, status
  tokens, and literal sentences (such as `No open questions — implementation may begin.`) are matched byte for
  byte by the workflow script and the orchestrator command. Do not rename or reword them; see `docs/contracts.md`
  in the spec-pipeline repository for the full list. Example content inside the templates may be edited freely.
- This directory's location is `specs_dir` in `.claude/spec-pipeline.json` (`docs/specs` by default).
