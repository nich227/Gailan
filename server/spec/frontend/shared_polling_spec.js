'use strict';

const test = require('tape');
const sinon = require('sinon');
const fakeServer = require('nise').fakeServer;
const html = require('react').createElement;
const act = require('react').act;
const Widget = require('../../src/Widget');
const gailan = require('../../src/gailan.ts');
const pollingContext = require('../../src/pollingContext');

function header(request, name) {
  const entry = Object.entries(request.requestHeaders).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return entry && entry[1];
}

function build(command, config = {}, extra = {}) {
  return Widget({
    id: 'shared-widget',
    mtime: 'revision-one',
    filePath: '/widgets/shared-widget.tsx',
    config,
    implementation: Object.assign(
      {
        command,
        refreshFrequency: 1000,
        render: ({output}) => html('p', null, output),
      },
      extra,
    ),
  });
}

test('display copies tag their scheduled reads with the same context', async (t) => {
  const clock = sinon.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout'],
  });
  const server = fakeServer.create({respondImmediately: true});
  server.respondWith('POST', '/run/', [
    200,
    {'Content-Type': 'text/plain'},
    'shared reading',
  ]);
  const widgets = [1, 2, 3].map(() => build('read command', {country: 'US'}));
  const actEnvironment = global.IS_REACT_ACT_ENVIRONMENT;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    const elements = [];
    await act(async () => {
      elements.push(...widgets.map((widget) => widget.create()));
      await clock.tickAsync(40);
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
    });
    t.equal(server.requests.length, 3, 'each view requests the reading');
    const keys = server.requests.map((request) =>
      header(request, 'X-Gailan-Poll-Key'),
    );
    t.ok(keys[0], 'the request identifies a scheduled read');
    t.deepEqual(
      keys,
      [keys[0], keys[0], keys[0]],
      'the server can recognize copies across views',
    );
    t.deepEqual(
      JSON.parse(decodeURIComponent(keys[0])),
      ['shared-widget', 'revision-one', {country: 'US'}],
      'widget, revision and settings are scoped',
    );
    t.deepEqual(
      elements.map((el) => el.textContent),
      ['shared reading', 'shared reading', 'shared reading'],
      'each view renders its own result',
    );
  } finally {
    await act(async () => widgets.forEach((widget) => widget.destroy()));
    global.IS_REACT_ACT_ENVIRONMENT = actEnvironment;
    server.restore();
    clock.restore();
  }
  t.end();
});

test('shell reads inside a command function inherit only its synchronous scope', async (t) => {
  const clock = sinon.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout'],
  });
  const server = fakeServer.create({respondImmediately: true});
  server.respondWith('POST', '/run/', [
    200,
    {'Content-Type': 'text/plain'},
    'reading',
  ]);
  const widget = build(function command() {
    this.refreshFrequency = 10000;
    return gailan.run('read command');
  });
  try {
    widget.create();
    await clock.tickAsync(40);
    t.equal(
      header(server.requests[0], 'X-Gailan-Poll-Interval'),
      '10000',
      'the command can choose its interval before issuing a read',
    );
    t.ok(
      header(server.requests[0], 'X-Gailan-Poll-Key'),
      'the scheduled function read is shared',
    );
    await gailan.run('interactive command');
    t.notOk(
      header(server.requests[1], 'X-Gailan-Poll-Key'),
      'a later direct action is not shared',
    );
    widget.forceRefresh();
    await clock.tickAsync(40);
    t.notOk(
      header(server.requests[2], 'X-Gailan-Poll-Key'),
      'an explicit refresh bypasses the scheduled reading',
    );
  } finally {
    widget.destroy();
    server.restore();
    clock.restore();
  }
  t.end();
});

test('different settings and per-screen commands are not shared', async (t) => {
  const clock = sinon.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout'],
  });
  const server = fakeServer.create({respondImmediately: true});
  server.respondWith('POST', '/run/', [
    200,
    {'Content-Type': 'text/plain'},
    'reading',
  ]);
  const widgets = [
    build('read command', {country: 'US'}),
    build('read command', {country: 'CA'}),
    build('read command', {}, {commandScope: 'screen'}),
  ];
  try {
    widgets.forEach((widget) => widget.create());
    await clock.tickAsync(40);
    t.notEqual(
      header(server.requests[0], 'X-Gailan-Poll-Key'),
      header(server.requests[1], 'X-Gailan-Poll-Key'),
      'settings produce different read contexts',
    );
    t.notOk(
      header(server.requests[2], 'X-Gailan-Poll-Key'),
      'a widget can retain per-screen shell execution',
    );
  } finally {
    widgets.forEach((widget) => widget.destroy());
    server.restore();
    clock.restore();
  }
  t.end();
});

test('a function command can remove itself without leaving a polling scope', async (t) => {
  const clock = sinon.useFakeTimers({
    toFake: ['Date', 'setTimeout', 'clearTimeout'],
  });
  let runs = 0;
  const widget = build(function command() {
    runs += 1;
    this.command = undefined;
    return 'first reading';
  });
  try {
    widget.create();
    await clock.tickAsync(1100);
    t.equal(runs, 1, 'the removed command does not run on the next tick');
    t.notOk(
      pollingContext.headers(),
      'the empty command path restores its context',
    );
  } finally {
    widget.destroy();
    clock.restore();
  }
  t.end();
});

test('polling scopes restore after nested calls, errors and promise callbacks', async (t) => {
  const implementation = {refreshFrequency: 1000};
  const context = {
    id: 'widget',
    revision: 'one',
    config: {label: '概览'},
    implementation,
  };
  t.notOk(
    pollingContext.headers(),
    'there is no scope outside a scheduled command',
  );
  pollingContext.run(context, () => {
    const outer = pollingContext.headers();
    t.deepEqual(
      JSON.parse(decodeURIComponent(outer['X-Gailan-Poll-Key'])),
      ['widget', 'one', {label: '概览'}],
      'unicode settings are encoded for HTTP headers',
    );
    pollingContext.run({...context, id: 'another-widget'}, () =>
      t.notDeepEqual(
        pollingContext.headers(),
        outer,
        'nested scopes are distinct',
      ),
    );
    t.deepEqual(pollingContext.headers(), outer, 'the outer scope is restored');
  });
  t.throws(
    () =>
      pollingContext.run(context, () => {
        throw new Error('broken');
      }),
    /broken/,
    'errors propagate',
  );
  t.notOk(
    pollingContext.headers(),
    'the failed command did not leave its scope behind',
  );
  await pollingContext.run(context, () =>
    Promise.resolve().then(() =>
      t.notOk(
        pollingContext.headers(),
        'a later promise callback is not silently classified as polling',
      ),
    ),
  );
  t.end();
});

test('one-shot, invalid and oversized polling scopes use ordinary execution', (t) => {
  const context = {
    id: 'widget',
    config: {},
    implementation: {refreshFrequency: 1000},
  };
  const variants = [
    {...context, forced: true},
    {
      ...context,
      implementation: {refreshFrequency: 1000, commandScope: 'screen'},
    },
    ...[false, '1000', 0, -1, NaN, Infinity, 2147483648].map(
      (refreshFrequency) => ({...context, implementation: {refreshFrequency}}),
    ),
    {...context, config: {text: 'a'.repeat(5000)}},
  ];
  variants.forEach((variant) =>
    pollingContext.run(variant, () =>
      t.notOk(
        pollingContext.headers(),
        'the scope does not opt in to result sharing',
      ),
    ),
  );
  t.end();
});
