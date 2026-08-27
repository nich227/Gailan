var test = require('tape');
var path = require('path');
var fs = require('fs');
var execSync = require('child_process').execSync;

var DirWatcher = require('../../src/directory_watcher.ts');
var fixturePath = path.resolve(__dirname, '../test_widgets');
var newWidgetPath = path.join(fixturePath, 'new-widget.coffee');

var stopWatching;
var callback;

const throwError = (err) => {
  if (err) throw err;
};

test('files that are already present in the widget dir', (t) => {
  t.timeoutAfter(300);
  var expectedWidgets = [
    path.join(fixturePath, 'widget-1.js'),
    path.join(fixturePath, 'widget-2.js'),
    path.join(fixturePath, 'some-dir.widget', 'index-1.js'),
    path.join(fixturePath, 'broken-widget.js'),
    path.join(fixturePath, 'invalid-widget.js'),
  ];

  callback = (event) => {
    if (event.type !== 'added') {
      return;
    }
    var idx = expectedWidgets.indexOf(event.filePath);
    if (idx > -1) {
      expectedWidgets.splice(idx, 1);
    }

    if (expectedWidgets.length === 0) {
      callback = () => {};
      t.pass('it emits an event for all widgets already in the folder');
      t.end();
    }
  };

  stopWatching = DirWatcher(fixturePath, (event) => callback(event));
});

test('adding files', (t) => {
  t.timeoutAfter(300);
  callback = (event) => {
    if (event.type === 'added' && event.filePath === newWidgetPath) {
      callback = () => {};
      t.pass('it emits an event for new files');
      t.equal(event.rootPath, fixturePath, 'the event includes the root path');
      t.end();
    }
  };
  fs.writeFile(newWidgetPath, "command: ''", throwError);
});

test('removing files', (t) => {
  t.timeoutAfter(300);
  callback = (event) => {
    if (event.type === 'removed' && event.filePath === newWidgetPath) {
      callback = () => {};
      t.pass('it emits a removed event when a widget file is removed');
      t.equal(event.rootPath, fixturePath, 'the event includes the root path');
      t.end();
    }
  };
  fs.unlink(newWidgetPath, throwError);
});

test('adding folders', (t) => {
  t.timeoutAfter(300);
  var aWidgetFolder = path.resolve(__dirname, '../tmp2');
  if (fs.existsSync(aWidgetFolder)) {
    execSync('rm -rf ' + aWidgetFolder);
  }

  fs.mkdirSync(aWidgetFolder);
  fs.writeFileSync(path.join(aWidgetFolder, 'widget.js'), "command: 'yay'");

  var expectedPath = path.join(fixturePath, 'another', 'widget.js');
  callback = (event) => {
    if (event.type === 'added' && event.filePath === expectedPath) {
      callback = () => {};
      t.pass('it emits an event when a subfolder containing a widget is added');
      t.end();
    }
  };
  fs.rename(aWidgetFolder, path.join(fixturePath, 'another'), throwError);
});

test('removing folders', (t) => {
  t.timeoutAfter(300);
  var expectedPath = path.join(fixturePath, 'another', 'widget.js');
  callback = (event) => {
    if (event.type === 'removed' && event.filePath === expectedPath) {
      callback = () => {};
      t.pass(
        'it emits a removed event when a subfolder containing a ' +
          'widget is removed',
      );
      t.end();
    }
  };

  var newPath = path.resolve(__dirname, '../tmp3');
  fs.renameSync(path.join(fixturePath, 'another'), newPath);
  execSync('rm -rf ' + newPath);
});

// needs real fsevents, so this one only reports on macOS
test('removing a folder next to one with the same first characters', (t) => {
  t.timeoutAfter(2000);
  var barPath = path.join(fixturePath, 'bar');
  var barcodePath = path.join(fixturePath, 'barcode');
  var barWidget = path.join(barPath, 'widget.js');
  var barcodeWidget = path.join(barcodePath, 'widget.js');

  [barPath, barcodePath].forEach((dir) => {
    var staged = path.resolve(__dirname, '../' + path.basename(dir) + '-staged');
    execSync('rm -rf ' + staged + ' ' + dir);
    fs.mkdirSync(staged);
    fs.writeFileSync(path.join(staged, 'widget.js'), "command: 'yay'");
    fs.renameSync(staged, dir);
  });

  var seen = [];
  callback = (event) => {
    if (event.type === 'added') {
      seen.push(event.filePath);
      if (seen.indexOf(barWidget) > -1 && seen.indexOf(barcodeWidget) > -1) {
        seen = [];
        callback = collectRemovals;
        execSync('rm -rf ' + barPath);
      }
    }
  };

  var collectRemovals = (event) => {
    if (event.type === 'removed') {
      seen.push(event.filePath);
    }

    if (seen.indexOf(barWidget) > -1) {
      // give the sibling a chance to be wrongly reported
      setTimeout(() => {
        callback = () => {};
        t.equal(
          seen.indexOf(barcodeWidget),
          -1,
          'it leaves the sibling folder alone'
        );
        execSync('rm -rf ' + barcodePath);
        t.end();
      }, 200);
    }
  };
});

test('stopping', (t) => {
  stopWatching();
  // in case a test above timed out before it could tidy up
  execSync('rm -rf ' + path.join(fixturePath, 'bar'));
  execSync('rm -rf ' + path.join(fixturePath, 'barcode'));
  execSync('rm -rf ' + path.join(fixturePath, 'another'));
  t.pass('it can be stopped');
  t.end();
});
