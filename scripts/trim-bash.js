'use strict';
// PreToolUse(Bash): cap a few well-known unbounded, read-only commands. Simple commands only.
const fs = require('fs');
const L = require('./lib');

L.run((input, ctx) => {
  if (input.tool_name !== 'Bash' || !ctx.rule('trimBash')) return;
  const ti = input.tool_input || {};
  const cmd = typeof ti.command === 'string' ? ti.command.trim() : '';
  // Anything with pipes, chaining, redirects, substitution or newlines is left alone.
  if (!cmd || /[|;&<>`\n]|\$\(/.test(cmd)) return;
  const cfg = ctx.cfg;
  const head = ' | head -n ' + cfg.bashMaxLines;
  const out = (newCmd, rule, tokens) => {
    L.record(ctx, rule, tokens);
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: Object.assign({}, ti, { command: newCmd }),
      },
    };
  };
  // Bash output is truncated near 30k chars (~7.5k tokens), so never credit more than that.
  const cap = (t) => Math.min(t, 7500);

  // Recursive listings and find: cap line count. (find with actions is never piped.)
  if (/^ls\s+(.*\s)?-[a-zA-Z]*R[a-zA-Z]*(\s|$)/.test(cmd)) return out(cmd + head, 'trimBash', 1000);
  if (/^find\s/.test(cmd) && !/\s-(delete|exec|execdir|ok|okdir|fprint\w*|fls)\b/.test(cmd)) {
    return out(cmd + head, 'trimBash', 1000);
  }

  // cat of a single file.
  const m = cmd.match(/^cat\s+("[^"]+"|'[^']+'|\S+)$/);
  if (m) {
    let st;
    try { st = fs.statSync(L.resolvePath(m[1], ctx)); } catch (e) { return; }
    if (!st.isFile()) return;
    if (/(Editor|Player)(-prev)?\.log["']?$/i.test(m[1])) {
      // Unity logs: keep only problems from the end of the log.
      const filtered = 'grep -iE "error|exception|warning|failed" ' + m[1] + ' | tail -n ' + cfg.logTailLines;
      return out(filtered, 'trimBash', cap(L.tokensOf(st.size) - cfg.logTailLines * 25));
    }
    if (st.size > cfg.readMaxKB * 1024) {
      return out(cmd + head, 'trimBash', cap(L.tokensOf(st.size) - cfg.bashMaxLines * 25));
    }
    return;
  }

  // Quiet installs.
  if (/^npm\s+(i|install|ci)(\s|$)/.test(cmd) && !/--(silent|loglevel)|\s-s(\s|$)/.test(cmd)) {
    return out(cmd + ' --loglevel=error', 'trimBash', 300);
  }
  if (/^(pip3?|python3?\s+-m\s+pip)\s+install(\s|$)/.test(cmd) && !/\s(-q|--quiet)(\s|$)/.test(cmd)) {
    return out(cmd + ' -q', 'trimBash', 300);
  }
});
