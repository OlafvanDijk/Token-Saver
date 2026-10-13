---
name: token-audit
description: Review the current session for token waste and suggest concrete fixes. Use when the user asks to optimize, audit, or reduce token usage, or says the session is getting expensive or slow.
---

# Token audit

1. Run `/token-tips` output (or `node scripts/report.js`) to see what token-saver already caught.
2. Scan the conversation for waste, most expensive first:
   - Whole-file reads where a Grep or line range would do; the same file read more than once.
   - Very large tool outputs (long logs, recursive listings, broad searches).
   - Unity: raw .unity/.prefab/.asset YAML, Library/ or .meta files in results.
   - Long CLAUDE.md files, unused MCP servers or plugins whose tool lists load every turn.
   - Using a large model or high effort for mechanical edits.
3. Report at most five findings, each with the specific fix (for example "use Grep for `PlayerHealth` in Assets/Scripts instead of reading Main.unity").
4. Recommend `/compact` if the conversation is long but continuing, `/clear` if the task changed, and a lower-effort model for simple edits.
5. Do not make changes without asking. Suggest config only for genuine edge cases (`token-saver.config.json`: `extraIgnore`, `disable`, thresholds).
