//
//  reducer_settings_spec.js
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
const reduce = require('../../src/reducer');

// The settings half of the reducer: where a widget shows, on which screens, and
// in which layer. reducer_spec covers adding and removing widgets.
function stateWith(settings) {
  return {
    widgets: {'a-widget': {id: 'a-widget'}},
    settings: {'a-widget': settings || {}},
    screens: [1, 2],
  };
}

function settingsAfter(action, settings) {
  return reduce(stateWith(settings), action).settings['a-widget'];
}

test('showing a widget everywhere', (t) => {
  t.deepEqual(
    settingsAfter({type: 'WIDGET_SET_TO_ALL_SCREENS', payload: 'a-widget'}),
    {
      showOnAllScreens: true,
      showOnSelectedScreens: false,
      showOnMainScreen: false,
      hidden: false,
      screens: [],
    },
    'all screens, which clears the other choices and any screen list'
  );
  t.end();
});

test('showing a widget on chosen screens', (t) => {
  t.deepEqual(
    settingsAfter(
      {type: 'WIDGET_SET_TO_SELECTED_SCREENS', payload: 'a-widget'},
      {showOnAllScreens: true, showOnMainScreen: true, screens: [2]}
    ),
    {
      showOnSelectedScreens: true,
      showOnAllScreens: false,
      showOnMainScreen: false,
      hidden: false,
      screens: [2],
    },
    'the screen list decides, and it is kept'
  );
  t.end();
});

test('showing a widget on the main screen', (t) => {
  t.deepEqual(
    settingsAfter({type: 'WIDGET_SET_TO_MAIN_SCREEN', payload: 'a-widget'}),
    {
      showOnSelectedScreens: false,
      showOnAllScreens: false,
      showOnMainScreen: true,
      hidden: false,
      screens: [],
    },
    'the main screen only, and the screen list is cleared'
  );
  t.end();
});

test('moving a widget between layers', (t) => {
  t.deepEqual(
    settingsAfter({type: 'WIDGET_SET_TO_BACKGROUND', payload: 'a-widget'}),
    {inBackground: true},
    'to the back'
  );
  t.deepEqual(
    settingsAfter(
      {type: 'WIDGET_SET_TO_FOREGROUND', payload: 'a-widget'},
      {inBackground: true}
    ),
    {inBackground: false},
    'and to the front again'
  );
  t.end();
});

test('picking screens for a widget one at a time', (t) => {
  const first = settingsAfter({
    type: 'SCREEN_SELECTED_FOR_WIDGET',
    payload: {id: 'a-widget', screenId: 2},
  });
  t.deepEqual(first.screens, [2], 'the first screen is added');

  const again = settingsAfter(
    {type: 'SCREEN_SELECTED_FOR_WIDGET', payload: {id: 'a-widget', screenId: 2}},
    {screens: [2]}
  );
  t.deepEqual(again.screens, [2], 'selecting it twice does not repeat it');

  const both = settingsAfter(
    {type: 'SCREEN_SELECTED_FOR_WIDGET', payload: {id: 'a-widget', screenId: 3}},
    {screens: [2]}
  );
  t.deepEqual(both.screens, [2, 3], 'another screen joins the first');
  t.end();
});

test('unpicking a screen for a widget', (t) => {
  t.deepEqual(
    settingsAfter(
      {
        type: 'SCREEN_DESELECTED_FOR_WIDGET',
        payload: {id: 'a-widget', screenId: 2},
      },
      {screens: [2, 3]}
    ).screens,
    [3],
    'only that screen goes'
  );

  t.deepEqual(
    settingsAfter(
      {
        type: 'SCREEN_DESELECTED_FOR_WIDGET',
        payload: {id: 'a-widget', screenId: 2},
      },
      {}
    ).screens,
    [],
    'a widget with no screen list survives being unpicked'
  );
  t.end();
});

test('the screens themselves changing', (t) => {
  const state = reduce(stateWith(), {
    type: 'SCREENS_DID_CHANGE',
    payload: [7, 8, 9],
  });

  t.deepEqual(state.screens, [7, 8, 9], 'the new screen list is kept');
  t.deepEqual(
    state.settings,
    stateWith().settings,
    'and the widget settings are untouched'
  );
  t.end();
});

test('a widget finishing loading', (t) => {
  const impl = {render: () => 'hi'};
  const state = reduce(stateWith(), {
    type: 'WIDGET_LOADED',
    id: 'a-widget',
    payload: impl,
  });

  t.equal(
    state.widgets['a-widget'].implementation,
    impl,
    'the implementation is attached to the widget'
  );
  t.end();
});

test('a widget loading that is no longer there', (t) => {
  const state = stateWith();
  t.equal(
    reduce(state, {type: 'WIDGET_LOADED', id: 'gone', payload: {}}),
    state,
    'a widget removed while its bundle was loading is ignored'
  );
  t.end();
});

test('a widget setting being changed', (t) => {
  const first = reduce(stateWith(), {
    type: 'WIDGET_CONFIG_CHANGED',
    payload: {id: 'a-widget', key: 'size', value: 'large'},
  });
  t.deepEqual(
    first.settings['a-widget'].config,
    {size: 'large'},
    'the value is kept under config, away from hidden and screens'
  );

  const second = reduce(first, {
    type: 'WIDGET_CONFIG_CHANGED',
    payload: {id: 'a-widget', key: 'showCredits', value: false},
  });
  t.deepEqual(
    second.settings['a-widget'].config,
    {size: 'large', showCredits: false},
    'a second setting joins the first rather than replacing it'
  );

  const third = reduce(second, {
    type: 'WIDGET_CONFIG_CHANGED',
    payload: {id: 'a-widget', key: 'size', value: 'small'},
  });
  t.equal(third.settings['a-widget'].config.size, 'small', 'and can be changed');
  t.equal(
    third.settings['a-widget'].hidden,
    stateWith().settings['a-widget'].hidden,
    'without disturbing the other settings'
  );
  t.end();
});

test('a widget arriving with settings saved from last time', (t) => {
  const state = reduce(
    {widgets: {}, settings: {}, screens: []},
    {
      type: 'WIDGET_ADDED',
      payload: {
        id: 'a-widget',
        filePath: '/widgets/a-widget/index.tsx',
        savedConfig: {size: 'large'},
      },
    }
  );

  t.deepEqual(
    state.settings['a-widget'].config,
    {size: 'large'},
    'what was saved beside the widget is seeded'
  );

  // a rebuild must not undo a change made since the widget loaded
  const changed = reduce(state, {
    type: 'WIDGET_CONFIG_CHANGED',
    payload: {id: 'a-widget', key: 'size', value: 'small'},
  });
  const rebuilt = reduce(changed, {
    type: 'WIDGET_ADDED',
    payload: {
      id: 'a-widget',
      filePath: '/widgets/a-widget/index.tsx',
      savedConfig: {size: 'large'},
    },
  });

  t.equal(
    rebuilt.settings['a-widget'].config.size,
    'small',
    'so the file on disk does not win over a newer choice'
  );
  t.end();
});

test('an action the reducer does not know', (t) => {
  const state = stateWith();
  t.equal(
    reduce(state, {type: 'SOMETHING_ELSE'}),
    state,
    'the state comes back untouched, not a copy'
  );
  t.end();
});
