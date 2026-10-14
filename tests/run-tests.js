'use strict';
// Run with: node tests/run-tests.js   (uses temp dirs and a temp home; touches nothing else)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tsaver-'));
const home = path.join(tmp, 'home');
fs.mkdirSync(home);
const S = path.join(__dirname, '..', 'scripts');
const mk = (p, content) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); };

const unity = path.join(tmp, 'UnityProj');
mk(path.join(unity, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 6000.0.0\n');
mk(path.join(unity, 'Assets', 'Main.unity'), '%YAML 1.1\n' + 'a: 1\n'.repeat(1000));
mk(path.join(unity, 'Assets', 'Small.prefab'), '%YAML 1.1\nb: 2\n');
mk(path.join(unity, 'Assets', 'Player.cs'), 'class A {}\n');
mk(path.join(unity, 'Assets', 'Bin.asset'), Buffer.from([37, 0, 1, 2, 0, 0]));
mk(path.join(unity, 'Library', 'x.bin2'), 'data\n');
mk(path.join(unity, 'Fooble.csproj'), '<Project/>\n'.repeat(50));
const plain = path.join(tmp, 'Plain');
mk(path.join(plain, 'big.txt'), 'line of text here\n'.repeat(3000));
mk(path.join(plain, 'small.txt'), 'hi\n');
mk(path.join(plain, 'node_modules', 'a.js'), 'x');
const bigLog = path.join(plain, 'Editor.log');
mk(bigLog, 'info line\n'.repeat(20000) + 'ERROR boom\n');

function call(script, input, extraEnv) {
  const r = spawnSync('node', [path.join(S, script)], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env: Object.assign({}, process.env, { HOME: home, USERPROFILE: home }, extraEnv || {}),
    encoding: 'utf8',
  });
  let out = null;
  try { out = r.stdout ? JSON.parse(r.stdout) : null; } catch (e) { out = 'BADJSON:' + r.stdout; }
  return { out, status: r.status };
}
const hso = (r) => (r.out && r.out.hookSpecificOutput) || {};
let fails = 0;
function check(name, cond) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name);
  if (!cond) fails++;
}
const read = (cwd, file, extra) => call('guard-read.js',
  { session_id: 's1', cwd, tool_name: 'Read', tool_input: Object.assign({ file_path: file }, extra) });

// Read guard
check('unity: big scene denied', hso(read(unity, path.join(unity, 'Assets', 'Main.unity'))).permissionDecision === 'deny');
check('unity: big scene with range allowed', read(unity, path.join(unity, 'Assets', 'Main.unity'), { offset: 1, limit: 50 }).out === null);
check('unity: small prefab allowed', read(unity, path.join(unity, 'Assets', 'Small.prefab')).out === null);
check('unity: .cs allowed', read(unity, path.join(unity, 'Assets', 'Player.cs')).out === null);
check('unity: binary asset denied', hso(read(unity, path.join(unity, 'Assets', 'Bin.asset'))).permissionDecision === 'deny');
check('unity: Library file denied', hso(read(unity, path.join(unity, 'Library', 'x.bin2'))).permissionDecision === 'deny');
check('unity: root csproj denied', hso(read(unity, path.join(unity, 'Fooble.csproj'))).permissionDecision === 'deny');
check('generic: big file denied', hso(read(plain, path.join(plain, 'big.txt'))).permissionDecision === 'deny');
check('generic: big file ranged allowed', read(plain, path.join(plain, 'big.txt'), { limit: 10 }).out === null);
check('generic: small file allowed', read(plain, path.join(plain, 'small.txt')).out === null);
check('generic: .meta-free unity rules not applied', read(plain, path.join(plain, 'small.txt')).out === null);
check('missing file allowed (fail open)', read(plain, path.join(plain, 'nope.txt')).out === null);
check('malformed stdin -> allow', call('guard-read.js', 'not json{').out === null);
check('TOKEN_SAVER=off -> allow',
  call('guard-read.js', { cwd: plain, tool_name: 'Read', tool_input: { file_path: path.join(plain, 'big.txt') } },
    { TOKEN_SAVER: 'off' }).out === null);
