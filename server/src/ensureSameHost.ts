import type {IncomingMessage, ServerResponse} from 'node:http';

type Next = (err?: unknown) => void;

module.exports = function ensureSameHost(host: string) {
    return ((req: IncomingMessage, res: ServerResponse, next: Next) => {
        if (req.headers.host && req.headers.host === host) {
            return next()
        }
        res.writeHead(400)
        res.end()
    })
}
