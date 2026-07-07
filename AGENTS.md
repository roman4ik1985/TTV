# AGENTS.md

## Purpose
Base operating rules for a new project initialized from the Codex project template.

## Default Project Structure
- `raw/sources/` — immutable source materials
- `raw/web-clipped/` — captured web materials
- `raw/assets/` — images and attachments
- `wiki/entities/` — entities
- `wiki/concepts/` — concepts
- `wiki/sources/` — source summaries
- `wiki/synthesis/` — analysis, handoffs, and working notes
- `wiki/index.md` — wiki entrypoint
- `wiki/log.md` — append-only operation log

## Core Rules
1. Do not edit existing files in `raw/*` except to add new source files.
2. Keep `wiki/index.md` and `wiki/log.md` current.
3. Use Obsidian links like `[[...]]` between wiki pages when the project uses the wiki structure.
4. Keep `AGENTS.md` for long-lived rules, not one-off task notes.

## Logging Policy
1. After each substantive user request, append a short operation entry to `wiki/log.md`.
2. Each entry should include:
   - operation type (`query`, `implementation`, `config`, `handoff`, `lint`, `ingest`)
   - touched files
   - short result summary
3. If the project has `scripts/append-wiki-log.ps1`, use it as the canonical logger.
4. Otherwise use UTF-8 safe append/write commands.

## Handoff Policy
1. Before switching branch, archiving a long thread, or moving a contour into a new chat, prepare a short handoff.
2. The minimal handoff should include:
   - goal
   - what is already done
   - next step
   - key files
3. If the chat becomes too large or too mixed and that starts hurting accuracy or speed, recommend moving to a new chat.
4. Canonical extraction command: `вынеси в новый чат:`

## Next-Step Format
1. When proposing next steps, separate:
   - `Что именно (steps, budget)`
   - `Минимальный scope (steps, budget)`
2. In those labels, write exactly two numbers in parentheses:
   - number of steps
   - percent of a 5-hour budget
3. Right after those lines, add a short breakdown through slices/packages or numbered items.


## Multi-Step Task Teaming Policy
1. For every new multi-step task, treat the work as if it is handled by a full team of specialists, not a single isolated programmer.
2. Analyze the total scope of work before implementation starts.
3. Prepare an execution plan and send it to the user for approval before implementation.
4. After approval, estimate full completion for two scenarios:
   - Scenario 1: the agent completes all work alone.
   - Scenario 2: the agent creates 2-3 subagents and delegates the work.
5. For each scenario, estimate:
   - required number of steps;
   - expected percentage of the available 5-hour limit.
6. Do not start implementation of a multi-step task until the user has approved the plan and reviewed the execution estimate.