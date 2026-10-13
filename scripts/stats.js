'use strict';
// Savings tracker: append-only JSONL per session in ~/.claude/token-saver/stats.
// All figures are ESTIMATES (about 4 characters per token), not billing data.
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = () => path.join(os.homedir(), '.claude', 'token-saver', 'stats');
const safe = (id) => String(id || 'unknown').replace(/[^\w-]/g, '_');
const fileFor = (id) => path.join(dir(), safe(id) + '.jsonl');

function record(ctx, rule, tokens) {
  try {
    if (!ctx.cfg.stats) return;
    tokens = Math.round(tokens);
    if (!(tokens > 0)) return;
    fs.mkdirSync(dir(), { recursive: true });
    fs.appendFileSync(fileFor(ctx.sessionId), JSON.stringify({ t: Date.now(), rule, tokens }) + '\n');
  } catch (e) { /* fail open */ }
}

function summarize(sessionId) {
  const out = { total: 0, byRule: {} };
  try {
    const lines = fs.readFileSync(fileFor(sessionId), 'utf8').split('\n');
    for (const l of lines) {
      if (!l) continue;
      try {
        const r = JSON.parse(l);
        out.total += r.tokens;
        out.byRule[r.rule] = (out.byRule[r.rule] || 0) + r.tokens;
      } catch (e) { /* skip bad line */ }
    }
  } catch (e) { /* no stats yet */ }
  return out;
}

function latestSession() {
  try {
    const files = fs.readdirSync(dir()).filter((f) => f.endsWith('.jsonl'))
      .map((f) => ({ f, m: fs.statSync(path.join(dir(), f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    return files.length ? files[0].f.replace(/\.jsonl$/, '') : null;
  } catch (e) { return null; }
}

function prune(days) {
  try {
    const cutoff = Date.now() - days * 86400000;
    for (const f of fs.readdirSync(dir())) {
      const p = path.join(dir(), f);
      if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p);
    }
  } catch (e) { /* nothing to prune */ }
}

function fmt(n) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}

module.exports = { record, summarize, latestSession, prune, fmt };
