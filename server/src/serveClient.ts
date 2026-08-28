'use strict';

const fs = require('fs');
const path = require('path');

import type {IncomingMessage, ServerResponse} from 'node:http';

module.exports = (publicDir: string) => {
  const indexHTML = fs.readFileSync(path.join(publicDir, 'index.html'));
  return function serveClient(req: IncomingMessage, res: ServerResponse) {
    res.end(indexHTML);
  };
};