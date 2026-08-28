'use strict';

import type {IncomingMessage, ServerResponse} from 'node:http';

type Store = {getState: () => unknown};
type Next = (err?: unknown) => void;

// middleware to serve the current state
module.exports =
  (store: Store) =>
  (req: IncomingMessage, res: ServerResponse, next: Next) => {
  // the path only: the request carries a token in its query string
    const {pathname} = new URL(req.url || '/', 'http://localhost');
    if (pathname === '/state/') {
      res.end(JSON.stringify(store.getState()));
    } else {
      next();
    }
  };
