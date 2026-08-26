var test = require('tape');
var fs = require('fs');
var os = require('os');
var path = require('path');
var Settings = require('../../src/Settings');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-settings-'));
}

test('persisting settings', (t) => {
  var dir = tmpDir();
  var settings = Settings(dir);
  var file = path.join(dir, 'WidgetSettings.json');

  var first = {foo: {hidden: false}};
  var last = {foo: {hidden: true}};

  // the store fires on every action, so the same state shows up repeatedly
  for (var i = 0; i < 20; i++) settings.persist(first);
  settings.persist(last);
  for (var j = 0; j < 10; j++) settings.persist(last);

  setTimeout(() => {
    var written = fs.readFileSync(file, 'utf8');
    t.deepEqual(
      JSON.parse(written),
      last,
      'it ends up with the newest settings, in one piece'
    );
    t.end();
  }, 200);
});

test('loading settings', (t) => {
  var dir = tmpDir();
  var settings = Settings(dir);
  var stored = {bar: {hidden: true, screens: [1, 2]}};

  settings.persist(stored);

  setTimeout(() => {
    t.deepEqual(settings.load(), stored, 'it reads back what was persisted');
    t.end();
  }, 200);
});
