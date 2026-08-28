var test = require('tape');
var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');
var connect = require('connect');
var serveClient = require('../../src/serveClient');

test('serving the client page', (t) => {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gailan-client-'));
  var html = '<!doctype html><html><body><div id="gailan"></div></body></html>';
  fs.writeFileSync(path.join(dir, 'index.html'), html);

  var server = connect().use(serveClient(dir)).listen(0, () => {
    http.get({port: server.address().port, path: '/0/foreground', agent: false}, (res) => {
      var body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        t.equal(res.statusCode, 200, 'it responds');
        t.equal(body, html, 'it serves index.html byte for byte');
        server.close(() => t.end());
      });
    });
  });
});
