'use strict';
// PostToolUse(Bash|Grep|Glob): when a result was huge, tell Claude how to narrow the next one.
const L = require('./lib');

L.run((input, ctx) => {
  if (!ctx.rule('outputNudge')) return;
  const r = input.tool_response;
  if (r == null) return;
  const size = (typeof r === 'string' ? r : JSON.stringify(r)).length;
  if (size < ctx.cfg.outputNudgeChars) return;
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: '[token-saver] That output was large (~' + Math.round(L.tokensOf(size) / 1000) +
        'k tokens). Next time narrow it: Grep with a pattern/glob, head/tail, or a Read range.',
    },
  };
});
