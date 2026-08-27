const test = require('tape');
const resolveWidget = require('../../src/resolveWidget.js');

test('resolving tsx widgets', (t) => {
  const action = resolveWidget({
    type: 'added',
    filePath: '/widget/dir/typed.tsx',
    rootPath: '/widget/dir/',
  });
  t.equal(action.id, 'typed', 'a tsx file is a widget, named without the extension');
  t.end();
});

test('resolving widget actions from file events', (t) => {
  const action = resolveWidget({
    type: 'added',
    filePath: '/widget/dir/widget File name.js',
    rootPath: '/widget/dir/',
  });

  t.plan(3);
  t.equal(action.id, 'widget_File_name', 'the id is the path without the extension');
  t.equal(
    action.filePath, '/widget/dir/widget File name.js',
    'it contains the original file path'
  );

  const action2 = resolveWidget({
    type: 'removed',
    filePath: '/widget/dir/widget File name.js',
    rootPath: '/widget/dir/',
  });

  t.ok(
    action.type === 'added' && action2.type === 'removed',
    'it passes on the action type'
  );
});

test('separating widgets from non-wigets', (t) => {
  var action = resolveWidget({
    filePath: '/widget/dir/file.js',
    rootPath: '/widget/dir/',
  });
  t.ok(!!action, 'it accepts js files');

  action = resolveWidget({
    filePath: '/widget/dir/file.ts',
    rootPath: '/widget/dir/',
  });
  t.ok(!!action, 'it accepts ts files');

  action = resolveWidget({
    filePath: '/widget/dir/file.coffee',
    rootPath: '/widget/dir/',
  });
  t.ok(!action, 'it no longer accepts coffee files');

  action = resolveWidget({
    filePath: '/widget/dir/file.jsx',
    rootPath: '/widget/dir/',
  });
  t.ok(!!action, 'it accepts jsx files');

  action = resolveWidget({
    filePath: '/widget/dir/file.txt',
    rootPath: '/widget/dir/',
  });
  t.ok(!action, 'it ignores other files');

  action = resolveWidget({
    filePath: '/widget/dir/node_modules/file.js',
    rootPath: '/widget/dir/',
  });
  t.ok(!action, 'it ignores files inside node_modules');

  action = resolveWidget({
    filePath: '/widget/dir/src/file.js',
    rootPath: '/widget/dir/',
  });
  t.ok(!action, 'it ignores files inside a src dir');

  action = resolveWidget({
    filePath: '/widget/dir/lib/file.js',
    rootPath: '/widget/dir/',
  });
  t.ok(!action, 'it ignores files inside a lib dir');

  action = resolveWidget({
    filePath: '/widget/dir/some/other/dir/file.js',
    rootPath: '/widget/dir/',
  });
  t.ok(!!action, 'it detects widgets in any other dir');

  t.end();
});

test('deriving widget ids', (t) => {
  var action = resolveWidget({
    type: 'added',
    filePath: '/widget/dir/spaces in    the  Name.js',
    rootPath: '/widget/dir/',
  });
  t.equal(
    action.id, 'spaces_in____the__Name-js', 'it replaces spaces with underscores'
  );

  action = resolveWidget({
    type: 'added',
    filePath: '/widget/dir/some-dir/widget.js',
    rootPath: '/widget/dir/',
  });
  t.equal(
    action.id, 'some-dir-widget-js', 'it replaces slashes with dashes'
  );

  t.end();
});
