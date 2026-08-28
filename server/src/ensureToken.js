'use strict';

const crypto = require('crypto');
const validateTokenCookie = require('./validateTokenCookie');

function tokenFromQuery(reqUrl) {
  const url = new URL(reqUrl, 'http://localhost');
  return url.searchParams.get('token');
}

function equals(token, value) {
  if (!value) return false;
  const expected = Buffer.from(token);
  const actual = Buffer.from(value);
  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
}

// Every request needs the token. The webview's first page load carries it as
// a query parameter, which sets the cookie everything after that rides on.
module.exports = function ensureToken(token, disabled) {
  return (req, res, next) => {
    if (disabled) {
      return next();
    }

    if (validateTokenCookie(token, req.headers.cookie)) {
      return next();
    }

    if (equals(token, tokenFromQuery(req.url))) {
      // HttpOnly: nothing in the page ever needs to read it, the browser
      // just has to send it back
      res.setHeader(
        'Set-Cookie',
        `token=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/`
      );
      return next();
    }

    res.writeHead(403);
    res.end();
  };
};
