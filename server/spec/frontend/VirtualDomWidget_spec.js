//
//  VirtualDomWidget_spec.js
//  Gailan
//
//  Copyright (c) 2026 Kevin Chen.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//
'use strict';

const test = require('tape');
const html = require('react').createElement;
const Widget = require('../../src/Widget.js');

// The jsx and tsx widgets, which render through React rather than by setting
// innerHTML. Widget() picks this implementation from the file extension.
function build(implementation, extra) {
  return Widget(
    Object.assign(
      {
        id: 'react-widget',
        filePath: '/widgets/react-widget.jsx',
        implementation: implementation,
      },
      extra
    )
  );
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve, 60));
}

test('a jsx widget renders its output', async (t) => {
  const widget = build({
    // a function command hands back the output, which updateState turns into
    // the render's props
    command: () => 'hello',
    render: ({output}) => html('h1', null, output),
  });

  const el = widget.create();
  await settle();

  t.equal(el.id, 'react-widget', 'the element carries the widget id');
  t.ok(el.classList.contains('widget'), 'and the widget class');
  t.equal(
    el.querySelector('h1') && el.querySelector('h1').textContent,
    'hello',
    'the command output reaches render'
  );

  widget.destroy();
  t.end();
});

test('a widget with no command still renders', async (t) => {
  const widget = build({
    render: () => html('p', null, 'nothing to run'),
  });

  const el = widget.create();
  await settle();

  t.equal(
    el.querySelector('p').textContent,
    'nothing to run',
    'the default state is rendered'
  );

  widget.destroy();
  t.end();
});

test('replacing a widget implementation', async (t) => {
  const widget = build({
    render: () => html('p', null, 'before'),
  });

  const el = widget.create();
  await settle();
  t.equal(el.querySelector('p').textContent, 'before', 'the first version');

  widget.update({
    id: 'react-widget',
    filePath: '/widgets/react-widget.jsx',
    implementation: {
      className: 'top: 10px',
      render: () => html('p', null, 'after'),
    },
  });
  await settle();

  t.equal(
    el.querySelector('p').textContent,
    'after',
    'the replacement renders into the same element'
  );
  t.ok(el.className.indexOf('css-') > -1, 'and its className is applied');

  widget.destroy();
  t.end();
});

test('destroying a widget takes it off the page', async (t) => {
  const widget = build({render: () => html('p', null, 'here')});
  const el = widget.create();
  await settle();

  t.ok(document.body.contains(el), 'it is on the page');
  widget.destroy();
  await settle();

  t.notOk(document.body.contains(el), 'and gone once destroyed');
  t.end();
});

test('a widget whose render throws shows the error', async (t) => {
  // the error view asks the server which source line to blame
  const realFetch = global.fetch;
  let asked = null;
  global.fetch = (url) => {
    asked = url;
    return Promise.resolve({
      json: () =>
        Promise.resolve({
          path: 'react-widget.jsx',
          line: 2,
          column: 1,
          lines: [
            {lineNum: 1, line: 'export const render = () => {'},
            {lineNum: 2, line: '  throw new Error("boom");'},
            {lineNum: 3, line: '};'},
          ],
        }),
    });
  };

  const widget = build({
    render: () => {
      throw new Error('boom');
    },
  });

  const el = widget.create();
  await settle();
  await settle();

  t.ok(asked && String(asked).indexOf('/widgets/react-widget') === 0,
    'it asks about its own bundle');
  t.ok(
    el.textContent.indexOf('boom') > -1,
    'the message is on screen'
  );
  t.ok(
    el.textContent.indexOf('throw new Error') > -1,
    'along with the offending source'
  );
  t.ok(
    el.querySelectorAll('tr').length >= 3,
    'one row per source line'
  );
  t.ok(
    el.querySelector('em'),
    'and the column is marked within the failing line'
  );
  t.equal(
    el.querySelectorAll('em').length,
    1,
    'only on the line that failed'
  );

  global.fetch = realFetch;
  widget.destroy();
  t.end();
});

test('a widget that arrives already broken', async (t) => {
  const realFetch = global.fetch;
  global.fetch = () => Promise.reject(new Error('should not be asked'));

  const widget = build(
    {render: () => html('p', null, 'never rendered')},
    {
      error: JSON.stringify({
        message: 'could not bundle',
        path: 'react-widget.jsx',
        line: 1,
        column: 0,
        lines: [{lineNum: 1, line: 'this is not javascript'}],
      }),
    }
  );

  const el = widget.create();
  await settle();

  t.ok(
    el.textContent.indexOf('could not bundle') > -1,
    'the bundling error is shown without asking the server'
  );

  global.fetch = realFetch;
  widget.destroy();
  t.end();
});

