var test = require('tape');
var StateServer = require('../../src/StateServer.ts');

function ask(url) {
  var out = {body: null, nexted: false};
  var store = {getState: () => ({widgets: {foo: {}}})};
  StateServer(store)(
    {url: url},
    {end: (b) => (out.body = b)},
    () => (out.nexted = true)
  );
  return out;
}

test('serving state', (t) => {
  t.deepEqual(
    JSON.parse(ask('/state/').body),
    {widgets: {foo: {}}},
    'it serves the store'
  );
  // the app asks with its token in the query, which used to fall through to
  // the client page and hand the app html where it expected json
  t.deepEqual(
    JSON.parse(ask('/state/?token=abc').body),
    {widgets: {foo: {}}},
    'a query string does not stop it matching'
  );
  t.ok(ask('/widgets/foo').nexted, 'other paths fall through');
  t.end();
});
