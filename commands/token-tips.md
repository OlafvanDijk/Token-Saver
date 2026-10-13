---
description: Show token-saver status, active rules, and estimated tokens saved this session
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/report.js"`

Show the report above to the user as-is. If it is missing, tell the user the report could not run and suggest `node <token-saver folder>/scripts/report.js`.

Then add these tips in at most four short bullets: turn on the live counter by setting `statusLine` to `{"type":"command","command":"node \"<token-saver folder>/scripts/statusline.js\""}` in settings.json; override defaults in `token-saver.config.json` only for edge cases; use `/compact` when the conversation gets long; use `/clear` between unrelated tasks.
