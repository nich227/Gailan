'use strict';

// middleware to serve the current state
module.exports = (store) => (req, res, next) => {
  // the path only: the request carries a token in its query string
  const {pathname} = new URL(req.url, 'http://localhost');
  if (pathname === '/state/') {
    res.end(JSON.stringify(store.getState()));
  } else {
    next();
  }
};
