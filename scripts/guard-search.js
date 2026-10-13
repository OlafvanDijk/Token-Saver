'use strict';
// PreToolUse(Grep|Glob): keep searches out of generated/dependency folders.
const L = require('./lib');

// ripgrep negated glob: skips Unity's generated folders and .meta files at any depth.
const UNITY_EXCLUDE = '!{' + ['Library', 'Temp', 'Obj', 'Logs', 'Build', 'Builds', 'UserSettings', 'MemoryCaptures']
  .map((d) => d + '/**').concat('*.meta').join(',') + '}';

L.run((input, ctx) => {
  if (!ctx.rule('searchIgnore')) return;
  const ti = input.tool_input || {};
  const name = input.tool_name;
  if (name !== 'Grep' && name !== 'Glob') return;

  // Explicit search inside an ignored folder.
  if (ti.path) {
    const dir = L.ignoredDir(L.resolvePath(ti.path, ctx), ctx);
    if (dir) {
      L.record(ctx, 'searchIgnore', 1500);
      return L.deny('searchIgnore', dir + '/ is generated or third-party output and floods results. ' +
        'Search source folders instead (e.g. Assets/ or Packages/), or add a narrower path.');
    }
  }
  if (name === 'Glob' && ti.pattern) {
    const first = String(ti.pattern).replace(/\\/g, '/').split('/')[0];
    const dir = L.ignoredDir(L.resolvePath(first, ctx), ctx);
    if (dir && !/[*?{]/.test(first)) {
      L.record(ctx, 'searchIgnore', 1500);
      return L.deny('searchIgnore', dir + '/ is generated or third-party output and floods results. ' +
        'Search source folders instead.');
    }
  }

  // Broad Unity grep with no glob: silently exclude generated folders and .meta files.
  if (name === 'Grep' && ctx.unity && !ti.glob && !ti.path) {
    L.record(ctx, 'searchIgnore', 500);
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: Object.assign({}, ti, { glob: UNITY_EXCLUDE }),
      },
    };
  }
});
