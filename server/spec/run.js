// Runs tape and formats the output with tap-arc.
//
// `tape ... | tap-arc` in an npm script hides the exit status of tape: if tape
// dies before printing anything, tap-arc happily reports "total: 0" and exits
// 0, so a suite that cannot even load looks green. sh has no pipefail, hence
// this.
const fs = require('fs');
const path = require('path');
const {spawn} = require('child_process');

function binOf(name) {
  const manifestPath = require.resolve(name + '/package.json');
  const {bin} = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const rel = typeof bin === 'string' ? bin : bin[name] || Object.values(bin)[0];
  return path.join(path.dirname(manifestPath), rel);
}

const tape = spawn(process.execPath, [binOf('tape'), ...process.argv.slice(2)], {
  stdio: ['ignore', 'pipe', 'inherit'],
});
const format = spawn(process.execPath, [binOf('tap-arc')], {
  stdio: ['pipe', 'inherit', 'inherit'],
});

tape.stdout.pipe(format.stdin);

const status = {};
const finish = (who) => (code) => {
  status[who] = code === null ? 1 : code;
  if ('tape' in status && 'format' in status) {
    process.exit(status.tape || status.format);
  }
};

tape.on('close', finish('tape'));
format.on('close', finish('format'));