test('forcing a refresh reruns the command', async (t) => {
  let runs = 0;
  const widget = build({
    command: () => {
      runs += 1;
      return 'run ' + runs;
    },
    render: ({output}) => html('p', null, output),
  });

  const el = widget.create();
  await settle();
  t.equal(runs, 1, 'the command ran once on create');

  widget.forceRefresh();
  await settle();
  t.ok(runs > 1, 'and again when refreshed');

  widget.destroy();
  t.end();
});

test('a widget receives its own settings', async (t) => {
  const seen = [];
  const widget = build(
    {
      render: ({settings}) => {
        seen.push(settings);
        return html('p', null, String((settings || {}).size));
      },
    },
    {
      // what the manifest declared, and what the user has chosen
      settingsSchema: [
        {key: 'size', type: 'choice', default: 'medium'},
        {key: 'showCredits', type: 'toggle', default: true},
      ],
      config: {size: 'large'},
    }
  );

  const el = widget.create();
  await settle();

  t.equal(el.querySelector('p').textContent, 'large', 'the chosen value wins');
  t.deepEqual(
    seen[seen.length - 1],
    {size: 'large', showCredits: true},
    'and a setting left alone falls back to the manifest default'
  );

  widget.destroy();
  t.end();
});

test('a widget with no settings at all', async (t) => {
  const seen = [];
  const widget = build({
    render: ({settings}) => {
      seen.push(settings);
      return html('p', null, 'no settings');
    },
  });

  const el = widget.create();
  await settle();

  t.deepEqual(seen[seen.length - 1], {}, 'gets an empty object, not undefined');
  t.equal(el.querySelector('p').textContent, 'no settings');

  widget.destroy();
  t.end();
});

test('changing a setting redraws the widget', async (t) => {
  const drawn = [];
  const implementation = {
    render: ({settings}) => {
      drawn.push((settings || {}).size);
      return html('p', null, String((settings || {}).size));
    },
  };

  const widget = build(implementation, {
    settingsSchema: [{key: 'size', type: 'choice', default: 'medium'}],
    config: {size: 'small'},
  });

  const el = widget.create();
  await settle();
  t.equal(drawn[drawn.length - 1], 'small', 'drawn with the first value');

  widget.update({
    id: 'react-widget',
    filePath: '/widgets/react-widget.jsx',
    implementation: implementation,
    settingsSchema: [{key: 'size', type: 'choice', default: 'medium'}],
    config: {size: 'large'},
  });
  await settle();

  t.equal(
    el.querySelector('p').textContent,
    'large',
    'and redrawn when the setting changes'
  );

  widget.destroy();
  t.end();
});

// The error details come back from the server a moment after the error itself. A widget
// reloaded or taken off the page in that moment used to throw where nothing could catch
// it, which stopped every other widget on the page. Saving a widget that throws is
// enough to reach it.
test('a widget taken off the page while its error is in flight is quiet', async (t) => {
  const widget = build({
    command: () => 'anything',
    render: () => {
      throw new Error('deliberately broken');
    },
  });

  // The details are handed over only when this says so, which puts the widget's
  // removal squarely inside the window rather than hoping to land in it.
  const realFetch = global.fetch;
  let handOverDetails = null;
  global.fetch = () =>
    new Promise((resolve) => {
      handOverDetails = () =>
        resolve({
          json: () =>
            Promise.resolve({
              path: 'react-widget.jsx',
              line: 1,
              column: 1,
              lines: [{lineNum: 1, line: 'throw new Error("deliberately broken");'}],
            }),
        });
    });

  const uncaught = [];
  const onError = (thrown) => {
    uncaught.push(String((thrown && thrown.message) || thrown));
  };
  process.on('unhandledRejection', onError);
  process.on('uncaughtException', onError);

  widget.create();
  await settle();
  t.ok(handOverDetails, 'the widget asked the server about its error');

  // off the page, with the answer still on its way
  widget.destroy();
  handOverDetails();
  await settle();
  await settle();
  await new Promise((resolve) => setImmediate(resolve));

  process.removeListener('unhandledRejection', onError);
  process.removeListener('uncaughtException', onError);
  global.fetch = realFetch;

  t.deepEqual(uncaught, [], 'nothing was thrown out of the widget');
  t.end();
});

test('a widget that was never put on the page does not draw', async (t) => {
  const widget = build({
    command: () => 'hello',
    render: ({output}) => html('h1', null, output),
  });

  // no create, so there is nowhere to draw
  t.doesNotThrow(() => widget.destroy(), 'and taking it away is still fine');
  t.end();
});
