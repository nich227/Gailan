//
//  client.ts
//  Gailan
//
//  Copyright (c) 2026 Kevin Chen.
//  Based on code by Felix Hageloh.
//
//  Released under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version. See <http://www.gnu.org/licenses/> for
//  details.
//
'use strict';

const redux = require('redux');
const $ = require('jquery');
(window as any).$ = $;

const reducer = require('./src/reducer');
const listenToRemote = require('./src/listen');
const sharedSocket = require('./src/SharedSocket');
const render = require('./src/render');
const actions = require('./src/actions');
const detectWidgetHover = require('./src/detectWidgetHover');
const reportGlassRegions = require('./src/reportGlassRegions');

let userCssLink: HTMLLinkElement | null = null;

type ScreenInfo = {
  id: number;
  layer: string;
};

// Widget bundles ask for these by name. browserify used to expose its own
// require for that; esbuild does not, so the registry is explicit.
const hostModules: {[name: string]: unknown} = {
  gailan: require('./src/gailan.ts'),
  uebersicht: require('./src/legacyAlias.ts'),
};

(globalThis as any).require = (name: string): unknown => {
  if (name in hostModules) return hostModules[name];
  throw new Error(`Cannot find module '${name}'`);
};

// widgets style against this instead of guessing: html[data-appearance="dark"]
function applyAppearance(): void {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.appearance = dark ? 'dark' : 'light';
}

window.onload = () => {
  applyAppearance();
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', applyAppearance);
  sharedSocket.open(`ws://${window.location.host}`);

  const path = window.location.pathname.split('/');
  const screen: ScreenInfo = {
    id: Number(path[1]),
    layer: path[2],
  };
  const contentEl = document.getElementById('gailan') as HTMLElement;
  contentEl.innerHTML = '';
  userCssLink = (Array.from(document.querySelectorAll('link')) as
    HTMLLinkElement[]).find((el) => el.href.match('userMain.css')) ?? null;

  detectWidgetHover(contentEl);
  reportGlassRegions.watch();

  document.addEventListener(
    'mousedown',
    () => {
      document.documentElement.dataset.widgetFocus = 'widget';
      window.dispatchEvent(new window.CustomEvent('gailan:focus'));
    },
    true
  );

  getState((err: unknown, initialState: any) => {
    // upstream carried on from here and dereferenced a null state, throwing
    // before the reload it had just scheduled could happen
    if (err != null) {
      bail(err, 10000);
      return;
    }

    const store = redux.createStore(reducer, initialState);

    Object.keys(initialState.widgets).forEach((id) => {
      fetchWidget(id).then((widgetImpl) =>
        store.dispatch(actions.showWidget(id, widgetImpl))
      );
    });

    let prevState: any = null;
    store.subscribe(() => {
      const nextState = store.getState();
      if (nextState === prevState) return;
      render(store.getState(), screen, contentEl, store.dispatch);
      reportGlassRegions();
      prevState = nextState;
    });

    listenToRemote((action: any) => {
      if (action.type === 'WIDGET_WANTS_REFRESH') {
        render.rendered[action.payload]?.instance?.forceRefresh();
      } else if (action.type === 'WIDGET_ADDED') {
        store.dispatch(action);
        if (action.payload.error) return;
        fetchWidget(action.payload.id).then((widgetImpl) =>
          store.dispatch(actions.showWidget(action.payload.id, widgetImpl))
        );
      } else if (action.type === 'WIDGETS_BLURRED') {
        // the app saw a click land somewhere that is not a widget, or lost
        // frontmost. widgets style off the attribute or listen for the event.
        document.documentElement.dataset.widgetFocus = 'none';
        window.dispatchEvent(new window.CustomEvent('gailan:blur'));
      } else if (action.type === 'MASTER_STYLE_CHANGED') {
        reloadUserCSS();
      } else {
        store.dispatch(action);
      }
    });

    render(initialState, screen, contentEl, store.dispatch);
  });
};

// legacy
(window as any).gailan = {
  makeBgSlice: () => {
    console.warn(
      'makeBgSlice has been deprecated. Please use CSS backdrop-filter ' +
        'instead: https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter'
    );
  },
};

window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

function getState(callback: (err: unknown, state: any) => void): void {
  $.get('/state/')
    .done((response: string) => callback(null, JSON.parse(response)))
    // the failure used to report a variable that was not in scope here
    .fail((request: unknown) => callback(request, null));
}

function fetchWidget(id: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const scriptTag = document.createElement('script');
    scriptTag.id = id;
    scriptTag.src = '/widgets/' + id;
    scriptTag.onload = () => {
      document.head.removeChild(scriptTag);
      resolve((globalThis as any).__gailanWidgets?.[id]);
    };
    scriptTag.onerror = (err) => {
      document.head.removeChild(scriptTag);
      reject(err);
    };
    document.head.appendChild(scriptTag);
  });
}

function reloadUserCSS(): void {
  if (!userCssLink) return;
  const href = userCssLink.href.split('?')[0];
  userCssLink.href = `${href}?${new Date().getTime()}`;
}

function bail(err: unknown, timeout = 0): void {
  if (err != null) console.log(err);
  setTimeout(() => {
    window.location.reload();
  }, timeout);
}
