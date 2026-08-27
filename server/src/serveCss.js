const fs = require('fs');
const path = require('path');
const urls = require('url');

module.exports = (widgetsDir) => (req, res, next) => {
  const url = urls.parse(req.url);
  if (url.pathname !== '/userMain.css') return next();

  fs.ReadStream(path.join(widgetsDir, 'main.css'))
    .on('error', (err) => {
      // no main.css is the normal case. Anything else (permissions, a
      // directory by that name) must not take the server down over css:
      // throwing from an error listener is an uncaught exception.
      if (err.code !== 'ENOENT') console.log(err);
      res.end('');
    })
    .pipe(res);
};
