//
//  actions_spec.js
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
const actions = require('../../src/actions');

test('a widget appearing', (t) => {
  const action = actions.get({
    type: 'added',
    widget: {
      id: 'a-widget',
      filePath: '/widgets/a-widget.jsx',
      error: null,
      mtime: 1234,
      body: 'the bundle, which has no business in the store',
    },
  });

  t.deepEqual(
    action,
    {
      type: 'WIDGET_ADDED',
      payload: {
        id: 'a-widget',
        filePath: '/widgets/a-widget.jsx',
        error: null,
        mtime: 1234,
        // these travel with the widget from its manifest; this one has none
        settingsSchema: undefined,
        title: undefined,
        savedConfig: undefined,
        dependencies: undefined,
      },
    },
    'carries what the store needs and leaves the source behind'
  );
  t.end();
});

test('a widget going away', (t) => {
  t.deepEqual(
    actions.get({type: 'removed', id: 'a-widget'}),
    {type: 'WIDGET_REMOVED', payload: 'a-widget'},
    'names the widget that left'
  );
  t.end();
});

test('an event we have no action for', (t) => {
  t.equal(
    actions.get({type: 'something-else'}),
    undefined,
    'produces nothing, so the caller dispatches nothing'
  );
  t.end();
});

test('a widget finishing loading in the page', (t) => {
  const impl = {render: () => 'hi'};

  t.deepEqual(
    actions.showWidget('a-widget', impl),
    {type: 'WIDGET_LOADED', id: 'a-widget', payload: impl},
    'hands the implementation to the store'
  );
  t.end();
});

test('a widget setting being changed', (t) => {
  t.deepEqual(
    actions.setWidgetConfig('a-widget', 'size', 'large'),
    {
      type: 'WIDGET_CONFIG_CHANGED',
      payload: {id: 'a-widget', key: 'size', value: 'large'},
    },
    'names the widget, the setting and the new value'
  );

  t.deepEqual(
    actions.setWidgetConfig('a-widget', 'showCredits', false).payload.value,
    false,
    'and false survives, rather than being treated as absent'
  );
  t.end();
});

test('settings arriving for a widget', (t) => {
  t.deepEqual(
    actions.applyWidgetSettings('a-widget', {hidden: true}),
    {
      type: 'WIDGET_SETTINGS_CHANGED',
      payload: {id: 'a-widget', settings: {hidden: true}},
    },
    'keeps the id alongside the settings'
  );
  t.end();
});
