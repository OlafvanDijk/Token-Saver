'use strict';
// Used by /token-tips: prints active profile, rules, thresholds and session savings.
const L = require('./lib');
const stats = require('./stats');

const RULES = ['readBinary', 'unityGenerated', 'unityYaml', 'readLarge', 'searchIgnore', 'trimBash',
  'outputNudge', 'sessionGuideline'];

const ctx = L.buildCtx({ cwd: process.cwd(), session_id: process.argv[2] });
const sid = process.argv[2] || stats.latestSession();
const s = stats.summarize(sid);
const c = ctx.cfg;

console.log('token-saver status');
console.log('  Profile : ' + ctx.profile + (process.env.TOKEN_SAVER === 'off' ? ' (TOKEN_SAVER=off)' : ''));
console.log('  Project : ' + ctx.root);
console.log('  Rules   : ' + RULES.map((r) => (ctx.rule(r) ? '+' : '-') + r).join('  '));
console.log('  Limits  : read ' + c.readMaxLines + ' lines / ' + c.readMaxKB + ' KB' +
  (ctx.unity ? ', Unity YAML ' + c.unityYamlMaxLines + ' lines' : '') + ', bash ' + c.bashMaxLines + ' lines');
if (c.extraIgnore.length) console.log('  Extra ignore: ' + c.extraIgnore.join(', '));
console.log('');
console.log('Estimated tokens saved this session: ~' + stats.fmt(s.total) +
  (c.stats ? '' : ' (stats disabled)'));
Object.keys(s.byRule).sort((a, b) => s.byRule[b] - s.byRule[a])
  .forEach((r) => console.log('  ' + r.padEnd(16) + '~' + stats.fmt(s.byRule[r])));
console.log('(Estimates at ~4 chars/token; denied reads assume half is re-read as a range.)');
