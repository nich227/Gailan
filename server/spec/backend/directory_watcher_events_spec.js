// fsevents only exists on darwin, so this drives the watcher's event handling
// with a fake one. That covers the parts the integration spec can only reach on
// a Mac: which paths a delete reports, and what happens when it repeats.
var test = require('tape');
var fs = require('fs');
var os = require('os');
var path = require('path');
var Module = require('module');

var watcherPath = require.resolve('../../src/directory_watcher.ts');

var handlers = [];
var fakeFsevents = {
  watch: function(watchedPath, handler) {
    handlers.push(handler);
    return function stop() {};
  },
  // the watcher passes our flags straight back in, so they can be the info
  getInfo: function(filePath, flags) {
    return flags;
  },
};

function withFakeFsevents(then) {
  var load = Module._load;
  Module._load = function(request) {
    if (request === 'fsevents') {
      return fakeFsevents;
    }
    return load.apply(this, arguments);
  };
  delete require.cache[watcherPath];

  var DirWatcher = require(watcherPath);

  function restore() {
    Module._load = load;
    delete require.cache[watcherPath];
  }

  then(DirWatcher, restore);
}

function fire(filePath, info) {
  handlers.forEach(function(handler) {
    handler(filePath, info, 0);
  });
}

// bar and barcode share their first characters on purpose
function fixture() {
  var root = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-watcher-'));
  fs.mkdirSync(path.join(root, 'bar'));
  fs.mkdirSync(path.join(root, 'barcode'));
  fs.writeFileSync(path.join(root, 'bar', 'widget.js'), "({command: ''})");
  fs.writeFileSync(path.join(root, 'barcode', 'widget.js'), "({command: ''})");
  return root;
}

function watchFixture(DirWatcher, then) {
  var root = fixture();
  var events = [];
  var stop = DirWatcher(root, function(event) {
    events.push(event);
  });

  // the initial walk is async
  setTimeout(function() {
    then(root, events, stop);
  }, 150);
}

test('reporting removals', (t) => {
  handlers = [];
  withFakeFsevents((DirWatcher, restore) => {
    watchFixture(DirWatcher, (root, events, stop) => {
      t.equal(
        events.filter((e) => e.type === 'added').length,
        2,
        'it finds the files already in the folder'
      );

      events.length = 0;
      fire(path.join(root, 'bar'), {event: 'deleted', type: 'directory'});

      var removed = events
        .filter((e) => e.type === 'removed')
        .map((e) => path.relative(root, e.filePath));

      t.deepEqual(
        removed,
        ['bar/widget.js'],
        'deleting a folder does not take its same-prefix sibling with it'
      );

      events.length = 0;
      fire(path.join(root, 'bar'), {event: 'deleted', type: 'directory'});
      t.deepEqual(
        events,
        [],
        'a repeated delete does not report the same file again'
      );

      stop();
      restore();
      fs.rmSync(root, {recursive: true, force: true});
      t.end();
    });
  });
});

test('reporting additions', (t) => {
  handlers = [];
  withFakeFsevents((DirWatcher, restore) => {
    watchFixture(DirWatcher, (root, events, stop) => {
      var added = path.join(root, 'barcode', 'another.js');
      fs.writeFileSync(added, "({command: ''})");

      events.length = 0;
      fire(added, {event: 'created', type: 'file'});

      setTimeout(() => {
        t.deepEqual(
          events.map((e) => e.filePath),
          [added],
          'it reports a created file'
        );

        stop();
        restore();
        fs.rmSync(root, {recursive: true, force: true});
        t.end();
      }, 50);
    });
  });
});
