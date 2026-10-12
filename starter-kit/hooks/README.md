# Enforcement hooks

`check-forbidden-pattern.sh` is a skeleton for a Claude Code `PostToolUse` hook that blocks one forbidden
source pattern right after an agent writes it. The shipped example enforces the example project's "Money as
Integer Cents" invariant: `float(` or `Decimal(` applied to a `*_cents` value in `api/`.

Hooks are optional. Add one only for an invariant a regex can check with a **very low false-positive rate**.
A hook that cries wolf trains agents to route around it. Hooks back up the steering file; they never replace
it, and the steering text must still state the rule.

## The exit-2 contract

Claude Code passes the tool call to the hook as JSON on stdin (`tool_input.file_path` holds the edited
file). The hook's exit status decides what happens:

| Exit | Meaning |
|---|---|
| `0` | no violation, or the file is out of scope |
| `2` | violation: **stderr is fed back to the agent** as corrective feedback, and the agent fixes it |
| anything else | a hook error; shown to the user, not to the agent as a correction |

So the stderr message is a prompt. Make it precise: the file, the offending lines, the exact fix, and the
steering section that states the rule.

## Adapting the skeleton

Edit the five marked sections:

1. **PATH SCOPE**: which files the check applies to.
2. **EXCLUSIONS**: the file that legitimately defines the pattern (for example the module holding the
   conversions) and tests, whose fixtures may use literals.
3. **PATTERN**: an extended regex (`grep -E`, for portability).
4. **FALSE-POSITIVE FILTERS**: comment lines and documentation-style mentions.
5. **MESSAGE**: what is wrong, how to fix it, where the rule lives.

The script parses JSON with `python3` because `jq` is not guaranteed; it exits 0 if parsing fails, so a
hook problem never blocks an edit. Test it by hand:

```sh
printf '{"tool_input":{"file_path":"api/routes/refunds.py"}}' | .claude/hooks/check-forbidden-pattern.sh; echo "exit $?"
```

## Registering it

Copy the script to `.claude/hooks/` (rename it after the invariant), make it executable
(`chmod +x`), and **merge** this into `.claude/settings.json` (never overwrite existing hooks or
permissions):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/check-forbidden-pattern.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

## Mirror it as a git pre-commit hook

Agents are not the only authors. Run the same check over staged files in a git pre-commit hook kept in the
repository (for example `.githooks/pre-commit`) and enable it with `git config core.hooksPath .githooks`. The
pre-commit version loops over `git diff --cached --name-only --diff-filter=ACM`, applies the same scope,
exclusions, pattern, and filters, and exits 1 with the same message. Mention the `core.hooksPath` command in
the steering file's Environment Setup section.

## When a hook is the wrong tool

- The rule needs semantic understanding (tenant scoping, design fit): leave it to the steering file, a
  path-scoped rule, and the architect review.
- The pattern has legitimate uses outside a small, nameable set of files: the exclusions will grow until the
  hook means nothing.
- A test can observe the behaviour: write the test instead. A source-shape guard test (like Orderly's
  integer-cents guard) is the right tool only when no runtime test can observe the invariant.
