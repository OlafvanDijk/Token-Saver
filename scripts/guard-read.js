'use strict';
// PreToolUse(Read): stop oversized, binary, and generated files from flooding the context.
const fs = require('fs');
const path = require('path');
const L = require('./lib');

L.run((input, ctx) => {
  if (input.tool_name !== 'Read') return;
  const ti = input.tool_input || {};
  if (!ti.file_path) return;
  const abs = L.resolvePath(ti.file_path, ctx);
  const ext = path.extname(abs).toLowerCase();
  const ranged = ti.offset != null || ti.limit != null || ti.pages != null;
  let st;
  try { st = fs.statSync(abs); } catch (e) { return; }
  if (!st.isFile()) return;
  const cfg = ctx.cfg;
  const rel = path.relative(ctx.root, abs) || abs;
  const kb = Math.round(st.size / 1024);
  const credit = (rule, tokens) => L.record(ctx, rule, tokens * L.FOLLOWUP);

  if (ctx.rule('readBinary')) {
    if (L.BINARY.indexOf(ext) >= 0 || (ctx.unity && L.UNITY_BINARY.indexOf(ext) >= 0)) {
      return L.deny('readBinary', rel + ' is a binary file and cannot be usefully read as text. ' +
        'Use a tool that inspects it (or ask the user) instead.');
    }
    if (ctx.unity && L.IMAGES.indexOf(ext) >= 0 && st.size > cfg.unityImageMaxKB * 1024) {
      L.record(ctx, 'readBinary', 800);
      return L.deny('readBinary', rel + ' is a large image (' + kb + ' KB) and costs many tokens to view. ' +
        'Only view it if essential, ideally a downscaled copy.');
    }
  }

  if (ranged) return;

  if (ctx.unity && ctx.rule('unityGenerated')) {
    const segs = path.relative(ctx.root, abs).split(/[\\/]/);
    const top = (segs[0] || '').toLowerCase();
    const second = (segs[1] || '').toLowerCase();
    const libGenerated = top === 'library' && second.indexOf('packagecache') !== 0;
    const rootProject = segs.length === 1 && /\.(csproj|slnx?|sln)$/i.test(segs[0]);
    if (segs[0] !== '..' && (libGenerated || top === 'temp' || top === 'obj' || rootProject)) {
      credit('unityGenerated', L.readCostTokens(abs, st));
      return L.deny('unityGenerated', rel + ' is Unity-generated (rebuilt automatically) and rarely useful to read. ' +
        'Read the source under Assets/ or Packages/ instead, or pass offset/limit if you really need it.');
    }
  }

  let info = null;
  const getInfo = () => info || (info = L.peek(abs, st));

  if (ctx.unity && ctx.rule('unityYaml') && L.UNITY_YAML.indexOf(ext) >= 0) {
    const p = getInfo();
    if (p.binary) {
      return L.deny('unityYaml', rel + ' is a binary-serialized Unity asset. Inspect it through the Unity Editor ' +
        '(unity-cli skill / Unity MCP) instead.');
    }
    if (p.lines > cfg.unityYamlMaxLines) {
      credit('unityYaml', L.readCostTokens(abs, st));
      return L.deny('unityYaml', rel + ' is Unity serialized YAML (' +
        (p.lines === Infinity ? 'very large' : p.lines + ' lines') + ') and is expensive to read raw. ' +
        'Use the unity-cli skill / Unity MCP to inspect or edit it, Grep for a specific component, name or GUID, ' +
        'or read a range with offset/limit.');
    }
  }

  if (ctx.rule('readLarge')) {
    const base = path.basename(abs).toLowerCase();
    const lockOrMin = /\.min\.(js|css)$|^package-lock\.json$|^yarn\.lock$|^pnpm-lock\.yaml$/.test(base);
    if (lockOrMin && st.size > 20 * 1024) {
      credit('readLarge', L.readCostTokens(abs, st));
      return L.deny('readLarge', rel + ' is a minified or lock file (' + kb + ' KB). Grep it for what you need.');
    }
    if (st.size > cfg.readMaxKB * 1024) {
      credit('readLarge', L.readCostTokens(abs, st, cfg.readMaxLines));
      return L.deny('readLarge', rel + ' is large (' + kb + ' KB). Grep for the symbol first, ' +
        'then Read a targeted range with offset/limit.');
    }
    if (st.size > 16 * 1024) {
      const p = getInfo();
      if (p.lines > cfg.readMaxLines) {
        credit('readLarge', L.readCostTokens(abs, st, cfg.readMaxLines));
        return L.deny('readLarge', rel + ' has ' + p.lines + ' lines. Grep for the symbol first, ' +
          'then Read a targeted range with offset/limit.');
      }
    }
  }
});
