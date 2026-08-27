const fs = require('fs');
const path = require('path');

module.exports = (widgetsDir) => (req, res, next) => {
  // the base is only there to satisfy the URL parser; requests are relative
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/userMain.css') return next();

  fs.createReadStream(path.join(widgetsDir, 'main.css'))
    .on('error', (err) => {
      // no main.css is the normal case. Anything else (permissions, a
      // directory by that name) must not take the server down over css:
      // throwing from an error listener is an uncaught exception.
      if (err.code !== 'ENOENT') console.log(err);
      res.end('');
    })
    .pipe(res);
};
