var test = require('tape');
var isInsidePath = require('../../src/isInsidePath');

test('paths inside a directory', (t) => {
  t.ok(isInsidePath('/w/bar/widget.js', '/w/bar'), 'a file in the directory');
  t.ok(isInsidePath('/w/bar/deep/widget.js', '/w/bar'), 'a file further down');
  t.ok(isInsidePath('/w/bar', '/w/bar'), 'the directory itself');
  t.ok(isInsidePath('/w/bar/widget.js', '/w/bar/'), 'a trailing slash');
  t.end();
});

test('paths outside a directory', (t) => {
  t.notOk(
    isInsidePath('/w/barcode/widget.js', '/w/bar'),
    'a sibling directory sharing the first characters'
  );
  t.notOk(
    isInsidePath('/w/bar.jsx', '/w/bar'),
    'a sibling file sharing the first characters'
  );
  t.notOk(
    isInsidePath('/w/widget.js.old', '/w/widget.js'),
    'a file whose name extends the deleted one'
  );
  t.notOk(isInsidePath('/w/other/widget.js', '/w/bar'), 'an unrelated path');
  t.notOk(isInsidePath('/w/bar', '/w/bar/widget.js'), 'the other way around');
  t.end();
});