fs.writeFileSync(path.join(plain, 'token-saver.config.json'), JSON.stringify({ readMaxKB: 10000, readMaxLines: 100000 }));
check('config override changes only named keys', read(plain, path.join(plain, 'big.txt')).out === null);
fs.writeFileSync(path.join(plain, 'token-saver.config.json'), JSON.stringify({ disable: ['readLarge'] }));
check('disable rule works', read(plain, path.join(plain, 'big.txt')).out === null);
fs.unlinkSync(path.join(plain, 'token-saver.config.json'));

// Search guard
const search = (cwd, tool, ti) => call('guard-search.js', { session_id: 's1', cwd, tool_name: tool, tool_input: ti });
check('grep into Library denied', hso(search(unity, 'Grep', { pattern: 'x', path: path.join(unity, 'Library') })).permissionDecision === 'deny');
check('grep into node_modules denied', hso(search(plain, 'Grep', { pattern: 'x', path: path.join(plain, 'node_modules') })).permissionDecision === 'deny');
const g = hso(search(unity, 'Grep', { pattern: 'x' }));
check('unity broad grep gets exclude glob', g.updatedInput && /Library\/\*\*/.test(g.updatedInput.glob) && g.updatedInput.pattern === 'x');
check('unity grep with own glob untouched', search(unity, 'Grep', { pattern: 'x', glob: '*.cs' }).out === null);
check('glob Library/** denied', hso(search(unity, 'Glob', { pattern: 'Library/PackageCache/x.cs' })).permissionDecision === 'deny');
check('glob Assets/**/*.cs allowed', search(unity, 'Glob', { pattern: 'Assets/**/*.cs' }).out === null);

// Bash trim
const bash = (cwd, command) => call('trim-bash.js', { session_id: 's1', cwd, tool_name: 'Bash', tool_input: { command } });
check('ls -R capped', /head -n 200$/.test((hso(bash(plain, 'ls -R')).updatedInput || {}).command || ''));
check('find capped', /head -n 200$/.test((hso(bash(plain, 'find . -name "*.cs"')).updatedInput || {}).command || ''));
check('find -delete untouched', bash(plain, 'find . -name "*.tmp" -delete').out === null);
check('piped command untouched', bash(plain, 'ls -R | wc -l').out === null);
check('cat big log filtered',
  /grep -iE .* \| tail -n 100$/.test((hso(bash(plain, 'cat "' + bigLog + '"')).updatedInput || {}).command || ''));
check('npm install quiet', /--loglevel=error$/.test((hso(bash(plain, 'npm install lodash')).updatedInput || {}).command || ''));
check('plain command untouched', bash(plain, 'echo hello').out === null);
check('trim never auto-approves', hso(bash(plain, 'ls -R')).permissionDecision === undefined);

// Nudge, session start, stats
const big = 'x'.repeat(30000);
check('big output nudged', /token-saver/.test(hso(call('nudge-output.js',
  { cwd: plain, tool_name: 'Bash', tool_response: { stdout: big } })).additionalContext || ''));
check('small output not nudged', call('nudge-output.js', { cwd: plain, tool_name: 'Bash', tool_response: { stdout: 'ok' } }).out === null);
check('unity session text mentions unity-cli', /unity-cli/.test(hso(call('session-start.js', { cwd: unity, session_id: 's1' })).additionalContext || ''));
check('subagent start injects guideline', hso(call('session-start.js', { cwd: plain, session_id: 's1', hook_event_name: 'SubagentStart' })).hookEventName === 'SubagentStart');
check('generic session text has no unity', !/Unity/.test(hso(call('session-start.js', { cwd: plain, session_id: 's1' })).additionalContext || ''));
const sl = spawnSync('node', [path.join(S, 'statusline.js')], {
  input: JSON.stringify({ session_id: 's1' }), encoding: 'utf8',
  env: Object.assign({}, process.env, { HOME: home, USERPROFILE: home }),
});
check('statusline shows nonzero savings', /token-saver ~[1-9]/.test(sl.stdout));
const rep = spawnSync('node', [path.join(S, 'report.js'), 's1'], {
  cwd: unity, encoding: 'utf8', env: Object.assign({}, process.env, { HOME: home, USERPROFILE: home }),
});
check('report shows unity profile and savings', /Profile : unity/.test(rep.stdout) && /unityYaml/.test(rep.stdout));

console.log(sl.stdout);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fails ? fails + ' FAILED' : 'ALL PASSED');
process.exit(fails ? 1 : 0);
