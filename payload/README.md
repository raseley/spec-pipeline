# spec-pipeline payload

This directory mirrors your repository root. Copy its two subdirectories, not the directory itself (copying `payload/.` would overwrite your own `README.md` with this file): `cp -R payload/.claude payload/docs <your-repo>/`. If your repository already has `docs/specs/README.md` or any `.claude/` file of the same name, copy file by file instead and merge (ADOPT.md Step 3 lists the seven files).
That adds `.claude/commands/spec-pipeline.md`, `.claude/workflows/spec-pipeline.js`, `.claude/spec-pipeline.json`, and the templates under `docs/specs/`; it never touches `.claude/settings.json`. If your specs directory is not `docs/specs`, move the templates there and set `specs_dir`.
Then edit `.claude/spec-pipeline.json` for your stack (it ships filled in for the example "Orderly" project) and resolve every `<!-- ADOPT: -->` marker in the templates.
Follow `ADOPT.md` at the root of the spec-pipeline repository for the full procedure, and `docs/configuration.md` there for every config key.
