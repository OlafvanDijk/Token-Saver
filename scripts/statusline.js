'use strict';
// Status line: a Claude mascot jumping with a "~12.4k saved" sign and a thumbs up.
const fs = require('fs');
const stats = require('./stats');

const ORANGE = '\x1b[38;2;215;119;87m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

try {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (e) { /* no stdin */ }
  const s = stats.summarize(input.session_id);
  const label = ' ~' + stats.fmt(s.total) + ' saved ';
  const sign = ['┌' + '─'.repeat(label.length) + '┐', '│' + label + '│', '└' + '─'.repeat(label.length) + '┘'];
  const mascot = [' ▐▛███▜▌ ', '▝▜█████▛▘', '  ▘▘ ▝▝  '];
  const thumb = ['', ' 👍', ''];
  const up = Math.floor(Date.now() / 1000) % 2 === 1;
  const lift = (rows) => (up ? [''].concat(rows) : rows.concat(['']));
  const m = lift(mascot);
  const g = lift(sign);
  const t = lift(thumb);
  const lines = m.map((row, i) => ORANGE + row.padEnd(11) + RESET + BOLD + g[i] + RESET + t[i]);
  process.stdout.write('token-saver\n' + lines.join('\n'));
} catch (e) {
  process.stdout.write('token-saver');
}
