'use strict';
// Status line: prints "token-saver ~12.4k saved" for the current session.
const fs = require('fs');
const stats = require('./stats');

try {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (e) { /* no stdin */ }
  const s = stats.summarize(input.session_id);
  process.stdout.write('token-saver ~' + stats.fmt(s.total) + ' saved');
} catch (e) {
  process.stdout.write('token-saver');
}
