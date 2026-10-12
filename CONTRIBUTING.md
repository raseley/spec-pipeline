# Contributing

Thanks for helping improve spec-pipeline. Contributions that make the pipeline more rigorous, easier to adopt,
or more portable across stacks are welcome.

## Scope

- Runtime: `payload/` (command, workflow script, config, templates).
- Adoption experience: `ADOPT.md`, `docs/`, `starter-kit/`, `scripts/verify-adoption.sh`.
- Not in scope: stack-specific content. Anything specific to one technology belongs in an adopter's configuration, not in `payload/`.

## Before you open a pull request

1. Run `bash scripts/check-contracts.sh`. It verifies that every coupled literal is still present in the files that must match, that the workflow script parses and avoids the forbidden runtime APIs, and that no email address slipped in. It must exit 0.
2. If you derived examples from a private codebase, list that codebase's names (one extended regex per line) in a file outside this repository and run the check with `SPEC_PIPELINE_BANNED_TERMS=<that file>`. Never commit the list.
3. If you touched the workflow script, remember the Workflow runtime limits: plain JavaScript, a pure-literal `export const meta`, no filesystem, no `Date`, no `Math.random`. A bare `node --check` on the script is not a reliable syntax check (its body uses top-level `return`); `scripts/check-contracts.sh` wraps it properly.
4. Keep the "why" comments. This project's value is the design reasoning, so explain non-obvious choices rather than deleting the explanation.

## Examples policy

All illustrative paths, agents, tests, invariants, and routes use the single example project "Orderly" described in `docs/configuration.md`. Do not introduce a second example domain, and do not paste code or names from a private project.

## Changing a contract

Some strings are matched across the templates, the script, and the command (see `docs/contracts.md`). To change one, update all of these in the same pull request:

- the templates under `payload/docs/specs/`
- the workflow script
- the orchestrator command
- `docs/contracts.md`
- `scripts/check-contracts.sh`

Add a `CHANGELOG.md` entry; contract changes that break existing adopters bump the config `version`.

## No personal data

Do not commit email addresses, tokens, local paths, or settings files containing either.

## License

By contributing you agree that your contributions are licensed under the MIT License.
