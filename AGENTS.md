# AGENTS.md — Operating Guardrails for AI Coding Agents

This repository belongs to Erik's personal local-AI ecosystem. Every AI agent
working here (Claude, Codex, Antigravity/Gemini, Jules, Hermes, Vibe, local
models, and any subagent they spawn) follows these rules. When a rule and a
request conflict, stop and ask.

## Hard rules

1. **Never commit secrets.** No API keys, tokens, passwords, `.env` files or
   credentials. Use environment variables or the secret vault.
2. **Never destroy work.** No `git reset --hard`, `git clean`, force-push,
   history rewrites, or deleting files, branches or worktrees unless Erik asks
   for that exact action.
3. **Smallest correct diff.** Do not rename public symbols, rewrite working
   logic, or reformat unrelated code unless the task requires it.
4. **Land your own work in the same session.** Commit and push to the default
   branch. Run `git pull --rebase` first, never overwrite someone else's
   commits, and stage exact paths rather than `git add -A`. Identify yourself
   with a commit trailer.
5. **Evidence before "done".** Run this repository's own tests, build or
   validator and read the result. An exit code, a commit message or another
   agent's report is not proof.
6. **Generated files come from their generator.** Do not hand-edit build output
   or generated projections; regenerate them from their source.
7. **Never scan OneDrive.** Do not search, list or traverse
   `C:\Users\traik\OneDrive\**` (or its `/mnt/c` form); it rehydrates cloud
   files and has crashed the machine.
8. **Personal data is read-only.** Do not edit, move or publish personal notes,
   finance records or contact data unless the task is explicitly about them.

## Where the wider rules live

- Execution autonomy, merge authority and shell-quoting policy:
  `C:/Users/traik/.agents/POLICY_*.md`
- Troubleshooting ledgers and backlogs: `C:/Users/traik/.agents/LEDGER_INDEX.md`

## Repository-specific rules

_None yet. Add rules for this repository below this line; keep the section
above identical across repositories._

---
Standard: `local-ai-agent-ecosystem/docs/standards/AGENTS_STANDARD.md` (BL-328).
