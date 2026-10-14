'use strict';
// SessionStart: a very short working guideline (the only text this plugin injects up front).
const L = require('./lib');
const stats = require('./stats');

L.run((input, ctx) => {
  stats.prune(30);
  if (!ctx.rule('sessionGuideline')) return;
  const sub = input && input.hook_event_name === 'SubagentStart';
  let text = '[token-saver] Save tokens: Grep or read ranges before whole files, do not re-read unchanged files, ' +
    (sub ? 'keep replies terse, return only the findings asked for.'
      : 'keep replies terse, delegate broad searches to a subagent.');
  if (ctx.unity) {
    text += ' Unity project: never read .unity/.prefab/.asset YAML raw or search Library/ and .meta files; ' +
      'inspect and edit scenes and assets through the unity-cli skill.';
  }
  return { hookSpecificOutput: { hookEventName: sub ? 'SubagentStart' : 'SessionStart', additionalContext: text } };
});
