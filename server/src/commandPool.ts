'use strict';

type Headers = Record<string, string | string[] | undefined>;
type Response = {
  writeHead: (status: number) => void;
  write: (chunk: Buffer | string) => void;
  end: () => void;
  destroyed?: boolean;
  writableEnded?: boolean;
};
type Reading = {status: number; body: Buffer};
type Entry = {command: string; result: Promise<Reading>};

const MAX_CACHED_BYTES = 1024 * 1024;

module.exports = function commandPool() {
  const readings = new Map<string, Entry>();

  return function share(
    headers: Headers | undefined,
    command: string,
    response: Response,
    execute: (response: Response) => void,
  ) {
    const polling = readPolling(headers, command);
    if (!polling) {
      // an explicit read must not be followed by an older scheduled result
      readings.forEach((entry, key) => {
        if (entry.command === command) readings.delete(key);
      });
      return execute(response);
    }

    const send = (reading: Reading) => {
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(reading.status);
      response.write(reading.body);
      response.end();
    };
    const existing = readings.get(polling.key);
    if (existing) {
      existing.result.then(send);
      return;
    }

    let complete!: (reading: Reading) => void;
    const result = new Promise<Reading>((resolve) => {
      complete = resolve;
    });
    const started = Date.now();
    const chunks: Buffer[] = [];
    let status = 200;
    const entry = {command, result};
    readings.set(polling.key, entry);
    result.then(send);

    const captured: Response = {
      writeHead(code) {
        status = code;
      },
      write(chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      },
      end() {
        const body = Buffer.concat(chunks);
        chunks.length = 0;
        const remaining = polling.interval - (Date.now() - started);
        if (readings.get(polling.key) === entry) {
          if (
            status >= 400 ||
            remaining <= 0 ||
            body.length > MAX_CACHED_BYTES
          ) {
            readings.delete(polling.key);
          } else {
            // expiry starts with execution, not delivery, so collection time
            // does not add another interval to a view that joins late
            setTimeout(() => {
              if (readings.get(polling.key) === entry)
                readings.delete(polling.key);
            }, remaining).unref();
          }
        }
        complete({status, body});
      },
    };

    try {
      execute(captured);
    } catch (error) {
      captured.writeHead(500);
      captured.write(error instanceof Error ? error.message : String(error));
      captured.end();
    }
  };
};

function readPolling(headers: Headers | undefined, command: string) {
  const key = headers?.['x-gailan-poll-key'];
  const wait = headers?.['x-gailan-poll-interval'];
  if (typeof key !== 'string' || !key || key.length > 4096) return;
  if (typeof wait !== 'string') return;
  const interval = Number(wait);
  if (!Number.isFinite(interval) || interval <= 0 || interval > 2147483647)
    return;
  return {key: JSON.stringify([key, command, interval]), interval};
}
