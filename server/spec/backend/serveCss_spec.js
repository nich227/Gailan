var test = require('tape');
var fs = require('fs');
var os = require('os');
var path = require('path');
var connect = require('connect');
var http = require('http');
var serveCss = require('../../src/serveCss');

function get(port, done) {
  http
    .get({port: port, path: '/userMain.css', agent: false}, (res) => {
      var body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => done(res.statusCode, body));
    })
    .on('error', (err) => done(0, String(err)));
}

test('serving user css', (t) => {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-css-'));
  fs.writeFileSync(path.join(dir, 'main.css'), 'body { color: red; }');
  var server = connect().use(serveCss(dir)).listen(0, () => {
    get(server.address().port, (status, body) => {
      t.equal(body, 'body { color: red; }', 'it serves main.css');
      server.close(() => t.end());
    });
  });
});

test('no main.css', (t) => {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-css-'));
  var server = connect().use(serveCss(dir)).listen(0, () => {
    get(server.address().port, (status, body) => {
      t.equal(body, '', 'it serves an empty stylesheet');
      server.close(() => t.end());
    });
  });
});

// a directory named main.css used to throw from the stream error listener,
// which is an uncaught exception, which took the whole server down
test('an unreadable main.css', (t) => {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-css-'));
  fs.mkdirSync(path.join(dir, 'main.css'));
  var server = connect().use(serveCss(dir)).listen(0, () => {
    get(server.address().port, (status, body) => {
      t.equal(body, '', 'it serves an empty stylesheet instead of crashing');
      server.close(() => t.end());
    });
  });
});
