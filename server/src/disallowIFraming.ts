import type {IncomingMessage, ServerResponse} from 'node:http';

type Next = (err?: unknown) => void;

module.exports = function disallowIFraming(
  req: IncomingMessage,
  res: ServerResponse,
  next: Next
) {
  res.setHeader('X-Frame-Options', 'sameorigin');
  next();
};
