# spec-pipeline (the project itself)

This repository is the distributable source of the spec pipeline: a Claude Code command, a Dynamic Workflow
script, document templates, and a starter kit that other projects adopt. See `README.md` and `ADOPT.md`.

- The pipeline is NOT run in this repository. `payload/` mirrors an adopter's root and is copied out, not executed here.
- `payload/` and `starter-kit/` must stay project-neutral. All examples use the "Orderly" project described in `docs/configuration.md`.
- Several literals are coupled byte-exact across the command, the script, and the templates (`docs/contracts.md`). Change them together or not at all.
- Before finishing any change, run `bash scripts/check-contracts.sh` and fix every FAIL.
- No personal data (email addresses etc.) anywhere in the repo.
