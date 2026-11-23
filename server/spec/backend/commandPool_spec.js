'use strict';

const test = require('tape');
const sinon = require('sinon');
const commandPool = require('../../src/commandPool.ts');

function response(extra = {}) {
  const value = {status: null, chunks: [], ended: false};
  return Object.assign(
    value,
    {
      writeHead(status) {
        value.status = status;
      },
      write(chunk) {
        value.chunks.push(chunk);
      },
      end() {
        value.ended = true;
      },
    },
    extra,
  );
}

const HEADERS = {
  'x-gailan-poll-key': 'widget-context',
  'x-gailan-poll-interval': '1000',
};

test('pooling accepts only bounded scheduled-read metadata', (t) => {
  const pool = commandPool();
  const invalid = [
    undefined,
    {},
    {...HEADERS, 'x-gailan-poll-key': []},
    {...HEADERS, 'x-gailan-poll-key': ''},
    {...HEADERS, 'x-gailan-poll-key': 'a'.repeat(4097)},
    {...HEADERS, 'x-gailan-poll-interval': undefined},
    {...HEADERS, 'x-gailan-poll-interval': []},
    ...['NaN', 'Infinity', '0', '-1', '2147483648'].map((wait) => ({
      ...HEADERS,
      'x-gailan-poll-interval': wait,
    })),
  ];
  invalid.forEach((headers) => {
    const target = response();
    pool(headers, 'read', target, (actual) =>
      t.equal(actual, target, 'invalid metadata preserves ordinary execution'),
    );
  });
  t.end();
});

test('an in-flight read is shared and an expired slow read is not retained', async (t) => {
  const clock = sinon.useFakeTimers();
  const pool = commandPool();
  const first = response();
  const second = response();
  let captured;
  try {
    pool(HEADERS, 'read', first, (target) => {
      captured = target;
    });
    pool(HEADERS, 'read', second, () =>
      t.fail('a second execution must not start'),
    );
    captured.writeHead(200);
    captured.write('first ');
    captured.write(Buffer.from('reading'));
    clock.tick(1000);
    captured.end();
    await Promise.resolve();
    t.equal(
      Buffer.concat(first.chunks).toString(),
      'first reading',
      'the first view receives every chunk',
    );
    t.equal(
      Buffer.concat(second.chunks).toString(),
      'first reading',
      'the waiting view receives identical chunks',
    );
    let reran = false;
    pool(HEADERS, 'read', response(), (target) => {
      reran = true;
      target.end();
    });
    t.ok(reran, 'an already-expired read is not retained');
  } finally {
    clock.restore();
  }
  t.end();
});

test('closed views do not receive a late reading', async (t) => {
  const clock = sinon.useFakeTimers();
  try {
    for (const extra of [{destroyed: true}, {writableEnded: true}]) {
      const target = response(extra);
      commandPool()(HEADERS, 'read', target, (capture) => capture.end());
      await Promise.resolve();
      t.notOk(target.ended, 'there is no write into a closed response');
    }
  } finally {
    clock.restore();
  }
  t.end();
});

test('large readings are delivered but not retained', async (t) => {
  const pool = commandPool();
  const large = Buffer.alloc(1024 * 1024 + 1, 'x');
  const first = response();
  pool(HEADERS, 'read', first, (target) => {
    target.write(large);
    target.end();
  });
  await Promise.resolve();
  t.equal(
    first.chunks[0].length,
    large.length,
    'the full reading reaches the view',
  );
  let reran = false;
  pool(HEADERS, 'read', response(), (target) => {
    reran = true;
    target.end();
  });
  await Promise.resolve();
  t.ok(reran, 'a large reading is collected again rather than cached');
  t.end();
});

test('synchronous execution failures settle every response and allow recovery', async (t) => {
  const pool = commandPool();
  for (const error of [new Error('cannot execute'), 'cannot execute']) {
    const target = response();
    pool(HEADERS, 'read', target, () => {
      throw error;
    });
    await Promise.resolve();
    t.equal(target.status, 500, 'the execution failure is returned');
    t.equal(
      target.chunks[0].toString(),
      'cannot execute',
      'the failure has a message',
    );
  }
  t.end();
});

test('an old expiry cannot discard a newer reading after an explicit refresh', async (t) => {
  const clock = sinon.useFakeTimers();
  const pool = commandPool();
  let executions = 0;
  const execute = (target) => {
    executions += 1;
    target.end();
  };
  try {
    pool(HEADERS, 'read', response(), execute);
    await Promise.resolve();
    clock.tick(200);
    pool(undefined, 'read', response(), execute);
    pool(HEADERS, 'read', response(), execute);
    await Promise.resolve();
    clock.tick(800);
    pool(HEADERS, 'read', response(), execute);
    t.equal(executions, 3, 'the replacement survives the old expiry');
    clock.tick(200);
    pool(HEADERS, 'read', response(), execute);
    await Promise.resolve();
    t.equal(executions, 4, 'its own expiry allows a new execution');
  } finally {
    clock.restore();
  }
  t.end();
});

test('a direct command does not invalidate unrelated reads', async (t) => {
  const clock = sinon.useFakeTimers();
  const pool = commandPool();
  let executions = 0;
  const execute = (target) => {
    executions += 1;
    target.end();
  };
  try {
    pool(HEADERS, 'first', response(), execute);
    pool(undefined, 'second', response(), execute);
    pool(HEADERS, 'first', response(), execute);
    await Promise.resolve();
    t.equal(executions, 2, 'the first reading remains reusable');
  } finally {
    clock.restore();
  }
  t.end();
});

test('invalidating an in-flight reading does not restore its cache entry later', async (t) => {
  const clock = sinon.useFakeTimers();
  const pool = commandPool();
  let first;
  try {
    pool(HEADERS, 'read', response(), (target) => {
      first = target;
    });
    pool(undefined, 'read', response(), (target) => target.end());
    first.end();
    await Promise.resolve();
    let reran = false;
    pool(HEADERS, 'read', response(), (target) => {
      reran = true;
      target.end();
    });
    await Promise.resolve();
    t.ok(reran, 'the invalidated result is not restored');
  } finally {
    clock.restore();
  }
  t.end();
});
