'use strict';

const fs = require('fs');
const path = require('path');

module.exports = (publicDir) => {
  const indexHTML = fs.readFileSync(path.join(publicDir, 'index.html'));
  return function serveClient(req, res, next) {
    res.end(indexHTML);
  };
};