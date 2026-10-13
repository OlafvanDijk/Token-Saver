'use strict';
// Shared helpers: defaults, profile detection, config merge, fail-open runner.
const fs = require('fs');
const os = require('os');
const path = require('path');
const stats = require('./stats');

const DEFAULTS = {
  profile: 'auto',          // auto | unity | generic | off
  readMaxLines: 2000,
  readMaxKB: 100,
  unityYamlMaxLines: 300,
  unityImageMaxKB: 1024,
  bashMaxLines: 200,
  logTailLines: 100,
  outputNudgeChars: 20000,
  stats: true,
  extraIgnore: [],
  disable: [],
};

const UNITY_DIRS = ['library', 'temp', 'obj', 'logs', 'build', 'builds', 'usersettings', 'memorycaptures'];
const GENERIC_ANY = ['node_modules', '.venv', '__pycache__'];
const GENERIC_TOP = ['dist', 'build'];
const UNITY_YAML = ['.unity', '.prefab', '.asset', '.mat', '.anim', '.controller', '.overridecontroller',
  '.physicmaterial', '.playable', '.mixer'];
const BINARY = ['.zip', '.7z', '.rar', '.gz', '.tar', '.dll', '.exe', '.pdb', '.so', '.dylib', '.class',
  '.jar', '.bin', '.pyc', '.sqlite', '.db'];
const UNITY_BINARY = ['.fbx', '.psd', '.wav', '.mp3', '.ogg', '.mp4', '.mov', '.unitypackage', '.blend'];
const IMAGES = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

// Fraction of an avoided read assumed to be re-read later as a targeted range.
const FOLLOWUP = 0.5;
const tokensOf = (chars) => chars / 4;

function detectUnityRoot(cwd) {
  let dir = cwd;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, 'ProjectSettings', 'ProjectVersion.txt'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return {}; }
}

function loadConfig(root) {
  const layers = [
    readJson(path.join(os.homedir(), '.claude', 'token-saver.json')),
    readJson(path.join(root, 'token-saver.config.json')),
  ];
  const cfg = Object.assign({}, DEFAULTS);
  for (const l of layers) {
    for (const k of Object.keys(l)) {
      if (Array.isArray(DEFAULTS[k])) cfg[k] = cfg[k].concat(l[k]);
      else if (k in DEFAULTS) cfg[k] = l[k];
    }
  }
  return cfg;
}

function buildCtx(input) {
  const cwd = (input && input.cwd) || process.cwd();
  const unityRoot = detectUnityRoot(cwd);
  const root = unityRoot || cwd;
  const cfg = loadConfig(root);
  let profile = cfg.profile;
  if (profile === 'auto') profile = unityRoot ? 'unity' : 'generic';
  const off = process.env.TOKEN_SAVER === 'off' || profile === 'off';
  return {
    cwd, root, cfg, profile, off,
    unity: profile === 'unity',
    sessionId: (input && input.session_id) || 'unknown',
    rule: (name) => !off && cfg.disable.indexOf(name) < 0,
  };
}

function resolvePath(p, ctx) {
  let s = String(p).replace(/^["']|["']$/g, '');
  if (process.platform === 'win32' && /^\/[a-zA-Z]\//.test(s)) s = s[1].toUpperCase() + ':' + s.slice(2);
  return path.resolve(ctx.cwd, s);
}

// Returns the ignored directory name that contains abs, or null.
function ignoredDir(abs, ctx) {
  const rel = path.relative(ctx.root, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const orig = rel.split(/[\\/]/);
  const segs = orig.map((s) => s.toLowerCase());
  const joined = segs.join('/');
  for (const x of ctx.cfg.extraIgnore) {
    const e = String(x).toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');
    if (e && (joined === e || joined.startsWith(e + '/'))) return String(x);
  }
  if (ctx.unity && UNITY_DIRS.indexOf(segs[0]) >= 0) return orig[0];
  for (let i = 0; i < segs.length; i++) if (GENERIC_ANY.indexOf(segs[i]) >= 0) return orig[i];
  if (!ctx.unity && GENERIC_TOP.indexOf(segs[0]) >= 0) return orig[0];
  return null;
}

// Look at a file: line count (Infinity if too big to count) and whether it is binary.
function peek(abs, st) {
  const fd = fs.openSync(abs, 'r');
  try {
    const head = Buffer.alloc(Math.min(512, st.size));
    fs.readSync(fd, head, 0, head.length, 0);
    const binary = head.indexOf(0) >= 0;
    if (binary || st.size > 20 * 1024 * 1024) return { binary, lines: Infinity };
  } finally { fs.closeSync(fd); }
  const buf = fs.readFileSync(abs);
  let lines = 1;
  for (let i = 0; i < buf.length; i++) if (buf[i] === 10) lines++;
  return { binary: false, lines };
}

// Estimated tokens a plain Read of this file would have returned (first 2000 lines, max 200 KB).
function readCostTokens(abs, st, maxLines) {
  try {
    const fd = fs.openSync(abs, 'r');
    try {
      const buf = Buffer.alloc(Math.min(st.size, 200 * 1024));
      fs.readSync(fd, buf, 0, buf.length, 0);
      const text = buf.toString('utf8').split('\n').slice(0, maxLines || 2000).join('\n');
      return tokensOf(text.length);
    } finally { fs.closeSync(fd); }
  } catch (e) { return 0; }
}

function deny(rule, msg) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: '[token-saver:' + rule + '] ' + msg +
        ' (To turn off this rule: "disable":["' + rule + '"] in token-saver.config.json)',
    },
  };
}

function run(fn) {
  try {
    let raw = '';
    try { raw = fs.readFileSync(0, 'utf8'); } catch (e) { /* no stdin */ }
    const input = raw.trim() ? JSON.parse(raw) : {};
    const ctx = buildCtx(input);
    if (ctx.off) return;
    const out = fn(input, ctx);
    if (out) process.stdout.write(JSON.stringify(out));
  } catch (e) { /* fail open: never break a session */ }
}

module.exports = {
  DEFAULTS, UNITY_YAML, BINARY, UNITY_BINARY, IMAGES, UNITY_DIRS, FOLLOWUP,
  tokensOf, buildCtx, resolvePath, ignoredDir, peek, readCostTokens, deny, run,
  record: stats.record,
};
