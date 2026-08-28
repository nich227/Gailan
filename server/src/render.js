var Widget = require('./Widget');
var rendered = {};

function isVisibleOnScreen(widgetId, screenId, state) {
  var settings = state.settings[widgetId] || {};
  var isVisible = false;

  if (settings.hidden) {
    isVisible = false;
  } else if (
    settings.showOnAllScreens ||
    settings.showOnAllScreens === undefined
  ) {
    isVisible = true;
  } else if (settings.showOnMainScreen) {
    isVisible = state.screens[0] === screenId;
  } else if (settings.showOnSelectedScreens) {
    isVisible = (settings.screens || []).indexOf(screenId) !== -1;
  }

  return isVisible;
}

function isInBackground(widgetId, state) {
  const settings = state.settings[widgetId] || {};
  return settings.inBackground === true;
}

function sameConfig(a, b) {
  return JSON.stringify(a || {}) === JSON.stringify(b || {});
}

function renderWidget(widget, domEl) {
  var prevRendered = rendered[widget.id];

  if (
    prevRendered &&
    prevRendered.widget.mtime === widget.mtime &&
    // a settings change has to redraw even though the file has not moved
    sameConfig(prevRendered.widget.config, widget.config)
  ) {
    return;
  } else if (prevRendered) {
    prevRendered.instance.update(widget);
    prevRendered.widget = widget;
  } else {
    var instance = Widget(widget);
    domEl.appendChild(instance.create());
    rendered[widget.id] = {
      instance: instance,
      widget: widget,
    };
  }
}

function destroyWidget(id) {
  rendered[id].instance.destroy();
  delete rendered[id];
}

function render(state, screen, domEl, dispatch) {
  const remaining = new Set(Object.keys(rendered));

  for (var id in state.widgets) {
    // the widget's own settings ride along, so it can render differently
    // without its file changing
    const settings = state.settings[id] || {};
    const widget = Object.assign({}, state.widgets[id], {
      config: settings.config || {},
    });

    if (!isVisibleOnScreen(id, screen.id, state)) continue;

    if (
      screen.layer &&
      (screen.layer === 'background') != isInBackground(id, state)
    )
      continue;

    if (widget.error || widget.implementation)
      renderWidget(widget, domEl, dispatch);

    remaining.delete(widget.id);
  }

  remaining.forEach((obsolete) => destroyWidget(obsolete));
}

render.rendered = rendered;
module.exports = render;
