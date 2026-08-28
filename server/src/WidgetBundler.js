'use strict';

const esbuild = require('esbuild');
const bundleWidget = require('./esbuildWidget');
const readWidgetSettings = require('./readWidgetSettings');
const widgetConfigFile = require('./widgetConfigFile');
const fs = require('fs');

module.exports = function WidgetBundler() {
  const api = {};
  const bundles = {};

  api.push = function push(action, callback) {
    if (action && action.type) {
      action.type === 'added'
        ? addWidget(action.id, action.filePath, callback)
        : removeWidget(action.id, action.filePath, callback)
        ;
    }
  };

  api.close = function close() {
    for (var id in bundles) {
      bundles[id].close();
      delete bundles[id];
    }
    // esbuild does its work in a child process that it starts on the first build
    // and keeps for the next one. Nothing else ends it, so without this the
    // process stays alive until esbuild's own idle timeout, which is why a test
    // run that finished every assertion could still sit for two minutes.
    esbuild.stop();
  };

  api.get = function get(id) {
    return bundles[id].widget.body;
  };

  function addWidget(id, filePath, emit) {
    if (!bundles[id]) {
      bundles[id] = WidgetBundle(id, filePath, (widget) => {
        emit({type: 'added', widget: widget});
      });
    }
  }

  function removeWidget(id, filePath, emit) {
    if (bundles[id]) {
      bundles[id].close();
      delete bundles[id];
      emit({type: 'removed', id: id});
    }
  }

  function WidgetBundle(id, filePath, callback) {
    const bundle = bundleWidget(id, filePath);
    let closed = false;

    // once a widget is gone, nothing it has in flight should still report
    const closeBundle = bundle.close;
    bundle.close = () => {
      closed = true;
      closeBundle();
    };

    const buildWidget = (paths = []) => {
      if (closed) return;

      const widget = {
        id: id,
        filePath: filePath,
        // what the widget says it can be configured with, what it should be
        // called, and what the user last chose
        settingsSchema: readWidgetSettings(filePath),
        title: readWidgetSettings.titleFor(filePath),
        savedConfig: widgetConfigFile.read(filePath),
      };

      fs.access(filePath, fs.constants.R_OK, (couldNotRead) => {
        if (couldNotRead || closed) return;
        bundle.bundle((err, srcBuffer) => {
          if (closed) return;
          if (err) {
            widget.error = errorJSON(filePath, err);
          } else {
            widget.body = srcBuffer.toString();
          }

          fs.stat(paths[0] || filePath, (statErr, stat) => {
            // the file can be deleted between bundling and this stat. throwing
            // here used to take the whole server down with it.
            if (statErr || closed) return;
            widget.mtime = stat.mtime;
            bundle.widget = widget;
            callback(widget);
          });
        });
      });
    };

    bundle.on('update', buildWidget);
    buildWidget();
    return bundle;
  }

  // esbuild's failures, normalized by esbuildWidget. The babel shape this used
  // to also handle went away with babel.
  function errorJSON(filePath, error) {
    return JSON.stringify({
      line: error.line,
      column: error.column,
      path: filePath,
      lines: error.annotated,
      message: error.message,
    });
  }

  return api;
};
