#!/usr/bin/env node
//
//  new-code-coverage.js
//  Gailan
//
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//
'use strict';

// Coverage of the lines this branch changed, rather than of the whole codebase.
// It is the more useful gate: a repository sitting at 99% can still take an
// untested change without the total moving enough to notice.
//
// 80% is the usual target for new code, and the number SonarQube's default
// quality gate uses. Treat it as a floor, not a goal: it says these lines ran,
// not that anything was asserted about them.

const {execFileSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const THRESHOLD = Number(process.env.NEW_CODE_COVERAGE || 80);

// Same reason as the overall floor: only macOS runs the whole suite, so only
// macOS is held to a number. Elsewhere this reports and exits clean.
const ENFORCED = process.platform === 'darwin';
const root = path.join(__dirname, '..');
const lcovPath = path.join(root, 'coverage', 'lcov.info');

// what to compare against: the pull request's base, or the previous commit
const base = process.argv[2] || process.env.COVERAGE_BASE || 'HEAD~1';

function git(args) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8'});
}

// the lines each file gained or had rewritten, from the diff itself
function changedLines() {
  let diff;
  try {
    diff = git(['diff', '--unified=0', '--no-color', `${base}...HEAD`, '--', '.']);
  } catch (err) {
    console.log(`cannot diff against ${base}, so nothing to check`);
    return {};
  }

  const files = {};
  let current = null;

  diff.split('\n').forEach((line) => {
    const fileMatch = line.match(/^\+\+\+ b\/(.+)$/);
    if (fileMatch) {
      current = fileMatch[1];
      return;
    }

    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunk && current) {
      const start = Number(hunk[1]);
      const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
      files[current] = files[current] || new Set();
      for (let i = 0; i < count; i++) files[current].add(start + i);
    }
  });

  return files;
}

// line hit counts per file, straight out of lcov
function coverageByFile() {
  if (!fs.existsSync(lcovPath)) {
    console.error(`no coverage at ${lcovPath}; run npm run coverage first`);
    process.exit(1);
  }

  const records = {};
  let file = null;

  fs.readFileSync(lcovPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      if (line.startsWith('SF:')) {
        file = path.relative(root, line.slice(3).trim());
        records[file] = records[file] || {};
        return;
      }
      const hit = line.match(/^DA:(\d+),(\d+)/);
      if (hit && file) records[file][Number(hit[1])] = Number(hit[2]);
    });

  return records;
}

const changed = changedLines();
const coverage = coverageByFile();

let total = 0;
let covered = 0;
const misses = [];

Object.keys(changed).forEach((file) => {
  const lines = coverage[file];
  // a file with no coverage data is not instrumented: specs, scripts, configs
  if (!lines) return;

  [...changed[file]].sort((a, b) => a - b).forEach((line) => {
    if (lines[line] === undefined) return; // not an executable line
    total += 1;
    if (lines[line] > 0) covered += 1;
    else misses.push(`${file}:${line}`);
  });
});

if (total === 0) {
  console.log(`no instrumented lines changed against ${base}`);
  process.exit(0);
}

const percent = (covered / total) * 100;
console.log(
  `new code: ${covered}/${total} lines covered ` +
    `(${percent.toFixed(2)}%), floor ${THRESHOLD}%`
);

if (misses.length > 0) {
  console.log('\nchanged lines with no test behind them:');
  misses.slice(0, 40).forEach((miss) => console.log(`  ${miss}`));
  if (misses.length > 40) console.log(`  ...and ${misses.length - 40} more`);
}

if (percent + 1e-9 < THRESHOLD) {
  if (!ENFORCED) {
    console.log(
      `\nbelow ${THRESHOLD}%, but only macOS is held to it, so not failing here`
    );
    process.exit(0);
  }
  console.error(
    `\nnew code coverage ${percent.toFixed(2)}% is below ${THRESHOLD}%`
  );
  process.exit(1);
}
