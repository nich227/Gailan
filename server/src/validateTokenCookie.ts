'use strict';

const crypto = require('crypto');

// Finds the token cookie and compares it to the expected token in constant
// time. One pass over the cookie header, no map building, and a cookie
// without an = cannot throw like it did in the upstream patch.
module.exports = function validateTokenCookie(
  token: string,
  cookieStr: string
) {
  if (!cookieStr || !token) {
    return false;
  }

  for (const part of cookieStr.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== 'token') continue;

    let value: string;
    try {
      value = decodeURIComponent(part.slice(eq + 1).trim());
    } catch (e) {
      return false;
    }

    const expected = Buffer.from(token);
    const actual = Buffer.from(value);
    return (
      expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual)
    );
  }

  return false;
};
