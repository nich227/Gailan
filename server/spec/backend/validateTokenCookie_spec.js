var test = require('tape');
var validate = require('../../src/validateTokenCookie');

test('validating the token cookie', (t) => {
  t.ok(validate('sekrit', 'token=sekrit'), 'accepts the right token');
  t.ok(validate('sekrit', 'foo=1; token=sekrit; bar=2'), 'finds it among other cookies');
  t.ok(validate('s k', 'token=s%20k'), 'decodes the value');
  t.notOk(validate('sekrit', 'token=wrong'), 'rejects the wrong token');
  t.notOk(validate('sekrit', ''), 'rejects no cookie header');
  t.notOk(validate('sekrit', 'other=1'), 'rejects when the cookie is absent');
  t.notOk(validate('', 'token='), 'rejects an empty expected token');
  t.notOk(validate('sekrit', 'garbage'), 'a cookie without = does not throw (upstream did)');
  t.notOk(validate('sekrit', 'token=%E0%A4%A'), 'bad percent-encoding does not throw');
  t.end();
});
