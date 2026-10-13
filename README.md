# token-saver

Zero-config token optimizer for Claude Code. Install it and it works; you only touch config for edge cases.
Needs Node on PATH. Unity projects are detected automatically (`ProjectSettings/ProjectVersion.txt`).

## 30-second start
1. Try it: `claude --plugin-dir <path-to>/token-saver`
2. Install permanently: `/plugin marketplace add <folder containing .claude-plugin/marketplace.json>` then `/plugin install token-saver@local-tools`
3. Run `/token-tips` any time to see the active profile, rules, and tokens saved this session.

### Live savings counter (optional)
Add to `~/.claude/settings.json` (skip if you already use a custom status line):
```json
{ "statusLine": { "type": "command", "command": "node \"<path-to>/token-saver/scripts/statusline.js\"" } }
```
Shows `token-saver ~12.4k saved`. Figures are estimates (about 4 chars per token). Blocked reads assume half the
content would have been re-read later as a targeted range, so the number errs low.

## What it does by default
| Situation | Behaviour |
|---|---|
| Read of a file over 2000 lines / 100 KB, no range | Denied with a hint to Grep or pass `offset`/`limit` |
| Read of binaries, minified or lock files | Denied |
| Grep/Glob inside `node_modules`, `.venv`, `dist`, `build` | Denied |
| `ls -R`, `find`, `cat` of a huge file | Output capped to 200 lines (read-only commands only) |
| `npm install` / `pip install` | Quiet flags added |
| Any very large tool result | Short nudge to narrow the next query |
| Session start | About 60 tokens of guidance |

**Unity profile (automatic)**
- Raw `.unity .prefab .asset .mat .anim .controller` over 300 lines: denied, pointing to the unity-cli skill, a targeted Grep, or a range. Binary-serialized assets are always denied.
- Searches skip `Library, Temp, Obj, Logs, Build, Builds, UserSettings, MemoryCaptures` and `*.meta`.
- Reads of `Library/` (except `PackageCache`), `Temp/`, `obj/` and the generated root `.csproj/.sln/.slnx` are denied.
- `.fbx .psd .wav .mp3 .unitypackage` etc. and images over 1 MB are denied.
- `cat Editor.log` becomes the last 100 error/warning lines.

Every denial names its rule and how to switch it off. A range read (`offset`/`limit`) is always allowed.

## Edge cases (all optional)
Create `token-saver.config.json` in the project root (or `~/.claude/token-saver.json` for all projects). Only keys you set change.
```json
{ "profile": "auto", "readMaxLines": 2000, "readMaxKB": 100, "unityYamlMaxLines": 300,
  "bashMaxLines": 200, "extraIgnore": ["Assets/Plugins/"], "disable": ["trimBash"], "stats": true }
```
- `profile`: `auto` | `unity` | `generic` | `off`
- `disable` rule names: `readBinary unityGenerated unityYaml readLarge searchIgnore trimBash outputNudge sessionGuideline`
- Quick off switch: environment variable `TOKEN_SAVER=off`

## Safety
- Fail-open: any script error allows the tool call.
- Bash rewrites never auto-approve a command; your normal permission flow still applies. Only simple commands (no pipes, chaining or redirects) are touched, and `find -exec/-delete` is never rewritten.
- Stats live in `~/.claude/token-saver/stats` (30-day retention). Nothing is sent anywhere.

## Development
`node tests/run-tests.js` runs the full suite in a temp folder.
